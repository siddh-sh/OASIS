# Model Cards — Phase 4

Every number here was measured on the real seeded database, on a temporal
holdout, and is reproducible with `python -m app.ml.registry` from
`backend/`. Where a model fails to beat its baseline, that is stated rather
than omitted.

**The honest headline:** of the three predictive models, one earns its keep
(chlorophyll forecasting, +17.5%), one is marginal (catch, +1.5%), and one
does not beat the trivial baseline at all (SST forecasting, −0.0%). The
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
| **Training data** | 458 stations × 91 timesteps (SST); 177 × 87 (chlorophyll), 2024-07-27 → 2026-07-22 |
| **Holdout** | Final 10 composites, all stations |
| **Endpoint** | `GET /api/analytics/forecast/ocean-conditions` |

| Variable | Model RMSE | Persistence RMSE | Skill | n_test |
|---|---|---|---|---|
| `sst` | 0.5484 °C | 0.5481 °C | **−0.0%** | 4,580 |
| `chlorophyll_a` | 2.5755 mg/m³ | 3.1219 mg/m³ | **+17.5%** | 1,685 |

**SST does not beat persistence.** This is a property of the problem: sea
surface temperature has large thermal inertia, so over 8 days "no change" is
very nearly the best available guess without atmospheric forcing and current
fields, which this dataset does not contain. Modelling the seasonal residual
instead of the level was tried and scored worse (RMSE 0.565). The endpoint
returns the skill figure with every forecast so callers see this.

**Chlorophyll genuinely benefits** (+17.5% RMSE) because blooms are episodic
and persistence degrades sharply across them. Note MAE moves the other way
(0.530 vs 0.467): the model wins on the large bloom errors that dominate
RMSE while being slightly worse on typical quiet weeks.

*Limitations.* One global model across stations, since 91 points per station
cannot support per-station fitting. Forecasts are recursive, so error
compounds with horizon — capped at 10 steps. Chlorophyll covers only 177 of
458 stations, so many station IDs legitimately return 404.

---

## 2. Catch prediction — `catch_hgb_v1`

| | |
|---|---|
| **Task** | Next-year catch tonnage per species per EEZ |
| **Model** | `HistGradientBoostingRegressor` (400 iters, lr 0.05, depth 6) on `log1p(tonnes)` |
| **Features** | `lag_1..3`, `roll_mean_3`, `trend_3`, `year_index` (all log space) |
| **Training data** | Sea Around Us, 110 species-resolved taxa × up to 70 years (1950–2019) |
| **Holdout** | Final 10 years (995 rows) |
| **Endpoint** | `GET /api/analytics/predict/catch` |

| Metric | Model | Persistence |
|---|---|---|
| RMSE (log-tonnes) | 0.909 | 0.923 |
| MAE (tonnes) | 3,201 | 2,459 |
| **Skill** | **+1.5%** | — |

Marginally better on relative error, **worse on absolute tonnage**. That is
a direct consequence of the log target: it buys accuracy across the many
small stocks at the cost of the few large ones that dominate a tonnage-scale
MAE. Catch is driven by fishing effort, policy and markets that are absent
from this dataset, so a large gain over persistence was never available.

*Limitations.* SAU's reconstruction ends in 2019. The endpoint forecasts
the next calendar year (or `target_year`) by rolling the one-step model
forward recursively from 2019, each predicted year feeding the next as its
lag — so a 2027 forecast is eight compounded steps from real data, and the
1-year holdout skill above does not describe its error. The response
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
| **Output** | 1,375 rows in `anomaly_events` (738 SST, 637 chlorophyll) |
| **Endpoint** | `GET /api/analytics/anomalies` |

Not a learned model, and the strongest component of Phase 4.

**Why not the textbook definition.** Hobday et al. (2016) score against the
90th percentile of a 30-year daily climatology. Two years of 8-day
composites gives two samples per day-of-year — a percentile climatology
there would be noise wearing a lab coat. Fitting each station's own annual
harmonic (4 parameters, 91 observations) and scoring the residuals answers
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

Detections concentrate on **27 of 91 dates**, and on 2026-04-25 **138
stations flagged simultaneously**, spanning 6.0–13.5°N and 68.0–89.8°E — a
basin-wide warm event persisting across five consecutive composites
(2026-04-09 → 2026-05-11). Statistical noise would spread evenly across all
91 dates and be spatially scattered. Spatio-temporal coherence at that scale
is the signature of a genuine oceanographic event.

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
catch so small and large stocks are comparable. 78 species scored; the
steepest declines are Shortbill spearfish (−37.5%/yr), Granular ark
(−33.4%/yr) and Giant tiger prawn (−31.6%/yr).

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
