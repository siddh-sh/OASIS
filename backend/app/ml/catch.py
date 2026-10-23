"""Fish-stock / catch prediction (flow.md Phase 4, agent 3).

Predicts catch per species per region from one of two sources, each with
its own model (see app.ml.features.CATCH_SOURCES): FAO reported landings,
31 species per FAO fishing area, 1950-2024 (the default); or
the Sea Around Us reconstruction, 110 taxa per EEZ, 1950-2019.

Design decisions that the real data forced:

* **One pooled model, not one per species.** Seventy points per species is
  too few for a gradient-boosted model; pooling gives ~6,000 rows. Species
  identity enters through its own lags, not as a categorical — a 110-level
  one-hot over 6,000 rows would spend most of the model's capacity
  memorising species means.

* **Modelled in log space.** Catch spans five orders of magnitude in this
  data (Indian oil sardine at ~308,000 t against species landing single-digit
  tonnes). On the raw scale the loss is dominated entirely by the handful of
  large stocks and small ones are effectively ignored; `log1p` makes the
  target proportional so a 20% error matters equally everywhere. Predictions
  are returned on the natural tonnage scale via `expm1`.

* **Metrics are reported against a persistence baseline** (next year = this
  year), on a temporal holdout of the final years. Annual catch is highly
  autocorrelated, so persistence is hard to beat and a model that doesn't
  clear it isn't worth shipping. Both numbers go in the model card.

Measured on the real data (holdout: final 10 years of each source):

    SAU  model        RMSE(log) 0.906   MAE 3,182 t   (995 test rows)
         persistence  RMSE(log) 0.923   MAE 2,459 t
         skill vs persistence  +1.8%
    FAO  model        RMSE(log) 1.292   MAE 5,645 t   (508 test rows)
         persistence  RMSE(log) 1.352   MAE 4,569 t
         skill vs persistence  +4.4%

FAO's series are noisier than SAU's (reported landings jump when national
reporting changes; SAU smooths that away by reconstruction), which is why
both its errors and its baseline's are higher. The FAO model is trained
with SAU's series pooled in (`pool_with`, training rows only): FAO alone
has 31 species and scored -1.7% — worse than persistence — and pooling
lifted that to +4.4% on the same FAO-only holdout.

Read that honestly: the model is **marginally** better than persistence on
relative error, and **worse** on absolute tonnage. That second number is a
direct consequence of optimising a log target — it buys accuracy on the many
small stocks at the cost of the few large ones that dominate a tonnage-scale
MAE. Annual catch is strongly autocorrelated and driven by effort and policy
that this dataset does not contain, so a large gain over persistence was
never realistically available. The endpoint returns both figures so nobody
has to take the prediction on faith.

The other known weakness, stated rather than buried: neither series reaches
the present (FAO ends in 2024, SAU in 2019). Forecasts for the coming year
are produced by rolling the one-step model forward recursively, feeding
each predicted year back in as the next year's lag — so a 2027 forecast is
three compounded steps from FAO's last real year (eight from SAU's), and
its error is larger than the one-step holdout skill above suggests.
The model is a demonstration of method on real data rather than an
operational predictor.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sqlalchemy.orm import Session

from app.ml.features import DEFAULT_CATCH_SOURCE, load_catch_series

CATCH_FEATURES = ["lag_1", "lag_2", "lag_3", "roll_mean_3", "trend_3", "year_index"]
DEFAULT_HOLDOUT_YEARS = 10
MIN_HISTORY = 6


@dataclass
class CatchModel:
    model: HistGradientBoostingRegressor
    metrics: dict[str, float] = field(default_factory=dict)
    n_train: int = 0
    n_test: int = 0


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Lag features per (species, region) series, in log space."""
    if df.empty:
        return df
    out = df.sort_values(["species_id", "region_id", "year"]).copy()
    out["log_catch"] = np.log1p(out["catch_tonnes"].clip(lower=0))

    g = out.groupby(["species_id", "region_id"])["log_catch"]
    for lag in (1, 2, 3):
        out[f"lag_{lag}"] = g.shift(lag)
    # Shifted before rolling so a row never sees its own value.
    shifted = g.shift(1)
    out["roll_mean_3"] = (
        shifted.groupby([out["species_id"], out["region_id"]])
        .rolling(3, min_periods=2).mean().reset_index(level=[0, 1], drop=True)
    )
    out["trend_3"] = out["lag_1"] - out["lag_3"]
    out["year_index"] = out["year"] - out["year"].min()
    return out


def train(
    db: Session,
    holdout_years: int = DEFAULT_HOLDOUT_YEARS,
    source: str = DEFAULT_CATCH_SOURCE,
    pool_with: str | None = None,
) -> CatchModel:
    """Fit on `source`, evaluated on a holdout of `source` alone.

    `pool_with` adds another source's series to the *training* rows only.
    Every feature is a series' own lags, so the sources' different levels
    never meet inside a row; pooling just gives the model more examples of
    how a catch series moves year to year. The pooled rows are cut at the
    same year as the training rows, so no information from the holdout
    years leaks in through a shared shock (2019's sardine crash is in both).
    """
    raw = load_catch_series(db, source=source)
    if raw.empty:
        raise ValueError(f"fisheries_catch has no species-resolved {source} rows to train on")

    data = build_features(raw).dropna(subset=[*CATCH_FEATURES, "log_catch"])
    if data.empty:
        raise ValueError("no rows survived lag-feature construction")

    cutoff = int(data["year"].max()) - holdout_years
    train_df = data[data["year"] <= cutoff]
    test_df = data[data["year"] > cutoff]
    if train_df.empty or test_df.empty:
        raise ValueError("not enough years of history for the requested holdout")

    if pool_with:
        extra = load_catch_series(db, source=pool_with)
        # Offset ids so a species present in both sources stays two series
        # rather than being interleaved into one by build_features.
        extra["species_id"] = extra["species_id"] + 10_000_000
        extra = build_features(extra).dropna(subset=[*CATCH_FEATURES, "log_catch"])
        train_df = pd.concat([train_df, extra[extra["year"] <= cutoff]], ignore_index=True)

    model = HistGradientBoostingRegressor(
        max_iter=400, learning_rate=0.05, max_depth=6, random_state=0
    )
    model.fit(train_df[CATCH_FEATURES], train_df["log_catch"])

    pred_log = model.predict(test_df[CATCH_FEATURES])
    truth_log = test_df["log_catch"].to_numpy()
    baseline_log = test_df["lag_1"].to_numpy()  # persistence

    # Reported on the tonnage scale, which is what a reader can interpret.
    truth_t = np.expm1(truth_log)
    pred_t = np.expm1(pred_log)
    base_t = np.expm1(baseline_log)

    metrics = {
        "rmse_log": float(np.sqrt(mean_squared_error(truth_log, pred_log))),
        "baseline_rmse_log": float(np.sqrt(mean_squared_error(truth_log, baseline_log))),
        "mae_tonnes": float(mean_absolute_error(truth_t, pred_t)),
        "baseline_mae_tonnes": float(mean_absolute_error(truth_t, base_t)),
    }
    metrics["skill_vs_persistence"] = float(
        1.0 - metrics["rmse_log"] / metrics["baseline_rmse_log"]
    )

    return CatchModel(model=model, metrics=metrics, n_train=len(train_df), n_test=len(test_df))


def default_target_year() -> int:
    """Next calendar year: the forecast a user means by "next year"."""
    return date.today().year + 1


def predict_next_year(
    db: Session,
    fitted: CatchModel,
    species_id: int,
    region_id: int | None = None,
    target_year: int | None = None,
    source: str = DEFAULT_CATCH_SOURCE,
) -> list[dict]:
    """Catch for a species in `target_year` (default: next calendar year),
    per EEZ region it is recorded in.

    The model only knows how to step one year past what it has seen, and
    the record ends before the present (2024 for FAO, 2019 for SAU), so
    reaching a future year means rolling forward recursively: each predicted year becomes the next step's lag_1. Errors
    compound with every step, which is why the whole path and the horizon
    are returned rather than just the final number.
    """
    raw = load_catch_series(db, species_id=species_id, source=source)
    if raw.empty:
        return []
    if region_id is not None:
        raw = raw[raw["region_id"] == region_id]
        if raw.empty:
            return []

    feats = build_features(raw)
    results: list[dict] = []

    for (sid, rid), g in feats.groupby(["species_id", "region_id"]):
        g = g.sort_values("year")
        if len(g) < MIN_HISTORY:
            continue
        last = g.iloc[-1]
        last_year = int(last["year"])
        steps = max(1, (target_year or default_target_year()) - last_year)

        # Most recent first: history[0] is lag_1 for the step being predicted.
        history = list(g["log_catch"].iloc[::-1][:3])
        year_index = float(last["year_index"])
        path: list[dict] = []
        row = None
        for step in range(1, steps + 1):
            # Advance one year: this year's values become next year's lags.
            row = pd.DataFrame([{
                "lag_1": history[0],
                "lag_2": history[1],
                "lag_3": history[2],
                "roll_mean_3": float(np.mean(history[:3])),
                "trend_3": history[0] - history[2],
                "year_index": year_index + step,
            }])
            if row.isna().to_numpy().any():
                break
            pred_log = float(fitted.model.predict(row[CATCH_FEATURES])[0])
            path.append({"year": last_year + step, "predicted_tonnes": float(np.expm1(pred_log))})
            history.insert(0, pred_log)
        if len(path) < steps:
            continue

        results.append({
            "species_id": int(sid),
            "region_id": int(rid),
            "year": path[-1]["year"],
            "predicted_tonnes": path[-1]["predicted_tonnes"],
            "last_observed_year": last_year,
            "last_observed_tonnes": float(last["catch_tonnes"]),
            "horizon_years": steps,
            "path": path,
            # Inputs to the final step — what SHAP attributes the target year to.
            "features": row.iloc[0].to_dict(),
        })
    return results
