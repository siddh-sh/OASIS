"""Unit tests for the ML feature layer — no database required.

These cover the two things that were actually wrong or dangerous during
development: the seasonal fit's time unit, and target leakage in the rolling
features. Both produced plausible-looking output while being incorrect,
which is exactly the failure mode worth pinning down in a test.
"""
import numpy as np
import pandas as pd

from app.ml.features import add_lag_features, diversity_indices, seasonal_baseline


def _annual_series(n=91, step_days=8, amplitude=2.0, mean=29.0):
    ts = pd.date_range("2024-07-27", periods=n, freq=f"{step_days}D", tz="UTC")
    doy = ts.dayofyear.to_numpy()
    values = mean + amplitude * np.sin(2 * np.pi * doy / 365.25)
    return pd.Series(ts), pd.Series(values)


def test_seasonal_baseline_recovers_a_known_annual_cycle():
    # Regression test for a real bug: timestamps arrive as datetime64[us]
    # from psycopg2, and an assumed nanosecond divisor made a two-year span
    # read as 0.002 years. sin(2*pi*t) then never completed a cycle and the
    # harmonic silently fit nothing.
    ts, values = _annual_series(amplitude=2.0)
    fitted = seasonal_baseline(ts, values)

    ss_res = float(((values.to_numpy() - fitted) ** 2).sum())
    ss_tot = float(((values.to_numpy() - values.mean()) ** 2).sum())
    r2 = 1 - ss_res / ss_tot
    assert r2 > 0.95, f"clean sinusoid should be almost perfectly recovered, got R2={r2:.3f}"


def test_seasonal_baseline_is_unit_agnostic_across_datetime_resolutions():
    ts, values = _annual_series()
    ns = pd.Series(pd.DatetimeIndex(ts).as_unit("ns"))
    us = pd.Series(pd.DatetimeIndex(ts).as_unit("us"))
    assert np.allclose(seasonal_baseline(ns, values), seasonal_baseline(us, values))


def test_seasonal_baseline_falls_back_to_mean_when_too_short():
    ts, values = _annual_series(n=4)
    assert np.allclose(seasonal_baseline(ts, values), values.mean())


def test_rolling_features_never_include_their_own_row():
    # Leakage here would let the forecaster see its own target and score
    # beautifully on a holdout while being useless in production.
    rng = np.random.default_rng(0)
    df = pd.DataFrame({
        "station_id": [1] * 20,
        "timestamp": pd.date_range("2025-01-01", periods=20, freq="8D", tz="UTC"),
        "value": rng.normal(29, 1, 20),
    })
    out = add_lag_features(df).dropna(subset=["lag_1", "roll_mean_4"])

    assert (out["lag_1"].to_numpy() == df["value"].to_numpy()[:-1][-len(out):]).all()
    # A 4-window mean that equalled the current value would mean the shift
    # was dropped somewhere.
    assert not np.isclose(out["roll_mean_4"], out["value"]).any()


def test_lag_features_do_not_bleed_between_stations():
    df = pd.DataFrame({
        "station_id": [1, 1, 1, 2, 2, 2],
        "timestamp": list(pd.date_range("2025-01-01", periods=3, freq="8D", tz="UTC")) * 2,
        "value": [10.0, 11.0, 12.0, 100.0, 101.0, 102.0],
    })
    out = add_lag_features(df).sort_values(["station_id", "timestamp"])
    first_of_station_2 = out[out["station_id"] == 2].iloc[0]
    assert pd.isna(first_of_station_2["lag_1"]), "station 2 must not inherit station 1's history"


def test_diversity_indices_on_known_cases():
    even = diversity_indices(pd.Series([10, 10, 10, 10]))
    assert even["richness"] == 4
    assert np.isclose(even["shannon"], np.log(4))

    single = diversity_indices(pd.Series([10]))
    assert single["richness"] == 1
    assert np.isclose(single["shannon"], 0.0)
    assert np.isclose(single["simpson"], 0.0)

    # Zero counts are absences, not species.
    assert diversity_indices(pd.Series([0, 0]))["richness"] == 0
