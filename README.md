# WeatherDecisionForAppointment

Weather-based decision engine for validating service time slots and suggesting better alternatives.

## API

POST /api/weather-check

### Input
Array of appointment objects

### Output
Returns decision (YES/NO), reason, weather info, and suggested alternate slot.

## Run locally

```bash
OPENWEATHER_API_KEY=your_key node decisionEngine.js
```
## Sample API Usage

### Endpoint
POST https://weatherdecisionforappointment.onrender.com/api/weather-check

---

### Request

```json
[
  {
    "appointmentId": "A1",
    "postalCode": "38125",
    "country": "US",
    "dateTime": "2026-05-04T10:00:00",
    "durationMinutes": 60,
    "serviceType": "EXTERIOR"
  },
  {
    "appointmentId": "A2",
    "postalCode": "38125",
    "country": "US",
    "dateTime": "2026-05-05T10:00:00",
    "durationMinutes": 60,
    "serviceType": "EXTERIOR"
  },
  {
    "appointmentId": "A3",
    "postalCode": "38125",
    "country": "US",
    "dateTime": "2026-05-05T10:00:00",
    "durationMinutes": 60,
    "serviceType": "INTERIOR"
  }
]
```
### Response
```json
[
  {
    "appointmentId": "A1",
    "serviceType": "EXTERIOR",
    "weather": {
      "condition": "clouds",
      "tempC": 13.49,
      "windMph": 10,
      "CloudImage": "Mostly Cloudy",
      "WindImage": "Acceptable wind"
    },
    "decision": "YES",
    "reason": "No rain and wind acceptable",
    "suggestedSlot": null
  },
  {
    "appointmentId": "A2",
    "serviceType": "EXTERIOR",
    "weather": {
      "condition": "rain",
      "tempC": 14.81,
      "windMph": 15,
      "CloudImage": "Rain",
      "WindImage": "High wind"
    },
    "decision": "NO",
    "reason": "Rain expected",
    "suggestedSlot": "2026-05-04T03:00:00.000Z"
  },
  {
    "appointmentId": "A3",
    "serviceType": "INTERIOR",
    "weather": {
      "condition": "rain",
      "tempC": 14.81,
      "windMph": 15,
      "CloudImage": "Rain",
      "WindImage": "High wind"
    },
    "decision": "YES",
    "reason": "Rain expected, but allowed",
    "suggestedSlot": null
  }
] 
```
