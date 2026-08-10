"""Short-horizon ocean-condition forecasting (flow.md Phase 4, agent 3).

Predicts SST and chlorophyll-a some number of 8-day composites ahead, from
lag features. One *global* model is trained across all stations rather than
one model per station: each station has only ~91 observations, which is far
too few to fit a gradient-boosted model, while pooling gives ~40,000 rows.
Station identity still reaches the model through its own lags and rolling
statistics, so a persistently warm cell forecasts warm.

**Every metric here is reported against a persistence baseline**
(`prediction = last observed value`). For a smoothly varying geophysical
field on an 8-day cadence, persistence is a genuinely strong baseline, and a
learned model that cannot beat it is not worth shipping. `train()` returns
both, and the model card in docs/ quotes both — a bare RMSE would look
impressive and mean nothing.

Measured on the real 458-station panel, that comparison says something
uncomfortable and worth stating plainly rather than hiding:

    sst            model RMSE 0.548  vs persistence 0.548   skill  -0.0%
    chlorophyll_a  model RMSE 2.576  vs persistence 3.122   skill +17.5%

**The SST model does not beat persistence.** That is a property of the
problem, not a bug: sea-surface temperature has enormous thermal inertia, so
at an 8-day lead "tomorrow looks like today" is very nearly optimal unless
you bring in atmospheric forcing and currents, which this dataset does not
contain. Modelling the seasonal *residual* instead of the level was tried
and came out slightly worse (RMSE 0.565). The learned model earns its place
on chlorophyll, where blooms are episodic and persistence degrades.

The endpoint therefore returns these skill numbers alongside every forecast,
so a caller — human or Phase-5 agent — can see how much to trust it.

The split is temporal, never random: the last `holdout_steps` composites are
held out for every station. A random split would let the model train on
timesteps that come *after* what it is asked to predict, which inflates
scores substantially on autocorrelated series.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sqlalchemy.orm import Session

from app.ml.features import (
    FORECAST_FEATURES,
    STEP_DAYS,
    add_lag_features,
    load_ocean_series,
)

DEFAULT_HOLDOUT_STEPS = 10


@dataclass
class ForecastModel:
    variable: str
    model: HistGradientBoostingRegressor
    metrics: dict[str, float] = field(default_factory=dict)
    n_train: int = 0
    n_test: int = 0


def _prepare(df: pd.DataFrame) -> pd.DataFrame:
    feats = add_lag_features(df)
    return feats.dropna(subset=[*FORECAST_FEATURES, "value"])


def train(db: Session, variable: str, holdout_steps: int = DEFAULT_HOLDOUT_STEPS) -> ForecastModel:
    """Fit on everything up to the last `holdout_steps` composites; score on those."""
    raw = load_ocean_series(db, variable)
    if raw.empty:
        raise ValueError(f"no data for {variable!r}")

    data = _prepare(raw)
    cutoff = data["timestamp"].sort_values().unique()[-holdout_steps]
    train_df = data[data["timestamp"] < cutoff]
    test_df = data[data["timestamp"] >= cutoff]
    if train_df.empty or test_df.empty:
        raise ValueError(f"not enough history to hold out {holdout_steps} steps for {variable!r}")

    model = HistGradientBoostingRegressor(
        max_iter=300, learning_rate=0.06, max_depth=6, random_state=0
    )
    model.fit(train_df[FORECAST_FEATURES], train_df["value"])

    pred = model.predict(test_df[FORECAST_FEATURES])
    truth = test_df["value"].to_numpy()
    # Persistence: the previous observed value is lag_1 by construction.
    baseline = test_df["lag_1"].to_numpy()

    metrics = {
        "rmse": float(np.sqrt(mean_squared_error(truth, pred))),
        "mae": float(mean_absolute_error(truth, pred)),
        "baseline_rmse": float(np.sqrt(mean_squared_error(truth, baseline))),
        "baseline_mae": float(mean_absolute_error(truth, baseline)),
    }
    metrics["skill_vs_persistence"] = float(1.0 - metrics["rmse"] / metrics["baseline_rmse"])

    return ForecastModel(
        variable=variable, model=model, metrics=metrics,
        n_train=len(train_df), n_test=len(test_df),
    )


def forecast_station(
    db: Session, fitted: ForecastModel, station_id: int, horizon: int = 3
) -> list[dict]:
    """Roll the model forward `horizon` composites for one station.

    Recursive: each predicted value is fed back in as the next step's lag_1.
    Uncertainty therefore compounds with horizon, which is why the API caps
    it rather than letting callers ask for a year ahead.
    """
    raw = load_ocean_series(db, fitted.variable, station_id=station_id)
    if raw.empty:
        return []

    hist = raw.sort_values("timestamp").copy()
    out: list[dict] = []

    for step in range(1, horizon + 1):
        feats = add_lag_features(hist)
        row = feats.iloc[[-1]][FORECAST_FEATURES]
        if row.isna().to_numpy().any():
            break  # too little history to build a full feature row
        value = float(fitted.model.predict(row)[0])
        ts = hist["timestamp"].iloc[-1] + pd.Timedelta(days=STEP_DAYS)
        out.append({
            "timestamp": ts.to_pydatetime(),
            "predicted_value": value,
            "step": step,
        })
        hist = pd.concat(
            [hist, pd.DataFrame([{"station_id": station_id, "timestamp": ts, "value": value}])],
            ignore_index=True,
        )

    return out
