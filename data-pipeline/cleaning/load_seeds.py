"""
Load the committed seed CSVs into the unified Supabase schema.

This is the deterministic core that the Data Integration & Cleaning Agent
later wraps (flow.md §16.7). Written by hand first, deliberately, so the
mapping and cleaning rules are explicit and auditable before an LLM is put
in charge of choosing between them.

Usage:
    python data-pipeline/cleaning/load_seeds.py
    python data-pipeline/cleaning/load_seeds.py --truncate   # wipe data first

Idempotent: every insert uses ON CONFLICT DO NOTHING against the natural
keys declared in schema.sql, so re-running after a data refresh inserts
only genuinely new rows.

Real-data rules encoded here (each one was verified against the actual
files, not assumed):
  * Satellite SST and chlorophyll share NO grid points (690 vs 252 cells,
    zero overlap), so they load as separate rows distinguished by `source`.
  * ~34% of satellite rows are null — those are land pixels inside the
    bounding box. Skipped rather than stored as null readings.
  * Species names collide across OBIS/GBIF/BOLD, which name organisms
    independently. All four sources are deduplicated on the binomial
    `species` column (NOT `scientificName`, which carries authorship in
    GBIF: "Egretta garzetta (Linnaeus, 1766)").
  * Buoy readings have genuine NaN runs from instrument outages; a row is
    kept if ANY variable is present.
"""
import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-pipeline" / "seeds" / "raw"

sys.path.insert(0, str(ROOT / "data-pipeline" / "collectors"))
from open_meteo import ANCHOR_POINTS  # noqa: E402  single source of truth for coastal stations
from sea_around_us import SAU_REGIONS  # noqa: E402  single source of truth for the Indian EEZs
from fao_capture import FAO_AREAS  # noqa: E402  single source of truth for India's FAO fishing areas

BATCH = 5000

# Buoys and satellite grid cells sit in open ocean, not in any coastal state.
OPEN_OCEAN = "Open Indian Ocean"


# ----------------------------------------------------------------- helpers

def connect():
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set — see docs/supabase-setup.md")
    return psycopg2.connect(url, connect_timeout=30)


def read_csv(path, skip_units_row=False):
    """ERDDAP CSVs wedge a units row between the header and the data."""
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    return rows[1:] if skip_units_row else rows


def num(v):
    """Parse a float, treating '', NaN and ERDDAP's 'NaN' literal as missing."""
    if v is None:
        return None
    v = str(v).strip()
    if v == "" or v.lower() == "nan":
        return None
    try:
        f = float(v)
    except ValueError:
        return None
    return None if f != f else f  # NaN != NaN


def clean_str(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None


def iso_date(v):
    """Extract a YYYY-MM-DD date from the several formats the sources use."""
    v = clean_str(v)
    if not v:
        return None
    v = v.split("T")[0].split("/")[0]  # GBIF sometimes gives ranges: "2024-01-01/2024-01-05"
    try:
        return datetime.strptime(v[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def insert(cur, sql, rows, label):
    if not rows:
        print(f"  {label:34s} nothing to insert")
        return 0
    total = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        execute_values(cur, sql, chunk, page_size=BATCH)
        total += len(chunk)
    print(f"  {label:34s} {total:>7,} rows offered")
    return total


# ----------------------------------------------------------------- loaders

def is_binomial(name):
    """Both catch sources mix group labels in with species names, and a
    word-count check lets them through: FAO ("Caranx spp", "Sepiidae,
    Sepiolidae", "Clupeiformes (=Clupeoidei)") and SAU ("Miscellaneous
    marine crustaceans"). Only a plain "Genus species" binomial is a
    species."""
    parts = (name or "").split()
    return (len(parts) == 2 and parts[0].isalpha() and parts[0][0].isupper()
            and parts[1].isalpha() and parts[1].islower() and parts[1] not in ("spp", "sp"))


def load_regions(cur):
    # Coastal states (from the weather anchor points), plus open ocean for
    # buoys/satellite cells, plus the two Sea Around Us EEZs and two FAO
    # fishing areas that fisheries catch is reported against. Neither has a
    # `state` — they are maritime zones, not administrative divisions.
    names = sorted({state for state, *_ in ANCHOR_POINTS}) + [OPEN_OCEAN]
    rows = [(n, n if n != OPEN_OCEAN else None) for n in names]
    rows += [(eez_name, None) for _, eez_name in SAU_REGIONS]
    rows += [(area_name, None) for _, area_name in FAO_AREAS]
    insert(cur,
           "insert into regions (name, state) values %s on conflict (name) do nothing",
           rows, "regions")
    cur.execute("select name, region_id from regions")
    return dict(cur.fetchall())


def load_region_boundaries(cur):
    """Backfill regions.geom for the 9 coastal states from the simplified
    boundary seeds in seeds/raw/regions/.

    Source: GADM v1 administrative boundaries (via the geohacker/india
    mirror), simplified from ~15k-75k points per state down to a few hundred
    with Douglas-Peucker and reduced to each state's largest ring only
    (small offshore islands/exclaves dropped). This is an illustrative
    shape for "where roughly is this state," not a surveyed legal boundary —
    GADM is free for academic/non-commercial use, not for authoritative
    cartography. EEZ regions (no `state`) are not covered; there is no
    equally simple public source for those and none is fabricated here.
    """
    dir_ = RAW / "regions"
    if not dir_.exists():
        print("  regions geom                      no seed files, skipped")
        return
    updated = 0
    for path in sorted(dir_.glob("*.geojson")):
        name = path.stem.replace("_", " ").title()
        geojson = path.read_text(encoding="utf-8")
        cur.execute(
            "update regions set geom = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)::geography "
            "where name = %s",
            (geojson, name),
        )
        updated += cur.rowcount
    print(f"  {'regions geom':34s} {updated:>7,} rows updated")


def load_stations(cur, regions):
    """Coastal anchors, buoys and satellite grid cells all live in one table,
    separated by station_type (see schema.sql reconciliation note)."""
    rows = []

    # 1. Coastal anchor points — shared by the weather and (later) ocean data.
    for state, name, lat, lon in ANCHOR_POINTS:
        rows.append((name, "coastal-anchor", None, lat, lon, regions[state]))

    # 2. Moored buoys, from the real station list the collector fetched.
    seen_buoys = set()
    for r in read_csv(RAW / "sensors" / "sensor_buoy_readings.csv"):
        key = (num(r["lat"]), num(r["lon"]))
        if key in seen_buoys:
            continue
        seen_buoys.add(key)
        wmo = r.get("wmo_platform_code")
        rows.append((r["station"], "in-situ-buoy",
                     int(wmo) if wmo and wmo.strip() else None,
                     key[0], key[1], regions[OPEN_OCEAN]))

    # 3. Satellite grid cells — only those carrying at least one real reading,
    #    so we don't create ~300 phantom stations over land.
    seen_grid = set()
    for fname, col, skip in (("sst_india.csv", "analysed_sst", True),
                             ("chlorophyll_india.csv", "chlor_a", True)):
        for r in read_csv(RAW / "oceanographic" / fname, skip_units_row=skip):
            if num(r[col]) is None:
                continue
            key = (round(num(r["latitude"]), 4), round(num(r["longitude"]), 4))
            if key in seen_grid:
                continue
            seen_grid.add(key)
            rows.append((None, "satellite-grid", None, key[0], key[1], None))

    insert(cur,
           "insert into oceanographic_stations "
           "(name, station_type, wmo_platform_code, lat, lon, region_id) values %s "
           "on conflict (lat, lon, station_type) do nothing",
           rows, "oceanographic_stations")

    cur.execute("select lat, lon, station_type, station_id from oceanographic_stations")
    return {(round(la, 4), round(lo, 4), st): sid for la, lo, st, sid in cur.fetchall()}


def load_ocean_readings(cur, stations):
    specs = [
        ("sst_india.csv", "analysed_sst", "sst", "NOAA-BLENDED-SST"),
        # NOAA-DINEOF-CHLA replaced NOAA-VIIRS-CHLA in Oct 2026 when NOAA retired
        # the VIIRS-only product (see collectors/noaa_erddap.py). A different
        # product, so a different source key; the old rows were removed
        # rather than left to interleave with the new series.
        ("chlorophyll_india.csv", "chlor_a", "chlorophyll_a", "NOAA-DINEOF-CHLA"),
    ]
    for fname, col, target, source in specs:
        rows = []
        for r in read_csv(RAW / "oceanographic" / fname, skip_units_row=True):
            val = num(r[col])
            if val is None:  # land pixel
                continue
            sid = stations.get((round(num(r["latitude"]), 4),
                                round(num(r["longitude"]), 4), "satellite-grid"))
            if sid is None:
                continue
            sst = val if target == "sst" else None
            chl = val if target == "chlorophyll_a" else None
            rows.append((sid, r["time"], sst, chl, source))
        insert(cur,
               'insert into oceanographic_readings '
               '(station_id, "timestamp", sst, chlorophyll_a, source) values %s '
               'on conflict (station_id, "timestamp", source) do nothing',
               rows, f"oceanographic_readings [{target}]")


def load_sensor_readings(cur, stations):
    rows = []
    for r in read_csv(RAW / "sensors" / "sensor_buoy_readings.csv"):
        sid = stations.get((round(num(r["lat"]), 4), round(num(r["lon"]), 4), "in-situ-buoy"))
        if sid is None:
            continue
        vals = [num(r[c]) for c in ("sst_c", "air_temp_c", "wind_speed_ms",
                                    "rel_humidity_pct", "barometric_pressure_hpa",
                                    "salinity_psu")]
        if all(v is None for v in vals):  # total outage that day
            continue
        rows.append((sid, iso_date(r["time"]), *vals))
    insert(cur,
           "insert into sensor_readings (station_id, obs_date, sst_c, air_temp_c, "
           "wind_speed_ms, rel_humidity_pct, barometric_pressure_hpa, salinity_psu) "
           "values %s on conflict (station_id, obs_date, source) do nothing",
           rows, "sensor_readings")


def load_weather(cur, regions, stations):
    rows = []
    for r in read_csv(RAW / "weather" / "weather_observations_combined.csv"):
        sid = stations.get((round(num(r["lat"]), 4), round(num(r["lon"]), 4), "coastal-anchor"))
        rid = regions.get(r["region"])
        if sid is None or rid is None:
            continue
        rows.append((rid, sid, iso_date(r["date"]), num(r["temp_max_c"]),
                     num(r["temp_min_c"]), num(r["precipitation_mm"]),
                     num(r["windspeed_max_kmh"]), num(r["surface_pressure_hpa"])))
    insert(cur,
           "insert into weather_observations (region_id, station_id, obs_date, "
           "temp_max_c, temp_min_c, precipitation_mm, wind_speed_kmh, pressure_hpa) "
           "values %s on conflict (station_id, obs_date, source) do nothing",
           rows, "weather_observations")


def load_species(cur):
    """Deduplicate species across all four sources.

    Keyed on the binomial `species` column, which every source provides
    cleanly — NOT `scientificName`, which in GBIF carries authorship
    ("Egretta garzetta (Linnaeus, 1766)") and would fragment the same
    organism into several rows.
    """
    merged = {}
    sources = [
        (RAW / "biodiversity" / "species_occurrences_obis.csv", False),
        (RAW / "biodiversity" / "species_occurrences_gbif.csv", False),
        (RAW / "molecular" / "molecular_records_bold.csv", False),
    ]
    for path, skip in sources:
        for r in read_csv(path, skip_units_row=skip):
            name = clean_str(r.get("species"))
            if not name or len(name.split()) < 2:
                continue  # genus-only or unidentified
            # First source to mention a species wins; later ones only fill blanks.
            entry = merged.setdefault(name, {})
            for col in ("kingdom", "phylum", "class", "order", "family", "genus"):
                if not entry.get(col):
                    entry[col] = clean_str(r.get(col))

    # Sea Around Us: names its taxa in a `scientific_name` column and supplies
    # a real common name, which none of the other three sources provide. Only
    # its binomials become species rows — SAU also reports family- and
    # order-level aggregates (Penaeidae, Decapoda) that are not species.
    for r in read_csv(RAW / "fisheries" / "fisheries_catch_sau.csv"):
        name = clean_str(r.get("scientific_name"))
        if not is_binomial(name):
            continue
        entry = merged.setdefault(name, {})
        if not entry.get("common_name"):
            entry["common_name"] = clean_str(r.get("common_name"))

    # FAO capture: same idea — binomials only (FAO's "nei" groups such as
    # "Marine fishes nei" are not species), with FAO's English name.
    for r in read_csv(RAW / "fisheries" / "fisheries_catch_fao.csv"):
        name = clean_str(r.get("scientific_name"))
        if not is_binomial(name):
            continue
        entry = merged.setdefault(name, {})
        if not entry.get("common_name"):
            entry["common_name"] = clean_str(r.get("common_name"))

    rows = [(name, e.get("common_name"), e.get("kingdom"), e.get("phylum"),
             e.get("class"), e.get("order"), e.get("family"), e.get("genus"))
            for name, e in sorted(merged.items())]
    # DO UPDATE (not DO NOTHING) purely to backfill common_name onto species
    # first inserted by a source that had none; coalesce means an existing
    # value is never overwritten.
    insert(cur,
           'insert into species (scientific_name, common_name, kingdom, phylum, class, '
           '"order", family, genus) values %s on conflict (scientific_name) do update '
           'set common_name = coalesce(species.common_name, excluded.common_name)',
           rows, "species")

    cur.execute("select scientific_name, species_id from species")
    return dict(cur.fetchall())


def load_occurrences(cur, species):
    for path, source in ((RAW / "biodiversity" / "species_occurrences_obis.csv", "OBIS"),
                         (RAW / "biodiversity" / "species_occurrences_gbif.csv", "GBIF")):
        rows = []
        for r in read_csv(path):
            lat, lon = num(r.get("decimalLatitude")), num(r.get("decimalLongitude"))
            if lat is None or lon is None:
                continue
            ext = clean_str(r.get("occurrenceID"))
            if not ext:
                continue  # no stable key -> cannot dedupe on re-load
            rows.append((
                species.get(clean_str(r.get("species"))),
                lat, lon, iso_date(r.get("eventDate")), num(r.get("depth")),
                clean_str(r.get("basisOfRecord")),
                num(r.get("sst")), num(r.get("sss")),
                num(r.get("bathymetry")), num(r.get("shoredistance")),
                source, ext,
            ))
        insert(cur,
               "insert into species_occurrences (species_id, lat, lon, occurred_at, "
               "depth, basis_of_record, sst, sss, bathymetry, shoredistance, source, "
               "external_id) values %s on conflict (source, external_id) do nothing",
               rows, f"species_occurrences [{source}]")


def load_fisheries(cur):
    rows = []
    for r in read_csv(RAW / "fisheries" / "fisheries_catch_india.csv"):
        tons = num(r.get("Capture fisheries production (metric tons)"))
        year = num(r.get("Year"))
        if tons is None or year is None:
            continue
        rows.append((r["Entity"], int(year), tons))
    insert(cur,
           "insert into fisheries_national_totals (country, year, catch_metric_tons) "
           "values %s on conflict (country, year, source) do nothing",
           rows, "fisheries_national_totals")


def load_fisheries_catch(cur, regions, species):
    """Species-resolved catch from Sea Around Us (see the collector's docstring
    for why this is separate from fisheries_national_totals).

    Three honest gaps, all deliberate:
      * species_id is NULL for SAU's family/order-level aggregates — they are
        not species and are not invented as such.
      * species_id is also NULL for SAU's "Others" series, which carries real
        catch that SAU does not attribute to any taxon (64,125 t for mainland
        India in 1950 alone). It is kept rather than dropped: discarding it
        would silently bias every total-catch aggregate — and the ML target —
        downward. It gets a stable synthetic key instead of SAU's entity_id,
        which is null for this series.
      * gear_type is NULL throughout: SAU's gear breakdown is a parallel
        aggregation of the same catch, not a species x gear crosstab, so
        filling it would double every total.

    SAU reports tonnes; the column is catch_weight_kg, so x1000.
    """
    rows = []
    for r in read_csv(RAW / "fisheries" / "fisheries_catch_sau.csv"):
        tonnes = num(r.get("catch_tonnes"))
        year = num(r.get("year"))
        eez_id = clean_str(r.get("region_id"))
        entity = clean_str(r.get("entity_id"))
        common = clean_str(r.get("common_name"))
        if tonnes is None or year is None or not eez_id:
            continue
        if not entity:
            # Unattributed series ("Others"). Key off its label so the row is
            # still stable across re-pulls.
            if not common:
                continue
            entity = "other-" + common.lower().replace(" ", "-")
        sci = clean_str(r.get("scientific_name"))
        rows.append((
            species.get(sci) if is_binomial(sci) else None,
            regions.get(clean_str(r.get("region_name"))),
            datetime(int(year), 1, 1).date(),   # annual grain -> Jan 1 of the year
            tonnes * 1000,
            None,                               # gear_type — see docstring
            "SAU",
            f"{eez_id}:{entity}:{int(year)}",
        ))
    insert(cur,
           "insert into fisheries_catch (species_id, region_id, catch_date, "
           "catch_weight_kg, gear_type, source, external_id) values %s "
           "on conflict (source, external_id) do nothing",
           rows, "fisheries_catch [SAU]")


def load_fisheries_catch_fao(cur, regions, species):
    """Species-resolved reported landings from FAO Global Capture Production,
    1950 to ~18 months before present (see collectors/fao_capture.py).

    Stored in fisheries_catch next to SAU under source 'FAO'. The two are
    different measurements (reported landings vs. reconstructed total
    extraction) and every reader filters on `source`; they are never summed.

    As with SAU, species_id is NULL for FAO's higher-rank "nei" groups, which
    are kept so totals aren't biased downward. FAO reports tonnes; x1000.
    """
    rows = []
    for r in read_csv(RAW / "fisheries" / "fisheries_catch_fao.csv"):
        tonnes = num(r.get("catch_tonnes"))
        year = num(r.get("year"))
        area = clean_str(r.get("area_code"))
        code = clean_str(r.get("species_code"))
        if tonnes is None or year is None or not area or not code:
            continue
        sci = clean_str(r.get("scientific_name"))
        rows.append((
            species.get(sci) if is_binomial(sci) else None,
            regions.get(clean_str(r.get("region_name"))),
            datetime(int(year), 1, 1).date(),   # annual grain -> Jan 1 of the year
            tonnes * 1000,
            None,
            "FAO",
            f"{area}:{code}:{int(year)}",
        ))
    insert(cur,
           "insert into fisheries_catch (species_id, region_id, catch_date, "
           "catch_weight_kg, gear_type, source, external_id) values %s "
           "on conflict (source, external_id) do nothing",
           rows, "fisheries_catch [FAO]")


def load_molecular(cur, species):
    rows = []
    for r in read_csv(RAW / "molecular" / "molecular_records_bold.csv"):
        pid = clean_str(r.get("processid"))
        if not pid:
            continue
        lat = lon = None
        coord = clean_str(r.get("coord"))
        if coord and coord.startswith("["):  # BOLD returns "[lat, lon]" as a string
            try:
                lat, lon = [float(x) for x in coord.strip("[]").split(",")[:2]]
            except (ValueError, IndexError):
                pass
        rows.append((
            species.get(clean_str(r.get("species"))),
            pid, clean_str(r.get("bin_uri")), clean_str(r.get("nuc")),
            clean_str(r.get("marker_code")), clean_str(r.get("identification")),
            clean_str(r.get("country/ocean")), clean_str(r.get("province/state")),
            lat, lon, iso_date(r.get("collection_date_start")),
        ))
    insert(cur,
           "insert into molecular_records (species_id, process_id, bin_uri, "
           "barcode_sequence, marker_gene, identification, country, province_state, "
           "lat, lon, collected_at) values %s on conflict (process_id) do nothing",
           rows, "molecular_records")


def backfill_geometry(cur):
    """Populate PostGIS geometry from the lat/lon columns — this is what makes
    spatial joins and the GIS map work."""
    for table in ("oceanographic_stations", "species_occurrences"):
        cur.execute(
            f"update {table} set geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography "
            f"where geom is null and lat is not null and lon is not null"
        )
        print(f"  {table + ' geom':34s} {cur.rowcount:>7,} rows updated")


def record_metadata(cur):
    cur.execute("delete from datasets_metadata")
    rows = [
        ("NOAA-BLENDED-SST", "satellite", "NOAA / public domain"),
        ("NOAA-DINEOF-CHLA", "satellite", "NOAA / public domain"),
        ("NOAA-PMEL-RAMA", "sensor", "NOAA PMEL / public domain"),
        ("Open-Meteo", "weather", "CC-BY 4.0"),
        ("OBIS", "biodiversity", "CC-BY 4.0"),
        ("GBIF", "biodiversity", "varies by dataset"),
        ("FAO-via-OWID", "fisheries", "CC-BY 4.0"),
        # The project's only non-permissive source: non-commercial + share-alike.
        # Cite per https://seaaroundus.org/citation-policy/
        ("SAU", "fisheries", "CC-BY-NC-SA 4.0"),
        ("FAO", "fisheries", "CC-BY 4.0"),
        ("BOLD", "genomics", "BOLD terms of use"),
        # Simplified state boundaries only (see load_region_boundaries) --
        # illustrative, not surveyed cartography.
        ("GADM-derived (geohacker/india)", "boundaries", "free for academic/non-commercial use"),
        # Regional-language species names (see
        # data-pipeline/cleaning/load_vernacular_names.py) -- run separately
        # from this script since it scrapes live pages over several minutes.
        ("FishBase", "vernacular-names", "free for non-commercial research use"),
        ("SeaLifeBase", "vernacular-names", "free for non-commercial research use"),
        ("Wikidata", "vernacular-names", "CC0"),
    ]
    execute_values(cur,
                   "insert into datasets_metadata (source_name, dataset_type, license, "
                   "last_synced_at) values %s",
                   [(s, t, lic, datetime.now(timezone.utc)) for s, t, lic in rows])
    print(f"  {'datasets_metadata':34s} {len(rows):>7,} rows")


def summarise(cur):
    print("\nFinal row counts:")
    cur.execute("select table_name from information_schema.tables "
                "where table_schema='public' order by table_name")
    for (t,) in cur.fetchall():
        cur.execute(f'select count(*) from public."{t}"')
        n = cur.fetchone()[0]
        if n:
            print(f"  {t:34s} {n:>9,}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truncate", action="store_true",
                    help="wipe all data first (schema is kept)")
    ap.add_argument("--only-fao-catch", action="store_true",
                    help="load just the FAO species catch (plus the regions and "
                         "species it references) into an existing database")
    args = ap.parse_args()

    conn = connect()
    try:
        with conn.cursor() as cur:
            if args.truncate:
                cur.execute(
                    "truncate species_occurrences, molecular_records, "
                    "oceanographic_readings, sensor_readings, weather_observations, "
                    "fisheries_national_totals, fisheries_catch, species, "
                    "oceanographic_stations, regions, datasets_metadata "
                    "restart identity cascade")
                print("Truncated existing data.\n")

            if args.only_fao_catch:
                load_fisheries_catch_fao(cur, load_regions(cur), load_species(cur))
                cur.execute("insert into datasets_metadata (source_name, dataset_type, license, "
                            "last_synced_at) select 'FAO', 'fisheries', 'CC-BY 4.0', now() "
                            "where not exists (select 1 from datasets_metadata where source_name = 'FAO')")
                conn.commit()
                return

            print("Loading reference data ...")
            regions = load_regions(cur)
            load_region_boundaries(cur)
            stations = load_stations(cur, regions)
            species = load_species(cur)

            print("\nLoading observations ...")
            load_ocean_readings(cur, stations)
            load_sensor_readings(cur, stations)
            load_weather(cur, regions, stations)
            load_occurrences(cur, species)
            load_fisheries(cur)
            load_fisheries_catch(cur, regions, species)
            load_fisheries_catch_fao(cur, regions, species)
            load_molecular(cur, species)

            print("\nPost-processing ...")
            backfill_geometry(cur)
            record_metadata(cur)

            conn.commit()
            summarise(cur)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
