"""
Biodiversity domain collector (secondary/backfill) — GBIF Occurrence API.
Real, free, no API key needed for search endpoint.

Strategy: GBIF's occurrence-search "class" parameter is not a real filter
(verified live — it silently no-ops and lets non-marine taxa through), so
instead of guessing a numeric taxonKey, this collector backfills GBIF
occurrence records for the marine species OBIS already confirmed present
in the India bounding box (see obis.py). This is both more reliable and a
more defensible cross-source validation strategy than a blind class query.

Docs: https://techdocs.gbif.org/en/openapi/v1/occurrence
"""
import csv
import json
import re
import time
from pathlib import Path

import requests

IN_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "biodiversity"
OUT_DIR = IN_DIR
OBIS_CSV = IN_DIR / "species_occurrences_obis.csv"

BASE_URL = "https://api.gbif.org/v1/occurrence/search"
PER_SPECIES_LIMIT = 100
MAX_SPECIES = 60  # top species by OBIS occurrence frequency
MAX_RECORDS = 4000

FIELDS = [
    "scientificName",
    "decimalLatitude",
    "decimalLongitude",
    "eventDate",
    "depth",
    "basisOfRecord",
    "taxonKey",
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "country",
    "occurrenceID",
]


def top_species_from_obis(n):
    import collections

    counts = collections.Counter()
    with open(OBIS_CSV, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("scientificName")
            if name:
                # Use binomial (genus + species) only, strip authorship
                m = re.match(r"^([A-Z][a-z]+ [a-z\-]+)", name)
                if m:
                    counts[m.group(1)] += 1
    return [name for name, _ in counts.most_common(n)]


def fetch_species(name, retries=3):
    params = {
        "country": "IN",
        "hasCoordinate": "true",
        "scientificName": name,
        "limit": PER_SPECIES_LIMIT,
    }
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json().get("results", [])
        except requests.RequestException as e:
            wait = attempt * 4
            print(f"    attempt {attempt} failed ({e}); retrying in {wait}s ...")
            time.sleep(wait)
    return []


def main():
    species_list = top_species_from_obis(MAX_SPECIES)
    print(f"Backfilling GBIF records for {len(species_list)} OBIS-confirmed marine species ...")

    all_records = []
    for i, name in enumerate(species_list, 1):
        if len(all_records) >= MAX_RECORDS:
            break
        print(f"[{i}/{len(species_list)}] {name} ...")
        results = fetch_species(name)
        print(f"    -> {len(results)} GBIF records")
        all_records.extend(results)
        time.sleep(0.3)

    all_records = all_records[:MAX_RECORDS]

    raw_path = OUT_DIR / "gbif_raw.json"
    raw_path.write_text(json.dumps(all_records), encoding="utf-8")

    csv_path = OUT_DIR / "species_occurrences_gbif.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in all_records:
            writer.writerow({k: r.get(k) for k in FIELDS})

    print(f"\nTotal GBIF occurrence records: {len(all_records)}")
    print(f"Raw JSON: {raw_path}")
    print(f"CSV: {csv_path}")

    classes = {r.get("class") for r in all_records if r.get("class")}
    print(f"Distinct classes present (should be marine taxa only): {classes}")


if __name__ == "__main__":
    main()
