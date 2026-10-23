"""
Fisheries domain collector (species-resolved, recent) — FAO Global Capture
Production, the bulk FishStat release.

Why this exists alongside sea_around_us.py: SAU's reconstruction ends in
2019, so a catch "forecast for next year" built on it is eight-plus years of
extrapolation. FAO's capture database is the official per-species,
per-country, per-fishing-area record and runs to within ~18 months of the
present (the March 2026 release covers 1950-2024; the next, due March 2027,
adds 2025). Bump RELEASE below when a new one is published.

fao_fisheries.py already pulls FAO capture data, but via OWID, which only
republishes *national totals*. The bulk zip below is the same database at
species grain — FAO publishes it as a static file, it just isn't linked
from anywhere prominent.

The two species-level sources are kept separate, never merged or spliced:
FAO is *reported landings*; SAU *reconstructs* total extraction including
estimated discards and unreported catch. For Indian oil sardine in 2019 SAU
gives 308,142 t and FAO 145,083 t — joining the series at 2019 would show a
crash that never happened. Every consumer filters fisheries_catch by
`source`.

Grain: annual, per ASFIS species item, per FAO major fishing area. India's
marine catch is reported in Area 51 (Western Indian Ocean: Arabian Sea
coast) and Area 57 (Eastern Indian Ocean: Bay of Bengal, Andaman &
Nicobar). Inland areas (04) are excluded — this platform is marine.

Each value carries FAO's STATUS flag (A official, E estimated, I imputed by
FAO, ...); it is kept in the CSV so a reader can see which recent values are
FAO's own estimates rather than India's reported figures.

LICENSE: CC BY 4.0 (FAO statistical database terms, see ReadMe.txt in the
zip). Cite: FAO. Fishery and Aquaculture Statistics. Global capture
production 1950-2024 (FishStatJ). Rome, 2026.
"""
import csv
import io
import zipfile
from pathlib import Path

import requests

OUT_DIR = Path(__file__).resolve().parents[1] / "seeds" / "raw" / "fisheries"
OUT_DIR.mkdir(parents=True, exist_ok=True)

RELEASE = "2026.1.0"
URL = f"https://www.fao.org/fishery/static/Data/Capture_{RELEASE}.zip"

INDIA_UN_CODE = "356"
# Imported by load_seeds.py as the single source of truth for these regions,
# the same way SAU_REGIONS is.
FAO_AREAS = [
    ("51", "India - FAO Area 51 (Western Indian Ocean)"),
    ("57", "India - FAO Area 57 (Eastern Indian Ocean)"),
]

FIELDS = ["area_code", "region_name", "species_code", "scientific_name",
          "common_name", "year", "catch_tonnes", "status"]


def main():
    print(f"Fetching FAO Global Capture Production {RELEASE} ...")
    resp = requests.get(URL, timeout=180)
    resp.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(resp.content))

    def read(name):
        return csv.DictReader(io.TextIOWrapper(zf.open(name), encoding="utf-8-sig"))

    species = {r["3A_Code"]: r for r in read("CL_FI_SPECIES_GROUPS.csv")}
    areas = dict(FAO_AREAS)

    rows = []
    for r in read("Capture_Quantity.csv"):
        # Q_tlw = tonnes live weight; the file also carries head-counts
        # (marine mammals, crocodiles) under other measures.
        if r["COUNTRY.UN_CODE"] != INDIA_UN_CODE or r["AREA.CODE"] not in areas or r["MEASURE"] != "Q_tlw":
            continue
        sp = species.get(r["SPECIES.ALPHA_3_CODE"], {})
        rows.append({
            "area_code": r["AREA.CODE"],
            "region_name": areas[r["AREA.CODE"]],
            "species_code": r["SPECIES.ALPHA_3_CODE"],
            "scientific_name": sp.get("Scientific_Name", ""),
            "common_name": sp.get("Name_En", ""),
            "year": r["PERIOD"],
            "catch_tonnes": r["VALUE"],
            "status": r["STATUS"],
        })

    out = OUT_DIR / "fisheries_catch_fao.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    years = sorted({int(r["year"]) for r in rows})
    print(f"  {len(rows):,} rows, {len({r['species_code'] for r in rows})} taxa, "
          f"{years[0]}-{years[-1]} -> {out}")


if __name__ == "__main__":
    main()
