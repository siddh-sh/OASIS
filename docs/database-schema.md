# Database Schema

Human-readable companion to [`backend/db/schema.sql`](../backend/db/schema.sql)
(the actual source of truth — this file summarizes it, never edit the
schema here). 18 tables, requires the `postgis` and `vector` Postgres
extensions (both available on Supabase by default).

`backend/app/db/models.py` is a 1:1 SQLAlchemy mirror of every table below;
`backend/alembic/versions/0001_baseline.py` applies `schema.sql` verbatim as
the Alembic baseline revision, so there's exactly one place the DDL is
written by hand.

## Shared spatial reference

**`regions`** — `region_id` PK, `name` (unique), `state`, `geom` (PostGIS polygon). Every domain's region FK points here.

## Oceanographic + satellite

**`oceanographic_stations`** — `station_id` PK, `name` (null for satellite-grid points), `station_type` (`in-situ-buoy` \| `coastal-anchor` \| `satellite-grid`), `wmo_platform_code`, `lat`/`lon`, `region_id` FK, `geom`. Unique on `(lat, lon, station_type)`.

> **Reconciliation:** one table holds three genuinely different kinds of "station" — real named coastal anchors, real WMO-coded moored buoys, and anonymous satellite grid cells — distinguished by `station_type` rather than three separate tables, because they share the same downstream joins (readings, weather).

**`oceanographic_readings`** — satellite-derived SST/chlorophyll. `station_id` FK, `timestamp`, `sst`, `chlorophyll_a`, `salinity`/`dissolved_oxygen`/`ph` (reserved, not yet sourced live), `source`. Unique on `(station_id, timestamp, source)`.

> **Reconciliation:** `sst` and `chlorophyll_a` come from two *different* satellite products (different grids, different cadences) and are almost never both populated on the same row — don't assume co-location per timestamp.

**`sensor_readings`** — in-situ RAMA/TAO buoy readings, the PPT's "Sensors" source (distinct from "Satellites"). `station_id` FK, `obs_date`, `sst_c`, `air_temp_c`, `wind_speed_ms`, `rel_humidity_pct`, `barometric_pressure_hpa`, `salinity_psu`, `source` (default `NOAA-PMEL-RAMA`). Unique on `(station_id, obs_date, source)`.

> **Reconciliation:** a genuinely separate table, not a variant of `oceanographic_readings` — a buoy reports six variables from one instrument at one fixed point in the *open* ocean (not the coast); a satellite row is one variable per grid cell per pass. Real buoy outages produce genuine NaN runs — a row is kept if *any* variable is present.

## Weather

**`weather_observations`** — `region_id` FK, `station_id` FK (reuses coastal-anchor stations), `obs_date`, `temp_max_c`, `temp_min_c`, `precipitation_mm`, `wind_speed_kmh`, `pressure_hpa`, `source` (default `Open-Meteo`). Unique on `(station_id, obs_date, source)`.

> **Reconciliation:** kept real `temp_max_c`/`temp_min_c` rather than collapsing to one averaged `air_temp` — max matters for heatwave detection later.

## Species / biodiversity

**`species`** — `species_id` PK, `scientific_name` (unique — the cross-source dedup key), `common_name`, full taxonomy (`kingdom`…`species_epithet`), `iucn_status`.

**`species_occurrences`** — `species_id` FK, `lat`/`lon`/`geom`, `occurred_at`, `depth`, `basis_of_record`, plus OBIS-only bonus columns `sst`/`sss`/`bathymetry`/`shoredistance` (null for GBIF rows), `source` (`OBIS`\|`GBIF`), `external_id`. Unique on `(source, external_id)`.

> **Reconciliation:** OBIS embeds oceanographic covariates per occurrence — free cross-validation against `oceanographic_readings` — kept as nullable bonus columns rather than discarded.

## Fisheries

**`fisheries_national_totals`** — `country`, `year`, `catch_metric_tons`, `source` (default `FAO-via-OWID`). Unique on `(country, year, source)`. **Populated, real.**

**`fisheries_catch`** — `species_id` FK, `region_id` FK, `catch_date`, `catch_weight_kg`, `gear_type`, `source`. **Currently empty.**

> **Reconciliation:** FAO's real data is national-annual-aggregate only — it cannot honestly populate a granular `(species_id, region_id, date)` table. Split into two tables rather than forcing a fake breakdown; `fisheries_catch` stays as designed for CMFRI data, added manually since CMFRI has no public API.

## Molecular / eDNA

**`molecular_records`** — `species_id` FK (nullable — BOLD IDs can be genus-level only), `process_id` (unique, the idempotent natural key), `bin_uri` (BOLD's own species-cluster hash), `barcode_sequence`, `marker_gene`, `identification` (raw fallback text), `country`/`province_state`/`lat`/`lon`/`collected_at`, `source` (default `BOLD`).

## ML / agents / vector store (schema exists, not yet exercised by real rows)

- **`ml_predictions`** — `model_name`, `target_type`, `input_ref`, `predicted_value`, `confidence`, `shap_values` (jsonb). Populated by Phase 4.
- **`anomaly_events`** — `domain`, `region_id` FK, `variable`, `detected_at`, `severity`, `metric_value`, `threshold_value`. Populated by Phase 4.
- **`recommendations`** — `ml_prediction_id` FK (nullable), `anomaly_event_id` FK (nullable), `narrative`. Populated by Phase 5.
- **`embeddings`** — `source_table`, `source_id`, `content`, `embedding` (`vector(1536)`). Populated by Phase 5. **The `ivfflat` index is deliberately not created in `schema.sql`** — building it against an empty table gives poor recall; create it after Phase 5 loads real embeddings:
  ```sql
  create index idx_embeddings_vec on embeddings
      using ivfflat (embedding vector_cosine_ops) with (lists = 100);
  ```
  Revisit `vector(1536)` if a different embedding model than the current default is chosen — the dimension must match exactly.
- **`datasets_metadata`** — `source_name`, `dataset_type`, `last_synced_at`, `record_count`, `license`, `last_cleaning_notes`. Powers `/api/admin/datasets/status`; `last_cleaning_notes` will surface Phase 5's Cleaning Agent output.

## Auth-adjacent

- **`profiles`** — `user_id` (PK, FK to Supabase's `auth.users`, cascade delete), `email`, `full_name`, `role` (`researcher`\|`policymaker`\|`admin`), `institution`.
- **`agent_conversations`** — `user_id` FK, `title`. Populated by Phase 5.
- **`agent_messages`** — `conversation_id` FK (cascade delete), `role` (`user`\|`assistant`\|`tool`), `content`, `tool_calls` (jsonb). Populated by Phase 5.

## Indexes

GIST on every `geom` column; B-tree on every FK; composite indexes on the
hot filter paths (`species_occurrences(species_id, occurred_at)`,
`fisheries_catch(region_id, catch_date)`,
`oceanographic_readings(station_id, timestamp)`,
`weather_observations(region_id, obs_date)`,
`anomaly_events(domain, detected_at)`). Full list in `schema.sql`.

## Unification strategy

The six domains don't share a spatial/temporal grain (satellite: ~0.75°
grid/8-day; buoys: ~10 fixed points/daily; weather: 18 fixed
points/daily; biodiversity: scattered points/irregular; fisheries: one
national figure/annual). Unification runs through three hub keys:

- **Space** — every geo-located record carries a PostGIS `geography(Point,
  4326)`; any domain joins to any other by proximity (`ST_DWithin`) or
  containment in a `regions` polygon.
- **Time** — everything normalizes to a timestamp/date, then aggregates up
  to a common grain at join time (Phase 4's Feature Engineering Agent).
- **Taxonomy** — `species.scientific_name` is the hub; `species_occurrences`,
  `fisheries_catch`, and `molecular_records` all key into it via
  `species_id`.

See [`docs/developer-c-week1-flow.md`](developer-c-week1-flow.md) for the
full grain table and how each source was verified real.
