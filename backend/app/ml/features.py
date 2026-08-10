"""Feature engineering — the Feature Engineering & Analytics Agent's toolset.

Pulls series out of the unified schema and derives the features the
prediction, forecasting and anomaly layers all share. Written as plain
functions over pandas so they can be unit-tested and called directly;
Phase 5 exposes them as agent tools.

Shape of the real data these are designed against (verified, not assumed):

  * `oceanographic_readings` SST — 458 satellite grid stations x exactly 91
    timesteps, 2024-07-27 to 2026-07-22, 8-day composites (one 13-day gap).
    A balanced panel, which is why per-station modelling is viable at all.
  * `oceanographic_readings` chlorophyll-a — 177 stations x 87 timesteps.
  * `fisheries_catch` — 110 species with a resolved species_id, median 63
    annual observations each.

**Two years is the binding constraint on anything seasonal.** A real marine
heatwave definition (Hobday et al.) uses a 30-year daily climatology; with
two annual cycles there are only two samples per day-of-year, so a
per-day-of-year climatology would be almost pure noise. `seasonal_baseline`
below therefore fits a single annual harmonic plus linear trend to each
station's own series — 4 parameters against 91 observations, which is
well-posed — and anomalies are scored on the residuals. That separates
"it is August" from "it is unusually warm for August" honestly, while not
pretending to a climatological baseline the data cannot support.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import FisheriesCatch, OceanographicReading

# Satellite composites are 8-day; one step ahead is ~8 days.
STEP_DAYS = 8

# Column on oceanographic_readings for each variable we model.
OCEAN_VARIABLES = {
    "sst": OceanographicReading.sst,
    "chlorophyll_a": OceanographicReading.chlorophyll_a,
}


def load_ocean_series(db: Session, variable: str, station_id: int | None = None) -> pd.DataFrame:
    """Long-format (station_id, timestamp, value) for one ocean variable.

    Rows where the variable is null are excluded — for satellite grids those
    are land pixels, not missing measurements.
    """
    if variable not in OCEAN_VARIABLES:
        raise ValueError(f"unknown ocean variable {variable!r}; expected one of {sorted(OCEAN_VARIABLES)}")
    col = OCEAN_VARIABLES[variable]

    stmt = select(
        OceanographicReading.station_id,
        OceanographicReading.timestamp,
        col.label("value"),
    ).where(col.is_not(None))
    if station_id is not None:
        stmt = stmt.where(OceanographicReading.station_id == station_id)
    stmt = stmt.order_by(OceanographicReading.station_id, OceanographicReading.timestamp)

    df = pd.DataFrame(db.execute(stmt).all(), columns=["station_id", "timestamp", "value"])
    if df.empty:
        return df
    df["value"] = df["value"].astype(float)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    return df


def load_catch_series(db: Session, species_id: int | None = None) -> pd.DataFrame:
    """Long-format (species_id, region_id, year, catch_tonnes) from Sea Around Us.

    Only species-resolved rows: SAU's family/order aggregates and its
    unattributed "Others" bucket carry real tonnage but have no species_id,
    so they cannot be modelled per species (see schema.sql).
    """
    stmt = select(
        FisheriesCatch.species_id,
        FisheriesCatch.region_id,
        FisheriesCatch.catch_date,
        FisheriesCatch.catch_weight_kg,
    ).where(FisheriesCatch.species_id.is_not(None))
    if species_id is not None:
        stmt = stmt.where(FisheriesCatch.species_id == species_id)
    stmt = stmt.order_by(FisheriesCatch.species_id, FisheriesCatch.region_id, FisheriesCatch.catch_date)

    df = pd.DataFrame(
        db.execute(stmt).all(),
        columns=["species_id", "region_id", "catch_date", "catch_weight_kg"],
    )
    if df.empty:
        return df
    df["year"] = pd.to_datetime(df["catch_date"]).dt.year
    df["catch_tonnes"] = df["catch_weight_kg"].astype(float) / 1000.0
    return df[["species_id", "region_id", "year", "catch_tonnes"]]


def seasonal_baseline(timestamps: pd.Series, values: pd.Series) -> np.ndarray:
    """Expected value from an annual harmonic + linear trend, by least squares.

    Design matrix: [1, t, sin(2*pi*t), cos(2*pi*t)] with t in years. One
    harmonic only — with two years of data a second harmonic starts fitting
    noise rather than seasonality.

    Falls back to the series mean when there are too few points to fit
    (< 8 observations), so callers never have to special-case short series.
    """
    n = len(values)
    v = np.asarray(values, dtype=float)
    if n < 8:
        return np.full(n, v.mean() if n else np.nan)

    # Elapsed years since the first sample. Deliberately via total_seconds()
    # rather than casting to int64: psycopg2 hands back Python datetimes and
    # pandas resolves those to datetime64[us], not [ns], so an assumed
    # nanosecond divisor silently comes out 1000x too small. That collapses a
    # two-year span to 0.002, sin(2*pi*t) never completes a cycle, and the
    # harmonic degenerates into a second trend term that fits nothing.
    ts = pd.DatetimeIndex(pd.to_datetime(timestamps, utc=True))
    t = (ts - ts[0]).total_seconds().to_numpy() / (365.25 * 24 * 3600)
    design = np.column_stack([np.ones(n), t, np.sin(2 * np.pi * t), np.cos(2 * np.pi * t)])
    coef, *_ = np.linalg.lstsq(design, v, rcond=None)
    return design @ coef


def add_lag_features(df: pd.DataFrame, value_col: str = "value", lags: tuple[int, ...] = (1, 2, 3)) -> pd.DataFrame:
    """Lags plus a rolling mean/std, computed per station.

    Rolling stats are shifted by one step so a row never sees its own value —
    without that the forecaster leaks its target and scores beautifully on
    paper while being useless.
    """
    out = df.sort_values(["station_id", "timestamp"]).copy()
    g = out.groupby("station_id")[value_col]
    for lag in lags:
        out[f"lag_{lag}"] = g.shift(lag)
    shifted = g.shift(1).groupby(out["station_id"]).rolling(4, min_periods=2)
    out["roll_mean_4"] = shifted.mean().reset_index(level=0, drop=True)
    out["roll_std_4"] = shifted.std().reset_index(level=0, drop=True)
    out["doy_sin"] = np.sin(2 * np.pi * out["timestamp"].dt.dayofyear / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * out["timestamp"].dt.dayofyear / 365.25)
    return out


FORECAST_FEATURES = ["lag_1", "lag_2", "lag_3", "roll_mean_4", "roll_std_4", "doy_sin", "doy_cos"]


def diversity_indices(counts: pd.Series) -> dict[str, float]:
    """Shannon and Simpson diversity for a series of per-species counts."""
    n = np.asarray(counts, dtype=float)
    n = n[n > 0]
    if n.size == 0:
        return {"richness": 0, "shannon": 0.0, "simpson": 0.0}
    p = n / n.sum()
    return {
        "richness": int(n.size),
        "shannon": float(-(p * np.log(p)).sum()),
        "simpson": float(1.0 - (p**2).sum()),
    }
