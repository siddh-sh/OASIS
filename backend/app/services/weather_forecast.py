"""Live weather forecast, proxied from Open-Meteo (project-changes.md §3b).

**Not stored in the database, on purpose.** Every other domain in OASIS is
ingested, committed and loaded, because it is historical and stable. A
forecast is the opposite: it is only meaningful while it is current, and a
seeded snapshot would be wrong within hours while still looking authoritative.
So `weather_observations` keeps the ERA5 historical archive, and anything
forward-looking is fetched on demand.

That also means the phone-style weather view depends on an outbound network
call at request time. Failures return 503 with a clear message rather than a
500, and the frontend can say "forecast unavailable" while still rendering
the historical chart from the database.

Cached in-process for `CACHE_TTL`: a forecast updates every ~15 minutes
upstream, so hitting Open-Meteo on every page load would be wasteful and
slow. The cache is per-process, which is correct here — the free Render plan
runs a single worker.
"""
from __future__ import annotations

import time
from typing import Any

import requests

BASE_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_TTL = 900  # seconds; matches Open-Meteo's own ~15-minute update cadence
TIMEOUT = 20

CURRENT_VARS = (
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,"
    "weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day"
)
HOURLY_VARS = "temperature_2m,precipitation_probability,weather_code"
DAILY_VARS = (
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
    "precipitation_probability_max,uv_index_max,sunrise,sunset,wind_speed_10m_max"
)

# WMO weather codes -> plain language. The API returns the number only, and
# "code 61" means nothing to a fisherman.
WEATHER_CODES: dict[int, str] = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}


class ForecastUnavailable(RuntimeError):
    """Upstream failed — surfaced as 503, never a 500."""


_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}


def describe_code(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return WEATHER_CODES.get(int(code), f"Code {code}")


def _compass(degrees: float | None) -> str | None:
    if degrees is None:
        return None
    points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
              "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return points[round(float(degrees) / 22.5) % 16]


def get_forecast(lat: float, lon: float, days: int = 7) -> dict[str, Any]:
    key = (round(lat, 3), round(lon, 3))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]

    try:
        resp = requests.get(
            BASE_URL,
            params={
                "latitude": lat, "longitude": lon, "timezone": "Asia/Kolkata",
                "current": CURRENT_VARS, "hourly": HOURLY_VARS, "daily": DAILY_VARS,
                "forecast_days": days,
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()
    except requests.RequestException as exc:
        raise ForecastUnavailable(f"Open-Meteo request failed: {exc}") from exc

    cur = raw.get("current", {})
    daily = raw.get("daily", {})
    hourly = raw.get("hourly", {})

    # Only hours from now onward — a "next 24 hours" strip that starts this
    # morning is not a forecast.
    now = cur.get("time")
    times = hourly.get("time", [])
    start = next((i for i, t in enumerate(times) if now and t >= now), 0)
    hourly_slice = slice(start, start + 24)

    payload = {
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "timezone": raw.get("timezone"),
        "fetched_at": cur.get("time"),
        "current": {
            "time": cur.get("time"),
            "temperature_c": cur.get("temperature_2m"),
            "feels_like_c": cur.get("apparent_temperature"),
            "humidity_pct": cur.get("relative_humidity_2m"),
            "precipitation_mm": cur.get("precipitation"),
            "wind_speed_kmh": cur.get("wind_speed_10m"),
            "wind_direction_deg": cur.get("wind_direction_10m"),
            "wind_compass": _compass(cur.get("wind_direction_10m")),
            "pressure_hpa": cur.get("surface_pressure"),
            "is_day": bool(cur.get("is_day")),
            "condition": describe_code(cur.get("weather_code")),
            "weather_code": cur.get("weather_code"),
            # UV is a daily maximum upstream; there is no "current UV" field,
            # so it is labelled as today's peak rather than passed off as now.
            "uv_index_max_today": (daily.get("uv_index_max") or [None])[0],
        },
        "hourly": [
            {
                "time": t,
                "temperature_c": temp,
                "precipitation_probability_pct": prob,
                "condition": describe_code(code),
            }
            for t, temp, prob, code in zip(
                times[hourly_slice],
                hourly.get("temperature_2m", [])[hourly_slice],
                hourly.get("precipitation_probability", [])[hourly_slice],
                hourly.get("weather_code", [])[hourly_slice],
                strict=False,
            )
        ],
        "daily": [
            {
                "date": d, "condition": describe_code(code),
                "weather_code": code, "temp_max_c": tmax, "temp_min_c": tmin,
                "precipitation_mm": precip, "precipitation_probability_pct": prob,
                "uv_index_max": uv, "sunrise": sr, "sunset": ss,
                "wind_speed_max_kmh": wind,
            }
            for d, code, tmax, tmin, precip, prob, uv, sr, ss, wind in zip(
                daily.get("time", []), daily.get("weather_code", []),
                daily.get("temperature_2m_max", []), daily.get("temperature_2m_min", []),
                daily.get("precipitation_sum", []), daily.get("precipitation_probability_max", []),
                daily.get("uv_index_max", []), daily.get("sunrise", []),
                daily.get("sunset", []), daily.get("wind_speed_10m_max", []),
                strict=False,
            )
        ],
        "source": "Open-Meteo forecast API (live, not stored)",
        # Air quality needs Open-Meteo's separate air-quality endpoint; saying
        # so beats leaving an empty AQI tile that looks broken.
        "not_available": ["Air quality index (separate Open-Meteo endpoint, not integrated)"],
    }

    _cache[key] = (time.time(), payload)
    return payload
