-- OASIS unified marine data platform — finalized DB schema (Week 1, Developer C)
--
-- This reconciles the schema drafted in flow.md §12.1 against the REAL data
-- pulled into data-pipeline/seeds/raw/ (see docs/developer-c-week1-flow.md
-- for how each source was verified). Every deviation from the original
-- draft below is called out with a comment explaining why the real data
-- forced the change.
--
-- Run against the Supabase Postgres instance (SQL editor or psql). Requires
-- the postgis and pgvector extensions, both available on Supabase by default.

create extension if not exists postgis;
create extension if not exists vector;

-- ============================================================
-- Shared spatial reference
-- ============================================================

create table regions (
    region_id       serial primary key,
    name            text not null unique,
    state           text,
    geom            geography(Polygon, 4326)
);

-- Reconciliation: oceanographic_stations now represents BOTH real named
-- coastal stations (weather anchor points, e.g. Kochi, Chennai) AND the
-- sampled satellite grid cells from NOAA ERDDAP (which have no station name,
-- just a lat/lon on a ~0.75deg grid). station_type distinguishes them so a
-- single table + FK design still works instead of needing two station
-- tables.
create table oceanographic_stations (
    station_id      serial primary key,
    name            text,                       -- null for satellite-grid points
    station_type    text not null check (station_type in ('in-situ-buoy', 'coastal-anchor', 'satellite-grid')),
    wmo_platform_code integer,                  -- real WMO id, populated for moored buoys only
    lat             double precision not null,
    lon             double precision not null,
    region_id       integer references regions(region_id),
    geom            geography(Point, 4326),
    -- A station is uniquely identified by where it is and what kind it is.
    -- Without this, re-running the loader silently duplicates every station.
    unique (lat, lon, station_type)
);
create index idx_ocean_stations_geom on oceanographic_stations using gist (geom);

-- ============================================================
-- Oceanographic + satellite-derived
-- ============================================================

-- Reconciliation: SST (noaacwBLENDEDCsstDaily) and chlorophyll
-- (nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily) come from two DIFFERENT
-- satellite products with different grids and cadences — they are NOT
-- guaranteed to be co-located per timestamp. Rather than force them into
-- one row, this table stays wide (sst/chlorophyll_a both nullable) and a
-- given row will typically have only one populated, distinguished by
-- `source`. Don't assume both columns are non-null together.
create table oceanographic_readings (
    id                  bigserial primary key,
    station_id          integer not null references oceanographic_stations(station_id),
    "timestamp"         timestamptz not null,
    sst                 numeric,                -- degrees C, from noaacwBLENDEDCsstDaily
    chlorophyll_a       numeric,                -- mg/m3, from nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily
    salinity            numeric,                -- not yet sourced live — reserved for Week 2+
    dissolved_oxygen    numeric,                -- not yet sourced live — reserved for Week 2+
    ph                  numeric,                -- not yet sourced live — reserved for Week 2+
    source              text not null,
    created_at          timestamptz not null default now(),
    -- Idempotent re-load: SST and chlorophyll arrive as separate rows from
    -- separate products, so source is part of the key.
    unique (station_id, "timestamp", source)
);
create index idx_ocean_readings_station_time on oceanographic_readings (station_id, "timestamp");

-- ============================================================
-- Sensors (in-situ moored buoys) — the PPT's "Sensors" source icon
-- ============================================================

-- Reconciliation: the source PPT lists "Sensors" and "Satellites" as two
-- SEPARATE data sources, and they genuinely are: oceanographic_readings
-- above holds satellite remote-sensing products (radiance-derived SST and
-- ocean colour over a grid), while this table holds real physical
-- instruments moored in the water column (NOAA PMEL RAMA/TAO array,
-- telemetered via Argos).
--
-- Kept as its own table rather than folded into oceanographic_readings
-- because a buoy reports a MULTI-VARIABLE payload from one instrument at
-- one fixed point (SST + air temp + wind + humidity + pressure + salinity
-- together), whereas satellite rows are single-variable per grid cell per
-- pass. Same reason `salinity` is real here but reserved/null above:
-- buoys measure it directly, our satellite products do not.
--
-- Real-world coverage caveat, do not "fix" this by inventing stations:
-- RAMA buoys sit in the OPEN Indian Ocean (equatorial belt, Bay of Bengal
-- at 90E), not along India's coastline. Only ~2 fall inside the strict
-- 6-23N/68-90E coastal bbox used elsewhere, so the collector widens to
-- 0-23N/60-95E. Expect these stations to be far offshore relative to the
-- coastal weather anchors, and expect real gaps (buoy outages produce
-- genuine NaN runs in the source data).
create table sensor_readings (
    id                      bigserial primary key,
    station_id              integer not null references oceanographic_stations(station_id),
    obs_date                date not null,
    sst_c                   numeric,
    air_temp_c              numeric,
    wind_speed_ms           numeric,
    rel_humidity_pct        numeric,
    barometric_pressure_hpa numeric,
    salinity_psu            numeric,
    source                  text not null default 'NOAA-PMEL-RAMA',
    created_at              timestamptz not null default now(),
    unique (station_id, obs_date, source)
);
create index idx_sensor_readings_station_date on sensor_readings (station_id, obs_date);

-- ============================================================
-- Weather
-- ============================================================

-- Reconciliation: Open-Meteo's real daily response gives temp_max_c and
-- temp_min_c, not a single air_temp figure. Keeping both (rather than
-- collapsing to one averaged column) preserves real signal the anomaly
-- detector will want later (e.g. heatwave detection cares about max, not
-- average).
create table weather_observations (
    id                  bigserial primary key,
    region_id           integer not null references regions(region_id),
    station_id          integer references oceanographic_stations(station_id), -- reuses the same anchor-point stations
    obs_date            date not null,
    temp_max_c          numeric,
    temp_min_c          numeric,
    precipitation_mm    numeric,
    wind_speed_kmh      numeric,
    pressure_hpa        numeric,
    source              text not null default 'Open-Meteo',
    created_at          timestamptz not null default now(),
    unique (station_id, obs_date, source)
);
create index idx_weather_region_date on weather_observations (region_id, obs_date);

-- ============================================================
-- Species / biodiversity
-- ============================================================

create table species (
    species_id          serial primary key,
    scientific_name     text not null unique,
    common_name         text,
    kingdom             text,
    phylum              text,
    class               text,
    "order"             text,
    family              text,
    genus               text,
    species_epithet     text,
    iucn_status         text
);

-- Reconciliation: OBIS records come with sst, sss (sea surface salinity),
-- bathymetry, and shoredistance already embedded per occurrence — free
-- cross-validation data against our own oceanographic_readings. Kept as
-- nullable bonus columns rather than discarded; they'll only be populated
-- when source = 'OBIS' (GBIF records leave them null).
create table species_occurrences (
    id                  bigserial primary key,
    species_id          integer references species(species_id),
    lat                 double precision,
    lon                 double precision,
    geom                geography(Point, 4326),
    occurred_at         timestamptz,
    depth               numeric,
    basis_of_record     text,
    sst                 numeric,        -- OBIS-only bonus field
    sss                 numeric,        -- OBIS-only bonus field
    bathymetry          numeric,        -- OBIS-only bonus field
    shoredistance       numeric,        -- OBIS-only bonus field
    source              text not null,  -- 'OBIS' | 'GBIF'
    external_id         text            -- occurrenceID from the source, for idempotent reload
);
create index idx_species_occ_geom on species_occurrences using gist (geom);
create index idx_species_occ_species_time on species_occurrences (species_id, occurred_at);
create unique index uq_species_occ_source_external on species_occurrences (source, external_id);

-- ============================================================
-- Fisheries
-- ============================================================

-- Reconciliation: the real FAO data (via OWID) is NATIONAL-AGGREGATE ONLY —
-- India, per year, one number. It does not have species or region breakdown,
-- so it cannot honestly populate fisheries_catch(species_id, region_id, ...)
-- as originally drafted. Given its own table instead.
create table fisheries_national_totals (
    id                  bigserial primary key,
    country             text not null default 'India',
    year                integer not null,
    catch_metric_tons   numeric not null,
    source              text not null default 'FAO-via-OWID',
    unique (country, year, source)
);

-- Reconciliation: populated from Sea Around Us (source 'SAU'), whose catch
-- reconstruction IS broken down by taxon and year within each EEZ — 14,214
-- taxon-year rows for the two Indian EEZs. Kept separate from
-- fisheries_national_totals above because the two measure different things:
-- FAO reports official landings, SAU reconstructs total extraction including
-- estimated discards and unreported/illegal catch. Summing them would double
-- count.
--
-- species_id is NULL for the ~118 higher-rank taxa SAU reports (families and
-- orders like Penaeidae, Decapoda) — those are genuinely not species and are
-- not forced into the species table.
--
-- gear_type stays NULL: SAU exposes gear as a parallel aggregation of the
-- same total rather than a species x gear crosstab (the API silently ignores
-- a gear filter on the taxon endpoint), so populating it would double catch
-- totals. See data-pipeline/collectors/sea_around_us.py.
--
-- external_id (added in migration 0002) is "<eez_id>:<sau_entity_id>:<year>",
-- giving the unique natural key that makes reload idempotent — the same
-- (source, external_id) pattern species_occurrences uses.
create table fisheries_catch (
    id                  bigserial primary key,
    species_id          integer references species(species_id),
    region_id           integer references regions(region_id),
    catch_date          date not null,
    catch_weight_kg     numeric not null,
    gear_type           text,
    source              text not null,      -- 'SAU'
    external_id         text                -- for idempotent reload
);
create index idx_fisheries_region_date on fisheries_catch (region_id, catch_date);
create unique index uq_fisheries_catch_source_external on fisheries_catch (source, external_id);

-- ============================================================
-- Molecular / eDNA
-- ============================================================

-- Reconciliation: field mapping from the real BOLD portal.boldsystems.org
-- response — processid -> process_id (used as the stable natural key for
-- idempotent reload), nuc -> barcode_sequence, marker_code kept as-is
-- (mostly 'COI-5P' in the real data pulled), bin_uri kept as a bonus column
-- (BOLD's own species-cluster hash — useful later for the eDNA
-- similarity-search Should-Have feature since records sharing a BIN are
-- BOLD's own notion of "same species cluster").
create table molecular_records (
    id                  bigserial primary key,
    species_id          integer references species(species_id),  -- nullable: BOLD id can be genus-level only
    process_id          text not null unique,
    bin_uri             text,
    barcode_sequence    text,
    marker_gene         text,
    identification      text,          -- raw BOLD identification string, fallback when species_id is null
    country             text,
    province_state      text,
    lat                 double precision,
    lon                 double precision,
    collected_at        date,
    source              text not null default 'BOLD'
);
create index idx_molecular_species on molecular_records (species_id);

-- ============================================================
-- ML / agents / vector store / auth-adjacent (unchanged from flow.md §12.1,
-- included here for completeness — not yet exercised by Week 1 data)
-- ============================================================

create table ml_predictions (
    id                  bigserial primary key,
    model_name          text not null,
    target_type         text not null,
    input_ref           text,
    predicted_value     numeric,
    confidence          numeric,
    shap_values         jsonb,
    created_at          timestamptz not null default now()
);

-- Reconciliation: station_id and the natural key were added in migration
-- 0003, once real detection ran. region_id alone cannot locate these events —
-- SST and chlorophyll anomalies occur at satellite grid cells, and every
-- satellite station has region_id NULL (open ocean, and regions.geom is not
-- populated, so there is no spatial join to infer one). The unique index is
-- partial because station_id is nullable and Postgres treats NULLs as
-- distinct, which would let duplicates through on re-detection.
create table anomaly_events (
    id                  bigserial primary key,
    domain              text not null,
    region_id           integer references regions(region_id),
    station_id          integer references oceanographic_stations(station_id),
    variable            text not null,
    detected_at         timestamptz not null,
    severity            text,
    metric_value        numeric,
    threshold_value     numeric
);
create index idx_anomaly_domain_time on anomaly_events (domain, detected_at);
create index idx_anomaly_station on anomaly_events (station_id);
create unique index uq_anomaly_variable_station_time
    on anomaly_events (variable, station_id, detected_at)
    where station_id is not null;

create table recommendations (
    id                  bigserial primary key,
    ml_prediction_id    bigint references ml_predictions(id),
    anomaly_event_id    bigint references anomaly_events(id),
    narrative           text not null,
    created_at          timestamptz not null default now()
);

-- Reconciliation: 384 dimensions, not the 1536 originally drafted for
-- OpenAI's ada-002. This project runs on free tiers and its LLM provider
-- (Groq) has no embeddings endpoint, so vectors are generated locally with
-- fastembed / BAAI/bge-small-en-v1.5 (ONNX, no torch, no API key), which
-- emits 384 dims. Padding to 1536 would waste storage and overstate the
-- precision of the data. Changed in migration 0004.
create table embeddings (
    id                  bigserial primary key,
    source_table        text not null,
    source_id           text not null,
    content             text not null,
    embedding           vector(384)
);
create unique index uq_embeddings_source on embeddings (source_table, source_id);
-- NOTE: the ivfflat index is deliberately NOT created here. ivfflat builds
-- its clusters from the rows present at creation time, so building it on an
-- empty table gives poor recall. Create it in Week 3, AFTER the embeddings
-- are loaded:
--   create index idx_embeddings_vec on embeddings
--       using ivfflat (embedding vector_cosine_ops) with (lists = 100);
-- Also revisit vector(1536) if a different embedding model is chosen —
-- the dimension must match the model exactly.

create table datasets_metadata (
    id                  bigserial primary key,
    source_name         text not null,
    dataset_type        text not null,
    last_synced_at      timestamptz,
    record_count        integer,
    license             text,
    last_cleaning_notes text
);

-- ============================================================
-- Auth-adjacent + agent conversation history
-- ============================================================

-- Supabase manages auth.users itself; this extends it with app-specific
-- fields. The FK to auth.users means a deleted user cascades cleanly.
create table profiles (
    user_id     uuid primary key references auth.users(id) on delete cascade,
    email       text,
    full_name   text,
    role        text not null default 'researcher'
                check (role in ('researcher', 'policymaker', 'admin')),
    institution text,
    created_at  timestamptz not null default now()
);

create table agent_conversations (
    id          bigserial primary key,
    user_id     uuid references profiles(user_id) on delete cascade,
    title       text,
    created_at  timestamptz not null default now()
);
create index idx_agent_conv_user on agent_conversations (user_id, created_at desc);

create table agent_messages (
    id              bigserial primary key,
    conversation_id bigint not null references agent_conversations(id) on delete cascade,
    role            text not null check (role in ('user', 'assistant', 'tool')),
    content         text not null,
    tool_calls      jsonb,
    created_at      timestamptz not null default now()
);
create index idx_agent_msg_conv on agent_messages (conversation_id, created_at);
