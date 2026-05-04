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
