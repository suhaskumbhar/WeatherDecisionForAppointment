var http = require("http");
var https = require("https");
var fs = require("fs");
var KEY = process.env.OPENWEATHER_API_KEY || fs.readFileSync(".env","utf8").trim().split("=")[1];
var PORT = process.env.PORT || 3000;

function api(url, cb) {
  https.get(url, function (res) {
    var body = "";
    res.on("data", function (c) { body += c; });
    res.on("end", function () {
      var json = JSON.parse(body);
      if (json.cod && json.cod != "200") return cb(json.message);
      cb(null, json);
    });
  }).on("error", cb);
}

function forecast(appt, cb) {
  var zipUrl = "https://api.openweathermap.org/geo/1.0/zip?zip=" +
    appt.postalCode + "," + appt.country + "&appid=" + KEY;

  api(zipUrl, function (err, loc) {
    if (err) return cb(err);

    var url = "https://api.openweathermap.org/data/2.5/forecast?lat=" +
      loc.lat + "&lon=" + loc.lon + "&units=metric&appid=" + KEY;

    api(url, cb);
  });
}

function rain(list, start, end) {
  for (var i = 0; i < list.length; i++) {
    var t = new Date(list[i].dt_txt.replace(" ", "T"));
    var w = list[i].weather[0].main.toLowerCase();

    if (t >= start && t <= end && w.indexOf("rain") >= 0) return true;
  }
  return false;
}

function highWind(list, start, end) {
  for (var i = 0; i < list.length; i++) {
    var t = new Date(list[i].dt_txt.replace(" ", "T"));

    if (t >= start && t <= end) {
      var mph = list[i].wind.speed * 2.237; // OpenWeather gives m/s
      if (mph > 10) return true;
    }
  }
  return false;
}

function windAtSlot(list, start) {
  for (var i = 0; i < list.length; i++) {
    var t = new Date(list[i].dt_txt.replace(" ", "T"));
    if (t >= start) return Math.round(list[i].wind.speed * 2.237);
  }
  return 0;
}

function nextDry(list, appt) {
  for (var i = 0; i < list.length; i++) {
    var s = new Date(list[i].dt_txt.replace(" ", "T"));
    var e = new Date(s.getTime() + appt.durationMinutes * 60000);
    var a = new Date(e.getTime() + 3 * 60 * 60000);

    if (!rain(list, s, e) && !rain(list, e, a) && !highWind(list, s, e)) {
      return s.toISOString();
    }
  }
  return null;
}

function check(appt, cb) {
  forecast(appt, function (err, data) {
    if (err) return cb(err);

    var list = data.list;
    var start = new Date(appt.dateTime);
    var end = new Date(start.getTime() + appt.durationMinutes * 60000);
    var after = new Date(end.getTime() + 3 * 60 * 60000);
    var isRain = rain(list, start, end) || rain(list, end, after);
    var isWind = highWind(list, start, end);

    appt.weather = {
      condition: list[0].weather[0].main.toLowerCase(),
      tempC: list[0].main.temp,
      windMph: windAtSlot(list, start)
    };

    if (appt.serviceType == "INTERIOR") {
      appt.decision = "YES";
      appt.reason = isRain ? "Rain expected, but allowed" : "Allowed";
      appt.suggestedSlot = null;
    } else if (isRain || isWind) {
      appt.decision = "NO";

      if (isRain && isWind) appt.reason = "Rain and high wind expected";
      else if (isRain) appt.reason = "Rain expected";
      else appt.reason = "High wind expected";

      appt.suggestedSlot = nextDry(list, appt);
    } else {
      appt.decision = "YES";
      appt.reason = "No rain and wind acceptable";
      appt.suggestedSlot = null;
    }

    cb(null, appt);
  });
}

http.createServer(function (req, res) {
  if (req.method != "POST" || req.url != "/api/weather-check") {
    res.writeHead(404);
    return res.end("Not found");
  }

  var body = "";
  req.on("data", function (c) { body += c; });

  req.on("end", function () {
    var arr = JSON.parse(body);
    var out = [];
    var i = 0;

    function loop() {
      if (i >= arr.length) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(out, null, 2));
      }

      check(arr[i], function (err, result) {
        if (err) {
          res.writeHead(500);
          return res.end(String(err));
        }

        out.push(result);
        i++;
        loop();
      });
    }

    loop();
  });
}).listen(PORT, "0.0.0.0", function () {
  console.log("Running on port " + PORT);
});
