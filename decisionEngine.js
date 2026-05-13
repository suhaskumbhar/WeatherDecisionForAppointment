var http = require("http");
var https = require("https");
var fs = require("fs");
var KEY = process.env.OPENWEATHER_API_KEY || fs.readFileSync(".env","utf8").trim().split("=")[1];
var PORT = process.env.PORT || 3000;
var CACHE = {};
var CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours
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

  // This is caching by postal codes. Changing to weather.
  // var cached = getCached(appt.postalCode);
  // if (cached) {
  //   console.log("Using cached data for " + appt.postalCode);
  //   return cb(null, cached);
  // }

    var zipUrl = "https://api.openweathermap.org/geo/1.0/zip?zip=" +
    appt.postalCode + "," + appt.country + "&appid=" + KEY;
    api(zipUrl, function (err, loc) {
      if (err) return cb(err);
      
      // Below code is caching by grid location instead of postal code, which should be more accurate for weather data.
      var key = gridKey(loc.lat, loc.lon);
      if (CACHE[key] && CACHE[key].expiry > Date.now()) { // ✅ CHECK GRID CACHE FIRST
        console.log("Using cached data for " + appt.postalCode);
        return cb(null, CACHE[key].data);
      }
      
      var url = "https://api.openweathermap.org/data/2.5/forecast?lat=" +
        loc.lat + "&lon=" + loc.lon + "&units=metric&appid=" + KEY;

      api(url, function (err2, data) {
        if (err2) return cb(err2);

        // setCache(appt.postalCode, data); 
        CACHE[key] = {
          data: data,
          expiry: Date.now() + 3 * 60 * 60 * 1000
        };

        cb(null, data);
      });
    });
  
}

function gridKey(lat, lon) {
  // 1 / 0.02 = 50 -- So we are snapping coordinates to a ~2km grid.
  var gLat = Math.round(lat * 50) / 50; // ~0.02° grid, about 1.5 miles
  var gLon = Math.round(lon * 50) / 50;
  return gLat + "_" + gLon;
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
function cloudImage(item) {
  var main = item.weather[0].main;
  var desc = item.weather[0].description.toLowerCase();
  var clouds = item.clouds ? item.clouds.all : 0;

  if (main == "Thunderstorm") return "Thunderstorm";
  if (main == "Snow") return "Snow";
  if (main == "Rain" || main == "Drizzle") return "Rain";

  if (main == "Clear") return "Clear";

  if (clouds >= 70) return "Mostly Cloudy";
  if (clouds >= 20) return "Partly Cloudy";

  return "Clear";
}

function windImage(mph) {
  if (mph > 10) return "High wind";
  return "Acceptable wind";
}
function check(appt, cb) {
  forecast(appt, function (err, data) {
    if (err) return cb(err);

    var list = data.list;
    // console.log("Forecast: " + JSON.stringify(list));  
    var start = new Date(appt.dateTime);
    var end = new Date(start.getTime() + appt.durationMinutes * 60000);
    var after = new Date(end.getTime() + 3 * 60 * 60000);
    var isRain = rain(list, start, end) || rain(list, end, after);
    var isWind = highWind(list, start, end);
    var windMph = windAtSlot(list, start);
    var slotWeather = list[0];

    for (var j = 0; j < list.length; j++) {
      var jt = new Date(list[j].dt_txt.replace(" ", "T"));
      if (jt >= start) {
        slotWeather = list[j];
        break;
      }
    }

    appt.weather = {
      condition: slotWeather.weather[0].main.toLowerCase(),
      tempC: slotWeather.main.temp,
      windMph: windMph,
      CloudImage: cloudImage(slotWeather),
      WindImage: windImage(windMph)
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

// function getCached(zip) {
//   var c = CACHE[zip];
//   if (!c) return null;
//   if (Date.now() > c.expiry) {
//     delete CACHE[zip];
//     return null;
//   }
//   return c.data;
// }

// function setCache(zip, data) {
//   CACHE[zip] = {
//     data: data,
//     expiry: Date.now() + CACHE_TTL
//   };
// }
