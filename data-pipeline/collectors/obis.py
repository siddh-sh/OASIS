"""
Biodiversity domain collector (primary, marine-specific) — OBIS API v3.
Real, free, no API key. Records already embed sst/sss/bathymetry, which
is a free bonus for cross-domain feature engineering later.

Docs: https://api.obis.org/
"""
import csv
import json
import time
from pathlib import Path

import requests

from window import window

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "biodiversity"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Rolling 2-year window. No lag padding: occurrence records carry historical
# event dates, so there is no "too recent to exist yet" boundary to avoid.
START_DATE, END_DATE = window("obis")

# All-India coastal bounding box (lon lat pairs, closed polygon)
INDIA_BBOX_WKT = "POLYGON((68 6,90 6,90 23,68 23,68 6))"

BASE_URL = "https://api.obis.org/v3/occurrence"
PAGE_SIZE = 300
# Volume cap per plan §16.3/16.4 — applied to the *newest* records. OBIS
# pages by record id, not date, so stopping after the first 6,000 returned
# (as this originally did) kept an arbitrary slice of the window; the
# window holds ~24,000, so all are fetched and the most recent kept.
MAX_RECORDS = 6000

FIELDS = [
    "scientificName",
    "decimalLatitude",
    "decimalLongitude",
    "date_year",
    "eventDate",
    "depth",
    "minimumDepthInMeters",
    "maximumDepthInMeters",
    "basisOfRecord",
    "aphiaID",
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "marine",
    "sst",
    "sss",
    "bathymetry",
    "shoredistance",
    "occurrenceID",
]


def fetch_page(after=None, retries=4):
    params = {
        "geometry": INDIA_BBOX_WKT,
        "startdate": START_DATE,
        "enddate": END_DATE,
        "size": PAGE_SIZE,
    }
    if after:
        params["after"] = after
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_err = e
            wait = attempt * 5
            print(f"  attempt {attempt} failed ({e}); retrying in {wait}s ...")
            time.sleep(wait)
    raise last_err


def main():
    all_records = []
    after = None
    page = 0
    while True:
        page += 1
        print(f"Fetching OBIS page {page} (after={after}) ...")
        data = fetch_page(after)
        results = data.get("results", [])
        if not results:
            print("  No more results.")
            break
        all_records.extend(results)
        # OBIS paginates via the 'id' of the last record as the 'after' cursor
        after = results[-1].get("id")
        if len(results) < PAGE_SIZE:
            break

    # eventDate can be a range ("2025-03-01/2025-03-05"); its start sorts
    # correctly as an ISO string. Undated records go last.
    all_records.sort(key=lambda r: (r.get("eventDate") or "")[:10], reverse=True)
    print(f"Fetched {len(all_records):,} in window; keeping newest {MAX_RECORDS:,}")
    all_records = all_records[:MAX_RECORDS]

    raw_path = OUT_DIR / "obis_raw.json"
    raw_path.write_text(json.dumps(all_records), encoding="utf-8")

    csv_path = OUT_DIR / "species_occurrences_obis.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in all_records:
            writer.writerow({k: r.get(k) for k in FIELDS})

    print(f"\nTotal OBIS occurrence records: {len(all_records)}")
    print(f"Raw JSON: {raw_path}")
    print(f"CSV: {csv_path}")

    species_set = {r.get("scientificName") for r in all_records if r.get("scientificName")}
    print(f"Distinct species: {len(species_set)}")
    print("Sample species:", list(species_set)[:10])


if __name__ == "__main__":
    main()
