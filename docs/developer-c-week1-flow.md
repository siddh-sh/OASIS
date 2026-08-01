# Developer C — Week 1 Flow (Data Collection → Schema → DB)

This is the step-by-step flow for Developer C's Week 1 ownership: DB schema for all 6 domains, plus the ocean/satellite/weather/biodiversity/fisheries/molecular connectors (per `flow.md` §5, §6, §8, §16).

## Status: Step 1 (real data collection) is done

All six domains now have **real, live-fetched data** in `data-pipeline/seeds/raw/` — nothing here is synthetic or mocked. Every collector hits a real public API/source and was verified against actual response data during development (see "How each source was verified" below).

Mapping to the six data-source icons on the PPT's proposed-solution slide (Satellites / Sensors / Fisheries / Biodiversity / Weather / Genomics):

| PPT source icon | Our source | Records | Coverage |
|---|---|---|---|
| **Satellites** | NOAA ERDDAP SST (`noaacwBLENDEDCsstDaily`) | 62,790 | All-India bbox, ~0.75° spacing, every 8th day, 2024-07-30 to 2026-07-25 |
| **Satellites** | NOAA ERDDAP chlorophyll (`nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily`) | 21,672 | Same grid/cadence, 2024-07-30 to 2026-07-18 |
| **Sensors** | NOAA PMEL RAMA/TAO moored buoy array (in-situ) | 5,066 | Open Indian Ocean −5–23°N/60–95°E — 13 real buoy stations, daily, 6 variables, 2024-07-30 to 2026-07-03 |
| **Weather** | Open-Meteo Historical Weather API | 13,068 | 18 coastal stations (Gujarat→West Bengal), 2024-07-30 to 2026-07-25, daily |
| **Biodiversity** | OBIS API v3 (primary) | 6,000 | All-India coastal bbox, 842 distinct species, embeds sst/sss/bathymetry per record |
| **Biodiversity** | GBIF Occurrence API (backfill) | 4,000 | Cross-referenced against the top 60 OBIS-confirmed species names |
| **Fisheries** | FAO capture production (via Our World in Data CSV export) | 65 | India, annual, 1960–2024 (national aggregate, not yet species/region-level) |
| **Genomics** | BOLD Systems Data Portal API (v5, `portal.boldsystems.org`) | 2,000 of 81,679 available | India, DNA barcode records — skews heavily marine (Teleostei + Elasmobranchii are the top two classes) |

**114,661 real records** across `data-pipeline/seeds/raw/{weather,oceanographic,sensors,biodiversity,fisheries,molecular}/`.

### Why "Sensors" is separate from "Satellites"

These are genuinely different instruments, not two names for the same thing, and the PPT is right to list them separately:

- **Satellites** = remote sensing. Instruments in orbit measure infrared/ocean-colour radiance and derive SST and chlorophyll over a *grid*. ~4km pixels, one variable per product, global coverage, but nothing below the surface and nothing at a specific point.
- **Sensors** = in-situ. Physical buoys moored in the water at a *fixed point*, measuring SST, air temp, wind, humidity, pressure and salinity from the same instrument, telemetered via Argos. Ground truth, but sparse.

They also justify separate DB tables (see `backend/db/schema.sql`): a buoy row is a multi-variable payload at one point; a satellite row is one variable per grid cell per pass. Salinity is real in the buoy data and null in the satellite data for exactly this reason.

**Real coverage caveat — don't "fix" this by inventing stations.** RAMA buoys sit in the *open* Indian Ocean (equatorial belt around 65–67°E and 80.5°E, plus Bay of Bengal at 90°E and one at 95°E), not hugging India's coast. Only ~2 fall inside the strict 6–23°N/68–90°E coastal bbox used everywhere else, so `rama_buoys.py` deliberately widens to −5–23°N/60–95°E, which reaches 13 real stations.

Expect real data gaps: buoy outages produce genuine `NaN` runs in the source. Verified live — of 4,385 SST rows returned, only 2,934 carried an actual value, and barometric pressure exists for just 876 rows (only some buoys carry that instrument). Station `0n67e` returns NaN SST for a week straight while `0n80.5e` reports real 30.2–30.4°C over the same period. That is what real observational data looks like; the loader must treat missing values as expected, not as a parsing failure.

Verified value ranges (all physically plausible for the tropical Indian Ocean): SST 25.3–31.8°C, air temp 22.6–31.1°C, wind 0.2–13.1 m/s, humidity 36.5–99.8%, pressure 997.5–1016.2 hPa, salinity 32.2–36.9 PSU (open ocean baseline is ~35).

## How each source was verified real (not assumed)

- **Weather**: sanity-checked value ranges (20–44°C, monsoon precipitation spikes up to 227mm) — physically real, not flat/random.
- **SST/Chlorophyll**: NOAA's own API rejected out-of-range date queries with real error messages, which is how the actual available windows were discovered (`noaacwNPPVIIRSchlaDaily`, the dataset originally planned in `flow.md`, turned out to be a rolling ~13-month window — swapped for `nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily`, which has full 2018–present coverage). SST range came back 19.8–32.1°C, chlorophyll 0.01–96.6 mg/m³ — both physically plausible for Indian coastal waters.
- **OBIS/GBIF**: GBIF's `class=Actinopterygii` filter turned out to be a silent no-op (verified live — it let birds/insects/plants through). Fixed by backfilling GBIF against OBIS's own confirmed species list instead of guessing a taxon key.
- **FAO fisheries**: FAO's own site has no plain CSV/API (FishStatJ desktop software or a JS query panel only) — used Our World in Data's CSV mirror of the same FAO dataset instead. India's real capture production numbers (4.66M tons in 2020 → 6.36M tons in 2024) match known growth trends.
- **BOLD**: the `v4.boldsystems.org` API referenced in most tutorials/docs is now literally offline (returns a page titled "BOLD Public Offline"). Found the real replacement (`portal.boldsystems.org`) by reading its live `openapi.json`, reverse-engineering the two-step query flow (`/api/query` → `/api/documents/{query_id}`), and discovering the default page size was 1 (not documented) — fixed by setting `length=500`. Confirmed real DNA sequences returned for 2000/2000 records fetched.
- **RAMA buoys**: station list was not assumed — queried `pmelTaoDySst` live for distinct stations inside the Indian Ocean bbox and hardcoded only the 10 that actually returned. Confirmed real NaN gaps in the source (e.g. `0n67e` returns NaN for a week straight while `0n80.5e` returns real 30.2–30.4°C over the same period), which is genuine buoy-outage behaviour, not a parsing bug.

## No image data (and why that's deliberate)

None of the collectors pull imagery. Two of the sources do expose images and were consciously skipped: BOLD has an `/api/images` endpoint (specimen photos), and GBIF occurrence records carry a `media` field with photo URLs.

This follows `flow.md` §1: "molecular" here means eDNA/genomic barcode **sequences** (text), and image/otolith species classification sits in Future Scope. The PPT's own literature review frames CNN-based fish-image classification (Saleh et al., CMFRI) as exactly the narrow, single-task prior work this platform is meant to surpass — so building another fish-photo classifier would undercut the research-gap argument rather than support it.

Worth being explicit about a related misconception: **satellites cannot identify species.** The sensors behind our SST/chlorophyll data measure radiance at ~4km per pixel from orbit — they detect water temperature and plankton concentration, not visual images of fish. Species-level ML in this project comes from DNA barcodes (BOLD) and occurrence records (OBIS/GBIF). What satellite data *does* feed is **fish stock/catch volume prediction** from ocean conditions, which is a tabular regression problem and matches the PPT objective's actual wording ("predict fish stock availability").

If specimen photos are wanted later for a Species Explorer page, extracting GBIF `media` / BOLD `/api/images` URLs is a cheap addition with no ML involved.

## How the different formats get combined

Worth separating three layers, because "different formats" is the easy part and different *grains* is the hard part.

**Layer 1 — Format normalization (done).** Every source arrives shaped differently: ERDDAP CSV wedges a units row between the header and the data; Open-Meteo returns column-oriented JSON (parallel arrays, not row objects); OBIS/GBIF/BOLD return nested JSON; FAO is a flat CSV. Each collector already flattens its own source into a rectangular CSV in `seeds/raw/`.

**Layer 2 — Schema mapping (designed, not yet executed).** `backend/db/schema.sql` is the target shape. Per-source field translations (BOLD `nuc`→`barcode_sequence`, OBIS `decimalLatitude`→`lat`, etc.) are documented as reconciliation comments inline in that file.

**Layer 3 — Actual unification via shared keys (designed, not yet executed).** The real obstacle is that the domains don't share a grain:

| Domain | Spatial grain | Temporal grain |
|---|---|---|
| Satellite SST/chl | ~0.75° grid cells | every 8 days |
| Buoy sensors | ~10 fixed points (offshore) | daily |
| Weather | 18 fixed points (coastal) | daily |
| Biodiversity | scattered observation points | irregular event dates |
| Molecular | scattered collection points | irregular dates |
| Fisheries | one national figure | annual |

A fisheries row covering all of India for all of 2024 has no natural join to one chlorophyll pixel on one day. So unification runs through three hub keys:

- **Space** — every geo-located record carries a PostGIS `geography(Point, 4326)`, so any domain joins to any other by proximity or by containment in a `regions` polygon.
- **Time** — everything normalizes to a timestamp/date, then gets *aggregated up* to a common grain at join time (daily satellite/buoy/weather readings roll up to monthly or annual means before being compared against fisheries data).
- **Taxonomy** — `species.scientific_name` is the hub; `species_occurrences`, `fisheries_catch` and `molecular_records` all key into it via `species_id`.

That aggregate-to-common-grain step is precisely the job of the **Feature Engineering & Analytics Agent** in `flow.md` §16 — it's a resampling problem, not a formatting problem, which is why it's its own pipeline stage rather than part of cleaning.

## Step 2 (schema reconciliation) is done — see `backend/db/schema.sql`

The draft schema in `flow.md` §12.1 was written before any real data existed. Now that it does, `backend/db/schema.sql` is the finalized DDL, and every place the real data forced a change is marked with a `-- Reconciliation:` comment inline. Summary of what changed and why:

| Table | What the real data forced |
|---|---|
| `oceanographic_stations` | Added `station_type` (`in-situ-buoy` / `coastal-anchor` / `satellite-grid`) and `wmo_platform_code`, so real named stations, RAMA buoys, and anonymous satellite grid cells can share one table |
| `oceanographic_readings` | `sst` and `chlorophyll_a` stay nullable and are usually populated one-at-a-time — the two satellite products have different grids AND cadences, so they are **not** co-located per timestamp |
| `sensor_readings` | **New table.** Buoys report six variables from one instrument at one fixed point; satellite rows are one variable per grid cell. Also why `salinity` is real here but reserved/null in `oceanographic_readings` |
| `weather_observations` | Kept real `temp_max_c` + `temp_min_c` rather than collapsing to one `air_temp` — max matters for later heatwave detection |
| `species_occurrences` | Added OBIS's bonus `sst`/`sss`/`bathymetry`/`shoredistance`; null for GBIF rows. Free cross-validation against our own ocean data |
| `fisheries_national_totals` | **New table.** FAO data is national-aggregate only and genuinely does not fit `fisheries_catch(species_id, region_id, …)`. Splitting is more honest than forcing a fake species/region breakdown |
| `fisheries_catch` | Left as designed but **empty** until CMFRI's state/species-level reports are entered manually (CMFRI has no API, per `flow.md` §16.5) |
| `molecular_records` | `processid`→`process_id` as the idempotent natural key, `nuc`→`barcode_sequence`; kept `bin_uri` (BOLD's own species-cluster ID — directly useful for the eDNA similarity-search Should-Have) |

`schema.sql` has been structurally validated (15 tables, 11 indexes, balanced parens, reserved words like `"timestamp"`/`"order"` quoted) but **not executed against a live database** — there's no Supabase instance provisioned yet.

## What's next (do these in order)

1. **Provision the Supabase project** and run `backend/db/schema.sql` against it. This is the first real test of the DDL; expect minor fixes (extension availability, `vector(1536)` dimension if a different embedding model is chosen).

2. **Write the seed loader** (`data-pipeline/cleaning/load_seeds.py`, not written yet) — reads each `seeds/raw/*/*.csv`, maps columns per the reconciliation table above, and inserts. Handle these real-data facts explicitly:
   - Missing values are **expected**, not errors (buoy outages, GBIF records without `depth`).
   - `species` must be populated first and deduplicated by `scientific_name` — OBIS, GBIF, BOLD and FAO all name species independently and will collide.
   - Use the natural keys already in the schema (`molecular_records.process_id`, `species_occurrences(source, external_id)`, `sensor_readings(station_id, obs_date, source)`) so re-running is idempotent rather than duplicating.

   This is the first real exercise of the cleaning logic that the Data Integration & Cleaning Agent later automates (`flow.md` §16.7) — write it by hand first so you know exactly what mapping is needed before wrapping it in an agent.

3. **Register `regions` and `oceanographic_stations`** from the 18 coastal anchor points in `collectors/open_meteo.py` (`ANCHOR_POINTS`, `station_type='coastal-anchor'`) plus the 13 buoy stations printed by `rama_buoys.py` (`station_type='in-situ-buoy'`, with their real WMO codes). Reuse those exact lists so weather, buoy and ocean data key to the same station rows.

4. Once loaded, the minimal read API + GIS map (Week 1's demo target per `flow.md` §7) can query real data end-to-end.

## Is the data live?

Short answer: **the committed CSVs are a snapshot, but they auto-refresh on a schedule — and no marine data source is truly real-time anyway.**

### Every source has a real publication lag

Measured live against the actual APIs on 2026-08-01:

| Source | Lag behind today | Why |
|---|---|---|
| NOAA SST | ~3 days | Near-real-time satellite processing |
| Open-Meteo weather | ~4 days | ERA5 reanalysis needs settling time |
| NOAA chlorophyll | ~13 days | Gap-filled product, slower pipeline |
| RAMA buoys | ~4 weeks | Argos telemetry + quality control |
| OBIS / GBIF | months–years | Researchers submit long after fieldwork |
| BOLD genomics | months–years | Sequences published on paper timelines |
| FAO fisheries | **~1.5 years** | Annual national statistics, compiled slowly |

So a "real-time marine intelligence platform" is not achievable from any public source — fisheries data is literally annual. The defensible claim, and the one to use in the report/viva, is: **continuously updated within the latency each upstream source permits.** That demonstrates domain understanding instead of inviting an easy challenge.

(Note this nuances the PPT's research-gap line about "no studies performed real-time analysis". The gap is real, but the honest fix is automated continuous ingestion at each source's native cadence — not a claim of live streaming.)

### How liveness is implemented

**1. Rolling date windows.** `collectors/window.py` computes each collector's date range relative to *today*, padded by that source's measured lag (asking ERDDAP for data newer than it has returns a hard 404). Every collector imports it. This is what makes a refresh genuinely refresh — verified live: shifting the window pulled 252 new chlorophyll readings (21,672 → 21,924) on the next run.

**2. Scheduled GitHub Actions.** Two workflows re-run collectors and commit any newly-fetched data back to the repo:

| Workflow | Cadence | Sources |
|---|---|---|
| `.github/workflows/refresh-data-daily.yml` | daily 02:30 UTC | Weather, satellite SST + chlorophyll, buoys |
| `.github/workflows/refresh-data-weekly.yml` | Sundays 03:30 UTC | OBIS, GBIF, BOLD, FAO |

Both run on free GitHub-hosted runners, support manual triggering from the Actions tab (`workflow_dispatch`), use `continue-on-error` per collector so one upstream outage doesn't block the rest, and exit cleanly when nothing changed upstream. A `concurrency` group prevents the two from writing the seed files simultaneously.

**3. Week 2 extension — on-demand sync into Postgres.** Once Supabase exists, the same collectors get called behind `POST /api/admin/sync/{source}` (already specified in `flow.md` §11), so the dashboard's admin page can trigger a live refresh mid-demo and show `datasets_metadata.last_synced_at` updating. The schema's natural keys (`molecular_records.process_id`, `species_occurrences(source, external_id)`, `sensor_readings(station_id, obs_date, source)`) make that safely idempotent — re-syncing inserts only genuinely new rows instead of duplicating.

### Why commit snapshots at all, if it auto-refreshes?

They solve a different problem — reproducibility, not freshness:

- **All three developers work against byte-identical data.** These are live APIs: OBIS/GBIF add records continuously and BOLD's result ordering isn't stable, so two people running `bold.py` a day apart get different records. Committed seeds eliminate a whole class of "works on my machine" confusion when debugging a model or loader together.
- **Demo safety net.** If an upstream API is down or slow on demo day, the committed data still works. This is exactly the pre-seeded-data mitigation in `flow.md` §15.

What's committed: the flattened CSVs (~10 MB) that the loader actually reads. What's gitignored: the raw unflattened API responses (`*_raw.json`, ~46 MB) — nothing downstream consumes them and they regenerate on any collector run.

## Re-running the collectors

```
cd data-pipeline
pip install -r requirements.txt
python collectors/open_meteo.py      # Weather
python collectors/noaa_erddap.py     # Satellites (SST + chlorophyll)
python collectors/rama_buoys.py      # Sensors (in-situ buoys) — slow, PMEL's server takes ~10 min
python collectors/obis.py            # Biodiversity (primary)
python collectors/gbif.py            # Biodiversity (backfill; run AFTER obis.py — it reads obis output)
python collectors/fao_fisheries.py   # Fisheries
python collectors/bold.py            # Genomics
```

Each script is idempotent (re-running overwrites its own output files) and safe to re-run to refresh the data closer to the actual Week 1 build date. Only ordering constraint: `gbif.py` reads `species_occurrences_obis.csv`, so `obis.py` must run first.

## Known limitations to carry into Week 2+

- Satellite chlorophyll and SST come from different underlying grids/cadences — don't assume they're perfectly co-located per timestamp.
- FAO fisheries data is annual and national-only; CMFRI's finer-grained reports are a manual addition, not an API pull.
- BOLD's 81,679-record India total was only pulled 2,000-deep for Week 1 (volume cap) — safe to raise `MAX_RECORDS` in `collectors/bold.py` later if you want deeper molecular coverage.
- GBIF backfill only covers the top 60 species OBIS already found — it's a cross-validation set, not an independent full survey.
