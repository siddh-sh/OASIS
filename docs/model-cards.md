# Model Cards — Phase 4

Every number here was measured on the real seeded database, on a temporal
holdout, and is reproducible with `python -m app.ml.registry` from
`backend/`. Where a model fails to beat its baseline, that is stated rather
than omitted.

**The honest headline:** of the three predictive models, one earns its keep
none clearly earns its keep: chlorophyll forecasting +3.5%, catch +4.4% on
FAO data / +1.8% on Sea Around Us, SST forecasting +1.8% — all small margins
over the trivial baseline. (Chlorophyll scored +17.5% on NOAA's retired
VIIRS-only product; on its replacement, refreshed October 2026, it does not
reproduce — see §1.) The
component that works unambiguously well is the **anomaly detector**, which
is not a learned model at all. That is a reasonable outcome for this
dataset, and it is more useful to a reader than three flattering numbers.

---

## Why persistence is the baseline everywhere

"Persistence" means predicting no change: next value = last observed value.
For autocorrelated geophysical and annual-catch series it is a genuinely
strong forecast, not a straw man. A model reporting RMSE 0.55 °C sounds
precise until you learn persistence scores 0.55 °C on the same holdout.

Skill is reported as `1 − RMSE_model / RMSE_persistence`: positive means
better than assuming no change, 0 means indistinguishable.

Splits are **temporal**, never random. A random split lets a model train on
timesteps that occur after the ones it is scored on, which inflates results
badly on autocorrelated data.

---

## 1. Ocean-condition forecasting — `forecast_sst_v1`, `forecast_chlorophyll_a_v1`

| | |
|---|---|
| **Task** | Predict SST / chlorophyll-a *n* 8-day composites ahead |
| **Model** | `HistGradientBoostingRegressor` (300 iters, lr 0.06, depth 6) |
| **Features** | `lag_1..3`, `roll_mean_4`, `roll_std_4`, `doy_sin`, `doy_cos` |
| **Training data** | SST: 458 stations × 102 timesteps, 2024-07-27 → 2026-10-13 (NOAA Geo-polar Blended). Chlorophyll: 666 stations × 92 timesteps, 2024-10-07 → 2026-10-05 (NOAA DINEOF gap-filled VIIRS + OLCI). Every 8th calendar day from a fixed anchor |
| **Holdout** | Final 10 composites, all stations |
| **Endpoint** | `GET /api/analytics/forecast/ocean-conditions` |

| Variable | Model RMSE | Persistence RMSE | Skill | n_test |
|---|---|---|---|---|
| `sst` | 0.5262 °C | 0.5360 °C | **+1.8%** | 4,580 |
| `chlorophyll_a` | 2.9758 mg/m³ | 3.0832 mg/m³ | **+3.5%** | 6,607 |

**SST barely beats persistence.** This is a property of the problem: sea
surface temperature has large thermal inertia, so over 8 days "no change" is
very nearly the best available guess without atmospheric forcing and current
fields, which this dataset does not contain. Modelling the seasonal residual
instead of the level was tried and scored worse (RMSE 0.565). The endpoint
returns the skill figure with every forecast so callers see this.

**Chlorophyll's advantage shrank from +17.5% to +3.5%** when NOAA retired
the VIIRS-only gap-filled product in 2026 and the data was refreshed onto
its successor, which adds Sentinel-3A OLCI, a 2 km grid, and gives 666
stations with data rather than 177. Blooms are still where the model wins
(RMSE improves while MAE is slightly worse, 0.438 vs 0.421: better on the
large bloom errors, slightly worse on quiet weeks), but the earlier +17.5%
should not be quoted for the current data.

*Limitations.* One global model across stations, since ~100 points per
station cannot support per-station fitting. Forecasts are recursive, so
error compounds with horizon — capped at 10 steps. SST and chlorophyll sit
on different grids (5 km vs 2 km products), so a station ID with one
variable legitimately returns 404 for the other.

---

## 2. Catch prediction — `catch_hgb_fao_v1`, `catch_hgb_sau_v1`

One model per catch source (`?source=FAO|SAU`, FAO by default). The two
sources measure different things — FAO is officially reported landings, Sea
Around Us a reconstruction adding discards and unreported catch — so they
are never spliced into one series.

| | |
|---|---|
| **Task** | Catch tonnage per species per region, for the next calendar year (or `target_year`) |
| **Model** | `HistGradientBoostingRegressor` (400 iters, lr 0.05, depth 6) on `log1p(tonnes)` |
| **Features** | `lag_1..3`, `roll_mean_3`, `trend_3`, `year_index` (all log space) |
| **FAO training data** | FAO Global Capture Production (March 2026), 31 species × FAO Areas 51/57, 1950–2024; SAU series pooled into the *training* rows only, cut at the same year |
| **SAU training data** | Sea Around Us, 110 species × 2 EEZs, 1950–2019 |
| **Holdout** | Final 10 years of each source, scored on that source only (FAO 508 rows, SAU 995) |
| **Endpoint** | `GET /api/analytics/predict/catch` |

| Metric | FAO model | FAO persistence | SAU model | SAU persistence |
|---|---|---|---|---|
| RMSE (log-tonnes) | 1.292 | 1.352 | 0.906 | 0.923 |
| MAE (tonnes) | 5,645 | 4,569 | 3,182 | 2,459 |
| **Skill** | **+4.4%** | — | **+1.8%** | — |

FAO alone (31 species) scored −1.7%, worse than persistence; pooling the
SAU series into training lifted it to +4.4% on the same FAO-only holdout.
Leading zeros are dropped from every series: FAO records 0 t for years
before it reported a species separately (black pomfret appears only from
2019), which would otherwise read as a jump from nothing.

Marginally better on relative error, **worse on absolute tonnage**. That is
a direct consequence of the log target: it buys accuracy across the many
small stocks at the cost of the few large ones that dominate a tonnage-scale
MAE. Catch is driven by fishing effort, policy and markets that are absent
from this dataset, so a large gain over persistence was never available.

*Limitations.* Neither source reaches the present: FAO ends in 2024, SAU
in 2019. The endpoint forecasts the next calendar year (or `target_year`)
by rolling the one-step model forward recursively, each predicted year
feeding the next as its lag — so a 2027 forecast is three compounded steps
from FAO's last real year (eight from SAU's), and the 1-year holdout skill
above does not describe its error. The response
returns the full year-by-year path and `horizon_years` so this is visible.
This demonstrates method on real data; it is not an operational forecast.
Requires ≥6 consecutive annual observations. Species identity is not a
feature (a 110-level categorical over ~6,000 rows would mostly memorise
means); it enters only through each series' own lags.

---

## 3. Anomaly detection — `sst`, `chlorophyll_a`

| | |
|---|---|
| **Task** | Flag marine-heatwave-like and HAB-like excursions |
| **Method** | Per-station annual harmonic + linear trend; z-score of residuals scaled by MAD |
| **Threshold** | z ≥ 2.0, banded: 2.0 low · 2.5 medium · 3.0 high · 3.5 critical |
| **Output** | 4,055 rows in `anomaly_events` (1,257 SST, 2,798 chlorophyll), recomputed 2026-10-23 |
| **Endpoint** | `GET /api/analytics/anomalies` |

Not a learned model, and the strongest component of Phase 4.

**Why not the textbook definition.** Hobday et al. (2016) score against the
90th percentile of a 30-year daily climatology. Two years of 8-day
composites gives two samples per day-of-year — a percentile climatology
there would be noise wearing a lab coat. Fitting each station's own annual
harmonic (4 parameters, ~100 observations) and scoring the residuals answers
"unusual *for this place at this time of year*" using only what the data
supports. The seasonal fit explains a median 36% of variance (max 79%);
without removing it, every May would register as a heatwave.

**Why MAD, not standard deviation.** Standard deviation is inflated by the
very extremes being detected, so one large spike widens sigma and hides
itself. MAD is unaffected by a handful of outliers.

**Chlorophyll is log-transformed first** — it spans 0.0097 to 96.6 mg/m³, and
on the raw scale a detector mostly rediscovers which stations are coastal
rather than which weeks are unusual.

### Evidence these are real events, not noise

SST detections concentrate on **26 of 102 dates**, and on 2026-04-28 **152
stations flagged simultaneously** — a basin-wide warm event persisting
across consecutive composites (2026-04-20 → 2026-05-06). Statistical noise
would spread evenly across all dates and be spatially scattered.
Spatio-temporal coherence at that scale is the signature of a genuine
oceanographic event.

A second cluster appears in the newest data (175 stations on 2026-10-05,
231 on 2026-10-13). Treat it as **unconfirmed**: it sits at the very end of
the series, where a harmonic-plus-trend fit is least constrained, so it may
be partly an edge effect. Re-check after the next few refreshes extend the
series past it.

*Limitations.* Only positive excursions are recorded (`anomaly_events` has
no direction column, and heatwaves/blooms are the one-sided events of
interest). Two years cannot establish a climatological normal, so severity
bands are relative to each station's own recent behaviour, not to a
long-term baseline — a station in a persistently warming region will look
normal here.

---

## 4. Catch-decline detection

`GET /api/analytics/anomalies/catch-decline` — OLS slope of tonnage against
year over each species' last 10 years of record, expressed as % of mean
catch so small and large stocks are comparable. Runs on FAO reported
landings, so the window is 2015–2024. 23 species scored; the steepest
declines are Unicorn cod (−32.0%/yr), Hilsa shad (−21.6%/yr) and Longtail
tuna (−10.1%/yr).

Kept separate from `/anomalies` deliberately: this is a multi-year trend in
annual data, not a point excursion in a satellite series, and merging them
into one feed would imply a comparability that does not exist.

**A species-occurrence decline detector was deliberately not built.** The
occurrence data is two years of opportunistic OBIS/GBIF records where
year-on-year change tracks observer effort far more than ecology; a
"decline" there would be an artefact of who went looking.

---

## 5. Explainability — SHAP

`shap.TreeExplainer` over the fitted models; attributions stored in
`ml_predictions.shap_values` and served by
`GET /api/analytics/explain/{prediction_id}`.

Contributions are in the **model's target space** — log-tonnes for catch.
`base_value + Σ contributions` reconstructs the model output exactly
(verified). A consumer wanting tonnage must exponentiate the *total*, never
the individual terms: SHAP values are additive in log space and do not
survive being exponentiated one at a time. Phase 5's recommendation agent
reads these values rather than recomputing them, so the narration stays
tied to reproducible numbers.

---

## Reproducing

```bash
cd backend
python -m app.ml.registry          # trains all three, prints skill, writes artifacts
python -m app.ml.registry --check  # artifact status only
pytest tests/test_ml_features.py   # unit tests, no DB needed
pytest tests/test_analytics_live.py  # endpoint tests against the seeded DB
```

Artifacts land in `ml-models/artifacts/` (~2.3 MB). Endpoints load them at
request time; a missing artifact is trained on demand and cached in process,
so a fresh clone works — just slowly, once.
