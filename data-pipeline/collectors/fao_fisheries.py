"""
Fisheries domain collector — FAO capture production statistics, via
Our World in Data's grapher CSV export (OWID republishes FAO's Global
Capture Production dataset per-country, per-year, with a stable, simple,
key-free CSV endpoint — the FAO site itself only exposes this data through
FishStatJ desktop software or a JS-driven query panel with no plain CSV/API,
so OWID is used as the real-data access path here).

Source data is annual, national totals for India — a genuine grain
mismatch vs. the daily/near-real-time domains, which is expected: fisheries
statistics are published annually, not daily.

Docs: https://ourworldindata.org/grapher/capture-fishery-production
"""
import csv
from pathlib import Path

import requests

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "fisheries"
OUT_DIR.mkdir(parents=True, exist_ok=True)

URL = "https://ourworldindata.org/grapher/capture-fishery-production.csv"


def main():
    print("Fetching FAO capture-fishery-production (via OWID) ...")
    r = requests.get(URL, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()

    full_path = OUT_DIR / "capture_fishery_production_all_countries.csv"
    full_path.write_text(r.text, encoding="utf-8")

    reader = csv.DictReader(r.text.splitlines())
    rows = list(reader)
    india_rows = [row for row in rows if row["Entity"] == "India"]

    india_path = OUT_DIR / "fisheries_catch_india.csv"
    with open(india_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
        writer.writeheader()
        writer.writerows(india_rows)

    print(f"Total rows (all countries, all years): {len(rows)}")
    print(f"India rows: {len(india_rows)}")
    if india_rows:
        print(f"India year range: {india_rows[0]['Year']} - {india_rows[-1]['Year']}")
        print("Last 5 years for India:")
        for row in india_rows[-5:]:
            print(" ", row)
    print(f"\nAll-countries CSV: {full_path}")
    print(f"India-filtered CSV: {india_path}")


if __name__ == "__main__":
    main()
