"""
Weather domain collector — Open-Meteo Historical Weather API.
Real, free, no API key. Pulls daily weather for a fixed list of
India coastal anchor points over the project's date window.

Docs: https://open-meteo.com/en/docs/historical-weather-api
"""
import csv
import json
import time
from pathlib import Path

import requests

from window import window

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "weather"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Rolling 2-year window, padded for the ERA5 reanalysis ingest lag.
START_DATE, END_DATE = window("open_meteo")

# Representative India coastal anchor points (state -> station name -> lat, lon)
ANCHOR_POINTS = [
    ("Gujarat", "Porbandar", 21.64, 69.60),
    ("Gujarat", "Veraval", 20.90, 70.40),
    ("Maharashtra", "Mumbai", 18.96, 72.82),
    ("Maharashtra", "Ratnagiri", 16.99, 73.31),
    ("Goa", "Panaji", 15.50, 73.80),
    ("Karnataka", "Karwar", 14.80, 74.13),
    ("Karnataka", "Mangaluru", 12.87, 74.84),
    ("Kerala", "Kozhikode", 11.25, 75.77),
    ("Kerala", "Kochi", 9.93, 76.26),
    ("Tamil Nadu", "Tuticorin", 8.76, 78.13),
    ("Tamil Nadu", "Nagapattinam", 10.76, 79.84),
    ("Tamil Nadu", "Chennai", 13.08, 80.27),
    ("Andhra Pradesh", "Kakinada", 16.99, 82.24),
    ("Andhra Pradesh", "Visakhapatnam", 17.68, 83.22),
    ("Odisha", "Puri", 19.80, 85.83),
    ("Odisha", "Paradip", 20.31, 86.61),
    ("West Bengal", "Digha", 21.62, 87.50),
    ("West Bengal", "Sagar Island", 21.65, 88.05),
]

DAILY_VARS = (
    "temperature_2m_max,temperature_2m_min,precipitation_sum,"
    "windspeed_10m_max,surface_pressure_mean"
)

BASE_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_point(state, name, lat, lon, retries=3):
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": DAILY_VARS,
        "timezone": "Asia/Kolkata",
    }
    # The archive API intermittently takes >60s from CI runners (4 of 18
    # stations timed out on one run), so retry with backoff before giving up.
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=90)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            if attempt == retries:
                raise
            print(f"  attempt {attempt} failed ({e}); retrying in {attempt * 15}s ...")
            time.sleep(attempt * 15)


def main():
    all_rows = []
    manifest = []
    for state, name, lat, lon in ANCHOR_POINTS:
        print(f"Fetching weather: {name}, {state} ({lat}, {lon}) ...")
        raw_path = OUT_DIR / f"{name.lower().replace(' ', '_')}.json"
        try:
            data = fetch_point(state, name, lat, lon)
            raw_path.write_text(json.dumps(data), encoding="utf-8")
        except requests.RequestException as e:
            # Dropping the station would remove it from the committed combined
            # CSV, so a later full reload would lose its history. Keep the
            # previous pull instead; the database already has those rows.
            if not raw_path.exists():
                print(f"  FAILED: {e}")
                continue
            print(f"  FAILED: {e} — keeping previous data for this station")
            data = json.loads(raw_path.read_text(encoding="utf-8"))

        daily = data.get("daily", {})
        times = daily.get("time", [])
        n = len(times)
        manifest.append({"state": state, "station": name, "lat": lat, "lon": lon, "records": n})

        for i in range(n):
            all_rows.append(
                {
                    "region": state,
                    "station": name,
                    "lat": lat,
                    "lon": lon,
                    "date": times[i],
                    "temp_max_c": daily.get("temperature_2m_max", [None] * n)[i],
                    "temp_min_c": daily.get("temperature_2m_min", [None] * n)[i],
                    "precipitation_mm": daily.get("precipitation_sum", [None] * n)[i],
                    "windspeed_max_kmh": daily.get("windspeed_10m_max", [None] * n)[i],
                    "surface_pressure_hpa": daily.get("surface_pressure_mean", [None] * n)[i],
                }
            )
        time.sleep(0.3)  # be polite to the free API

    combined_csv = OUT_DIR / "weather_observations_combined.csv"
    with open(combined_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nTotal weather records: {len(all_rows)}")
    print(f"Combined CSV: {combined_csv}")
    print(f"Stations fetched: {len(manifest)}")
    for m in manifest:
        print(f"  {m['station']:15s} ({m['state']:15s}) -> {m['records']} daily records")


if __name__ == "__main__":
    main()
