"""
Fisheries domain collector (species-resolved) — Sea Around Us API.

Why this exists alongside fao_fisheries.py: that collector's source (FAO via
OWID) publishes only *national annual totals*, which is a single 65-point
series for India and far too thin to model per-species. Sea Around Us (UBC,
Pauly & Zeller) publishes the standard peer-reviewed catch *reconstruction*,
broken down by taxon and year within each EEZ — 205 taxa x 70 years for
India mainland alone. This is what populates `fisheries_catch`, which the
schema was designed for and which sat empty until now.

The two sources are kept separate rather than merged: FAO totals are
officially reported landings, SAU figures are reconstructions that add
estimated discards, unreported and illegal catch. They are different
measurements of different things and would be misleading to sum.

Grain: annual, per taxon, per EEZ. Historical reconstruction ending 2019 —
this is a versioned research dataset, not a live feed, so it is pulled once
and re-pulled by hand when SAU publishes a new version. It is deliberately
NOT in the daily/weekly refresh workflows: polling it would issue requests
that can never return anything new.

Only the *taxon* dimension is collected. The API also exposes gear, sector
and commercial-group breakdowns of the same catch, but those are parallel
aggregations of one total, not a crosstab — filtering taxon by gear is
silently ignored by the API (verified: passing `gear=1` returns a
byte-identical payload). Loading two dimensions into one table would double
every catch total, so `fisheries_catch.gear_type` is left NULL rather than
populated from an aggregate that doesn't decompose by species.

LICENSE: CC BY-NC-SA 4.0 — non-commercial, share-alike. This is the only
non-permissive source in the project; it is recorded as such in
`datasets_metadata`. Cite per https://seaaroundus.org/citation-policy/

Docs: http://api.seaaroundus.org/  |  https://www.seaaroundus.org/
"""
import csv
import json
import time
from pathlib import Path

import requests

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "fisheries"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://api.seaaroundus.org/api/v1/eez/tonnage/taxon/"

# The EEZs covering Indian waters, from /api/v1/eez/ (282 EEZs worldwide).
# Imported by load_seeds.py as the single source of truth for these regions,
# the same way ANCHOR_POINTS is imported from open_meteo.py.
SAU_REGIONS = [
    (356, "India (mainland) EEZ"),
    (357, "Andaman & Nicobar Isl. (India) EEZ"),
]

FIELDS = ["region_id", "region_name", "entity_id", "scientific_name",
          "common_name", "year", "catch_tonnes"]


def fetch_region(region_id, retries=4):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(BASE_URL, params={"region_id": region_id}, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_err = e
            wait = attempt * 5
            print(f"  attempt {attempt} failed ({e}); retrying in {wait}s ...")
            time.sleep(wait)
    raise last_err


def main():
    rows = []
    raw_by_region = {}

    for region_id, region_name in SAU_REGIONS:
        print(f"Fetching Sea Around Us catch-by-taxon for {region_name} (region_id={region_id}) ...")
        payload = fetch_region(region_id)
        series = payload.get("data", [])
        raw_by_region[region_id] = series

        kept = 0
        for s in series:
            for year, tonnes in s.get("values", []):
                # Genuine gaps: a taxon absent from the reconstruction in a
                # given year comes back as null, not zero. Skipping keeps
                # "not recorded" distinct from "recorded as no catch".
                if tonnes is None or year is None:
                    continue
                rows.append({
                    "region_id": region_id,
                    "region_name": region_name,
                    "entity_id": s.get("entity_id"),
                    "scientific_name": s.get("scientific_name"),
                    "common_name": s.get("key"),
                    "year": year,
                    "catch_tonnes": tonnes,
                })
                kept += 1
        print(f"  {len(series)} taxa, {kept} taxon-year rows with a value")

    raw_path = OUT_DIR / "sea_around_us_raw.json"
    raw_path.write_text(json.dumps(raw_by_region), encoding="utf-8")

    csv_path = OUT_DIR / "fisheries_catch_sau.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    years = [r["year"] for r in rows]
    binomial = {r["scientific_name"] for r in rows
                if r["scientific_name"] and len(r["scientific_name"].split()) >= 2}
    higher = {r["scientific_name"] for r in rows
              if r["scientific_name"] and len(r["scientific_name"].split()) < 2}

    print(f"\nTotal taxon-year rows: {len(rows):,}")
    print(f"Year range: {min(years)} - {max(years)}")
    print(f"Distinct binomial species: {len(binomial)}")
    print(f"Distinct higher-rank taxa (family/order — will not match species): {len(higher)}")
    print(f"Raw JSON: {raw_path}")
    print(f"CSV: {csv_path}")


if __name__ == "__main__":
    main()
