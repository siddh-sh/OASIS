# API Reference

Every route registered in `backend/app/main.py`, checked against the live
OpenAPI schema (`GET /openapi.json`, human view at `/docs`) — not just
copied from `flow.md` §11's plan, since routes gained params during
implementation (e.g. `bbox` filters, pagination on every list endpoint).
Run the backend and open `http://localhost:8000/docs` for the interactive,
always-current version; this file is the narrative companion.

All list endpoints return `{ items, total, limit, offset }` and accept
`limit`/`offset` pagination. Geospatial filters (`bbox`) use PostGIS
`ST_Intersects`, not manual lat/lon range math — format is
`min_lon,min_lat,max_lon,max_lat`.

## Auth (`/auth`)

Thin proxies to Supabase Auth's REST API — no password handling in this app.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | `{email, password, full_name?, institution?}` → also creates the matching `profiles` row |
| POST | `/auth/login` | `{email, password}` → `{access_token, refresh_token, expires_in}` |
| POST | `/auth/logout` | Requires bearer token; revokes the refresh token server-side |
| GET | `/auth/me` | Requires bearer token; returns the `profiles` row |

## Ocean & satellite (`/api/ocean`)

| Method | Path | Params |
|---|---|---|
| GET | `/api/ocean/stations` | `station_type` (`in-situ-buoy`\|`coastal-anchor`\|`satellite-grid`), `bbox`, `limit`, `offset` |
| GET | `/api/ocean/readings` | `station_id`, `start_date`, `end_date`, `limit`, `offset` — satellite-derived SST/chlorophyll |
| GET | `/api/ocean/readings/summary` | `variable` (required: `sst`\|`chlorophyll_a`\|`salinity`\|`dissolved_oxygen`\|`ph`), `region_id` — avg/min/max/count grouped by region |
| GET | `/api/ocean/sensor-readings` | `station_id`, `start_date`, `end_date`, `limit`, `offset` — in-situ RAMA/TAO buoy readings, a **separate table** from satellite readings (see `schema.sql`'s Sensors-vs-Satellites reconciliation note) |

## Weather (`/api/weather`)

| Method | Path | Params |
|---|---|---|
| GET | `/api/weather/observations` | `region` (name), `start_date`, `end_date`, `limit`, `offset` |

## Species / biodiversity (`/api/species`)

| Method | Path | Params |
|---|---|---|
| GET | `/api/species` | `q` (substring on scientific/common name), `kingdom`, `limit`, `offset` |
| GET | `/api/species/occurrences` | `bbox`, `species_id`, `start_date`, `end_date`, `limit`, `offset` |
| GET | `/api/species/{species_id}` | 404 if not found |

## Fisheries (`/api/fisheries`)

| Method | Path | Params |
|---|---|---|
| GET | `/api/fisheries/catch` | `region`, `species_id`, `start_date`, `end_date`, `limit`, `offset` — **currently always empty**; `fisheries_catch` is granular CMFRI data not yet transcribed (CMFRI has no public API) |
| GET | `/api/fisheries/summary` | `region`, `start_year`, `end_year` — returns both `national_totals` (real, populated, annual FAO-via-OWID data) and `granular_catch` (empty) honestly rather than faking a shared grain |

## Molecular / eDNA (`/api/molecular`)

| Method | Path | Params |
|---|---|---|
| GET | `/api/molecular/records` | `species_id`, `limit`, `offset` — BOLD DNA barcode records |

## Admin (`/api/admin`) — requires `role = 'admin'`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/datasets/status` | Reads `datasets_metadata`: source, last sync, record count, license, cleaning notes |
| POST | `/api/admin/sync/{source}` | 501 — wires a live collector re-run in Phase 7 |

## Analytics — live (Phase 4)

Backed by `backend/app/ml/`. Every predictive response embeds a `skill`
object comparing the model to a persistence baseline, because two of the
three models barely beat it — see [`model-cards.md`](model-cards.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/analytics/anomalies?region&domain&variable&severity&start_date&end_date&limit` | Detected events from `anomaly_events` (1,375 rows: 738 SST, 637 chlorophyll). `station_id` carries the location — satellite grid cells have no `region_id`. |
| GET | `/api/analytics/anomalies/catch-decline?limit` | Species with declining catch trends over their last decade of record. Separate feed from point anomalies by design. |
| GET | `/api/analytics/forecast/ocean-conditions?station_id&variable&horizon` | `variable` is `sst` or `chlorophyll_a`; `horizon` is 1–10 8-day composites. 404 if the station has no history for that variable (chlorophyll covers 177 of 458 stations). |
| GET | `/api/analytics/predict/catch?species_id&region_id` | Next-year tonnage with SHAP attribution. Persists to `ml_predictions` and returns `prediction_id`. Needs ≥6 consecutive annual observations, else 404. |
| GET | `/api/analytics/explain/{prediction_id}` | SHAP contributions for a stored prediction. Additive in the model's target space (log-tonnes for catch) — sum before exponentiating, never term by term. |

### Still stubbed

| Method | Path | Lands in |
|---|---|---|
| GET | `/api/analytics/recommendation/{prediction_or_anomaly_id}` | Phase 5 |
| GET | `/api/analytics/correlation?var1&var2&region` | Phase 6 (Should-Have) |

## Agent — all 501 stubs (Phase 5/6)

| Method | Path | Lands in |
|---|---|---|
| POST | `/api/agent/chat` | Phase 5 |
| GET | `/api/agent/conversations/{conversation_id}` | Phase 5 |
| POST | `/api/agent/report` | Phase 6 (Should-Have) |

## Meta

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status, environment}` — no DB dependency, used for uptime checks |
