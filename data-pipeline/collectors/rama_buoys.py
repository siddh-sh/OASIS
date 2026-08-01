"""
"Sensors" domain collector — NOAA PMEL TAO/TRITON/RAMA/PIRATA moored buoy
array, tabledap on ERDDAP. Real, free, no API key.

This fills a real gap: everything else in the oceanographic domain
(noaa_erddap.py) is SATELLITE-DERIVED remote sensing. The source PPT's
proposed-solution diagram lists "Sensors" as a data source distinct from
"Satellites" — this collector is the actual in-situ physical-instrument
counterpart: real buoys moored in the water column, telemetering
oceanographic + meteorological readings via Argos.

RAMA (Research Moored Array for African-Asian-Australian Monsoon Analysis)
is the Indian Ocean component of the global TAO/TRITON+RAMA+PIRATA network.
Its buoys sit in OPEN ocean (equatorial belt, Bay of Bengal at 90E) rather
than hugging India's coastline, so real buoy coverage inside the strict
6-23N/68-90E coastal bbox used elsewhere in this project is sparse (2
stations). Scope is deliberately widened to 0-23N / 60-95E to capture the
RAMA stations that actually exist, while still serving the same Indian
Ocean monsoon system this project cares about. This is a real
observational-network constraint, not a shortcut — do not "fix" it by
inventing coastal stations that do not exist.

Perf note: PMEL's ERDDAP is slow, so this issues ONE bbox-constrained
request per variable (6 total) rather than one per station-variable pair
(60 total), then pivots the results locally.

Docs: https://www.pmel.noaa.gov/gtmba/
Catalog verified live via https://data.pmel.noaa.gov/pmel/erddap/search/index.json
"""
import csv
import io
import time
from collections import defaultdict
from pathlib import Path

import requests

from window import window

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "sensors"
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120 Safari/537.36"
    )
}

BASE = "https://data.pmel.noaa.gov/pmel/erddap/tabledap"
# Rolling 2-year window, padded for Argos telemetry + QC lag (~4 weeks).
START_DATE, END_DATE = window("rama_buoys")

# Indian Ocean basin — widened from the project's coastal bbox, see module docstring.
LAT_MIN, LAT_MAX = -5, 23
LON_MIN, LON_MAX = 60, 95

# variable -> (dataset_id, source column name)
VARIABLES = {
    "sst_c": ("pmelTaoDySst", "T_25"),
    "air_temp_c": ("pmelTaoDyAirt", "AT_21"),
    "wind_speed_ms": ("pmelTaoDyW", "WS_401"),
    "rel_humidity_pct": ("pmelTaoDyRh", "RH_910"),
    "barometric_pressure_hpa": ("pmelTaoDyBp", "BP_915"),
    "salinity_psu": ("pmelTaoDyS", "S_41"),
}


def fetch_var(dataset_id, column, retries=3):
    """One request per variable, covering every buoy in the bbox."""
    url = (
        f"{BASE}/{dataset_id}.csv"
        f"?station,wmo_platform_code,longitude,latitude,time,{column}"
        f"&longitude>={LON_MIN}&longitude<={LON_MAX}"
        f"&latitude>={LAT_MIN}&latitude<={LAT_MAX}"
        f"&time>={START_DATE}&time<={END_DATE}"
    )
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=300)
            if r.status_code == 404:
                print("    (404 — no matching data for this variable/bbox)")
                return []
            r.raise_for_status()
            rows = list(csv.reader(io.StringIO(r.text)))
            return rows[2:]  # skip header row + units row
        except requests.RequestException as e:
            wait = attempt * 10
            print(f"    attempt {attempt} failed ({e}); retrying in {wait}s ...")
            time.sleep(wait)
    print("    giving up on this variable")
    return []


def main():
    # (station, wmo, lon, lat, time) -> {var: value}
    merged = defaultdict(dict)
    stations = {}

    for var_name, (dataset_id, column) in VARIABLES.items():
        print(f"Fetching {var_name} from {dataset_id} (all buoys in bbox) ...")
        rows = fetch_var(dataset_id, column)
        kept = 0
        for row in rows:
            if len(row) != 6:
                continue
            station, wmo, lon, lat, t, val = row
            stations[station] = (wmo, lon, lat)
            if val and val != "NaN":
                merged[(station, t)][var_name] = val
                kept += 1
        print(f"    {len(rows)} rows returned, {kept} with a real (non-NaN) value")
        time.sleep(1)

    fieldnames = ["station", "wmo_platform_code", "lat", "lon", "time"] + list(VARIABLES)
    csv_path = OUT_DIR / "sensor_buoy_readings.csv"
    out_rows = []
    for (station, t), vals in sorted(merged.items()):
        wmo, lon, lat = stations.get(station, ("", "", ""))
        row = {
            "station": station,
            "wmo_platform_code": wmo,
            "lat": lat,
            "lon": lon,
            "time": t,
        }
        for v in VARIABLES:
            row[v] = vals.get(v, "")
        out_rows.append(row)

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"\nDistinct buoy stations with real data: {len(stations)}")
    for s, (wmo, lon, lat) in sorted(stations.items()):
        print(f"  {s:12s} WMO {wmo:6s} ({lat}, {lon})")
    print(f"\nTotal buoy-day rows (with >=1 real reading): {len(out_rows)}")
    print(f"CSV: {csv_path}")


if __name__ == "__main__":
    main()
