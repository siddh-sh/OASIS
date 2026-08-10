"""Fish-stock / catch prediction (flow.md Phase 4, agent 3).

Predicts next-year catch per species per EEZ from the Sea Around Us
reconstruction: 110 species-resolved taxa, up to 70 annual observations
each (1950-2019).

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

Measured on the real data (holdout: final 10 years, 995 test rows):

    model        RMSE(log) 0.909   MAE 3,201 t
    persistence  RMSE(log) 0.923   MAE 2,459 t
    skill vs persistence  +1.5%

Read that honestly: the model is **marginally** better than persistence on
relative error, and **worse** on absolute tonnage. That second number is a
direct consequence of optimising a log target — it buys accuracy on the many
small stocks at the cost of the few large ones that dominate a tonnage-scale
MAE. Annual catch is strongly autocorrelated and driven by effort and policy
that this dataset does not contain, so a large gain over persistence was
never realistically available. The endpoint returns both figures so nobody
has to take the prediction on faith.

The other known weakness, stated rather than buried: the series ends in 2019
because that is where SAU's reconstruction ends, so "next year" means 2020,
not a live forecast. This is a historical dataset, and the model is a
demonstration of method on real data rather than an operational predictor.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sqlalchemy.orm import Session

from app.ml.features import load_catch_series

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


def train(db: Session, holdout_years: int = DEFAULT_HOLDOUT_YEARS) -> CatchModel:
    raw = load_catch_series(db)
    if raw.empty:
        raise ValueError("fisheries_catch has no species-resolved rows to train on")

    data = build_features(raw).dropna(subset=[*CATCH_FEATURES, "log_catch"])
    if data.empty:
        raise ValueError("no rows survived lag-feature construction")

    cutoff = int(data["year"].max()) - holdout_years
    train_df = data[data["year"] <= cutoff]
    test_df = data[data["year"] > cutoff]
    if train_df.empty or test_df.empty:
        raise ValueError("not enough years of history for the requested holdout")

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


def predict_next_year(
    db: Session, fitted: CatchModel, species_id: int, region_id: int | None = None
) -> list[dict]:
    """One-year-ahead catch for a species, per EEZ region it is recorded in."""
    raw = load_catch_series(db, species_id=species_id)
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
        last = g.iloc[[-1]]
        # Advance one year: this year's values become next year's lags.
        row = pd.DataFrame([{
            "lag_1": float(last["log_catch"].iloc[0]),
            "lag_2": float(last["lag_1"].iloc[0]),
            "lag_3": float(last["lag_2"].iloc[0]),
            "roll_mean_3": float(g["log_catch"].tail(3).mean()),
            "trend_3": float(last["log_catch"].iloc[0] - last["lag_2"].iloc[0]),
            "year_index": float(last["year_index"].iloc[0] + 1),
        }])
        if row.isna().to_numpy().any():
            continue
        pred_log = float(fitted.model.predict(row[CATCH_FEATURES])[0])
        results.append({
            "species_id": int(sid),
            "region_id": int(rid),
            "year": int(last["year"].iloc[0]) + 1,
            "predicted_tonnes": float(np.expm1(pred_log)),
            "last_observed_tonnes": float(last["catch_tonnes"].iloc[0]),
            "features": row.iloc[0].to_dict(),
        })
    return results
