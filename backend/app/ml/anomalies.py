"""Environmental Risk & Anomaly Detection (flow.md Phase 4, agent 4).

Detects, per station and variable:
  * `sst`           — marine-heatwave-like warm anomalies
  * `chlorophyll_a` — HAB-like bloom spikes
and, per species, declining fisheries catch trends.

Method, and why it is this rather than the textbook one
-------------------------------------------------------
The canonical marine-heatwave definition (Hobday et al. 2016) scores a day
against the 90th percentile of a 30-year daily climatology. We have two
years of 8-day composites, which gives two samples per day-of-year — far
too few for a percentile climatology. Pretending otherwise would produce
confident-looking thresholds built on n=2.

So instead: fit each station's own annual harmonic + trend
(`features.seasonal_baseline`), then score the residuals. That answers
"unusually warm *for this place at this time of year*" using only what the
data can actually support. Across the real 458-station SST panel the
seasonal fit explains a median 36% of variance (max 79%), so removing it
matters — without it, every May would look like a heatwave.

Residuals are scaled by **MAD**, not standard deviation. Standard deviation
is inflated by the very extremes being detected, so a station with one large
spike gets a wide sigma and hides it. MAD is unaffected by a handful of
outliers, which is the whole point here.

Chlorophyll is log-transformed first. Its real distribution is strongly
right-skewed (0.0097 to 96.6 mg/m^3 in the loaded data); on the raw scale a
detector mostly rediscovers which stations are coastal rather than which
weeks are unusual.

Only *positive* excursions are recorded, since the domain events of interest
(heatwave, bloom) are one-sided, and `anomaly_events` has no column to carry
a direction.

Deliberately NOT implemented: a species-occurrence decline detector. The
occurrence data is two years of opportunistic OBIS/GBIF records, where
year-on-year change reflects observer effort far more than ecology — a
"decline" there would be an artefact. Catch trends are used for the decline
signal instead: 70 years per species, actually measuring abundance.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd
from psycopg2.extras import execute_values
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import OceanographicStation
from app.ml.features import load_catch_series, load_ocean_series, seasonal_baseline

# z-score cut points. 2.0 is deliberately not the lowest band: with ~91
# observations per station, |z| > 2 happens by chance a few times per series,
# so anything below this is noise rather than an event.
SEVERITY_BANDS = ((3.5, "critical"), (3.0, "high"), (2.5, "medium"), (2.0, "low"))
MIN_Z = 2.0

# Variables that get a log transform before baselining (right-skewed).
LOG_VARIABLES = {"chlorophyll_a"}

DOMAIN_FOR_VARIABLE = {"sst": "ocean", "chlorophyll_a": "ocean"}


@dataclass
class Detection:
    station_id: int
    variable: str
    detected_at: datetime
    z: float
    value: float
    threshold_value: float
    severity: str


def _severity(z: float) -> str | None:
    for cut, label in SEVERITY_BANDS:
        if z >= cut:
            return label
    return None


def _robust_scale(residuals: np.ndarray) -> float:
    """MAD scaled to be comparable with a standard deviation under normality."""
    mad = np.median(np.abs(residuals - np.median(residuals)))
    return float(1.4826 * mad)


def detect_ocean_anomalies(db: Session, variable: str, min_obs: int = 20) -> list[Detection]:
    """Score every station's series for one ocean variable."""
    df = load_ocean_series(db, variable)
    if df.empty:
        return []

    use_log = variable in LOG_VARIABLES
    out: list[Detection] = []

    for station_id, g in df.groupby("station_id"):
        g = g.sort_values("timestamp")
        if len(g) < min_obs:
            continue  # too short to separate season from anomaly

        raw = g["value"].to_numpy(dtype=float)
        # Guard the log: chlorophyll is a concentration and should be > 0,
        # but a zero would otherwise produce -inf and poison the whole fit.
        series = np.log(np.clip(raw, 1e-6, None)) if use_log else raw

        baseline = seasonal_baseline(g["timestamp"], pd.Series(series))
        resid = series - baseline
        scale = _robust_scale(resid)
        if not np.isfinite(scale) or scale <= 0:
            continue  # a flat series has no anomalies to find

        z_all = resid / scale
        for ts, z, value, base in zip(g["timestamp"], z_all, raw, baseline, strict=True):
            if z < MIN_Z:
                continue
            severity = _severity(float(z))
            if severity is None:
                continue
            # The value this variable would have had at exactly MIN_Z —
            # i.e. the bar this observation cleared, on the original scale.
            thr = base + MIN_Z * scale
            out.append(Detection(
                station_id=int(station_id),
                variable=variable,
                detected_at=ts.to_pydatetime(),
                z=float(z),
                value=float(value),
                threshold_value=float(np.exp(thr) if use_log else thr),
                severity=severity,
            ))
    return out


def persist_ocean_anomalies(db: Session, detections: list[Detection]) -> int:
    """Upsert detections into anomaly_events.

    Idempotent on (variable, station_id, detected_at) — the natural key added
    in migration 0003 — so re-running the detector after a data refresh
    updates existing events rather than duplicating them.
    """
    if not detections:
        return 0

    region_by_station = dict(
        db.execute(
            select(OceanographicStation.station_id, OceanographicStation.region_id)
        ).all()
    )

    rows = [
        (
            DOMAIN_FOR_VARIABLE.get(d.variable, "ocean"),
            region_by_station.get(d.station_id),
            d.station_id,
            d.variable,
            d.detected_at,
            d.severity,
            d.value,
            d.threshold_value,
        )
        for d in detections
    ]

    # execute_values, not SQLAlchemy's executemany: this database is a
    # Supabase pooler in ap-northeast-2, so a per-row round trip costs real
    # latency — inserting ~1,400 detections one statement at a time took
    # minutes. Batching them into a handful of multi-row INSERTs makes the
    # same write take seconds.
    raw = db.connection().connection
    with raw.cursor() as cur:
        execute_values(
            cur,
            "insert into anomaly_events (domain, region_id, station_id, variable, "
            "detected_at, severity, metric_value, threshold_value) values %s "
            "on conflict (variable, station_id, detected_at) where station_id is not null "
            "do update set severity = excluded.severity, "
            "metric_value = excluded.metric_value, "
            "threshold_value = excluded.threshold_value",
            rows,
            page_size=1000,
        )
    db.commit()
    return len(rows)


def detect_catch_decline(db: Session, min_years: int = 20, recent_years: int = 10) -> pd.DataFrame:
    """Species whose catch is trending down over the most recent window.

    Ordinary least squares on tonnes vs year, per species, over the last
    `recent_years` of available data. Returns the slope as a percentage of
    that species' mean catch, so a small stock and a large one are
    comparable.
    """
    df = load_catch_series(db)
    if df.empty:
        return pd.DataFrame(columns=["species_id", "slope_tonnes_per_year", "pct_per_year", "n_years"])

    totals = df.groupby(["species_id", "year"], as_index=False)["catch_tonnes"].sum()

    rows = []
    for species_id, g in totals.groupby("species_id"):
        g = g.sort_values("year")
        if len(g) < min_years:
            continue
        recent = g.tail(recent_years)
        if len(recent) < 5:
            continue
        slope, _ = np.polyfit(recent["year"].to_numpy(float), recent["catch_tonnes"].to_numpy(float), 1)
        mean_catch = recent["catch_tonnes"].mean()
        if mean_catch <= 0:
            continue
        rows.append({
            "species_id": int(species_id),
            "slope_tonnes_per_year": float(slope),
            "pct_per_year": float(100.0 * slope / mean_catch),
            "n_years": int(len(recent)),
        })

    out = pd.DataFrame(rows)
    return out.sort_values("pct_per_year") if not out.empty else out


def run_all(db: Session) -> dict[str, int]:
    """Batch entry point — the Scheduled Pipeline Mode path (flow.md §3.1)."""
    counts: dict[str, int] = {}
    for variable in ("sst", "chlorophyll_a"):
        detections = detect_ocean_anomalies(db, variable)
        counts[variable] = persist_ocean_anomalies(db, detections)
    return counts
