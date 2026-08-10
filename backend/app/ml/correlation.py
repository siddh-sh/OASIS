"""Cross-domain correlation (flow.md Phase 6, "Correlation Studio").

Correlates any two variables drawn from different domains — satellite SST,
satellite chlorophyll, coastal air temperature, rainfall — by resampling
both to a **common monthly grain** and joining on month.

The grain problem is the whole difficulty here, and it is why this is not
just `df1.corr(df2)`. The four series are measured on incompatible
schedules: satellite composites are 8-day over a 458-cell grid, weather is
daily at 18 coastal anchors. Monthly means over all stations are the
coarsest grain that all of them share honestly. Anything finer would require
inventing values for dates a series does not cover.

Two honest limits are returned with every result rather than left implicit:

  * `n_months` — with only ~24 months of overlap, a correlation needs to be
    fairly large before it means anything. The p-value is returned so a
    reader can judge, and `significant` applies the conventional 0.05 cut.
  * Correlation is computed on **spatial means**, so it answers "do these
    move together nationally month to month", not "are they related at a
    given location". Those are different questions and conflating them is
    the classic ecological fallacy.
"""
from __future__ import annotations

import pandas as pd
from scipy import stats
from sqlalchemy import DateTime, cast, func, select
from sqlalchemy.orm import Session

from app.db.models import OceanographicReading, Region, WeatherObservation

# What a caller may correlate. A fixed registry, not free-form column names —
# same principle as the agent tools: no user-supplied SQL identifiers.
VARIABLES: dict[str, dict] = {
    "sst": {"domain": "ocean", "unit": "degrees_C", "label": "Sea surface temperature"},
    "chlorophyll_a": {"domain": "ocean", "unit": "mg/m3", "label": "Chlorophyll-a"},
    "air_temp_max": {"domain": "weather", "unit": "degrees_C", "label": "Max air temperature"},
    "precipitation": {"domain": "weather", "unit": "mm", "label": "Daily precipitation"},
}

MIN_MONTHS = 6


def _monthly_series(db: Session, variable: str, region: str | None) -> pd.Series:
    """Monthly spatial mean for one variable.

    `region` is honoured only for weather. Satellite grid cells sit in open
    ocean with region_id NULL, so filtering an ocean series by region would
    return an empty set — the caller is told this in `notes` rather than
    being handed a silently empty correlation.
    """
    if variable in ("sst", "chlorophyll_a"):
        col = getattr(OceanographicReading, variable)
        month = func.date_trunc("month", OceanographicReading.timestamp)
        stmt = (
            select(month.label("month"), func.avg(col).label("value"))
            .where(col.is_not(None))
            .group_by(month)
            .order_by(month)
        )
    else:
        col = {
            "air_temp_max": WeatherObservation.temp_max_c,
            "precipitation": WeatherObservation.precipitation_mm,
        }[variable]
        month = func.date_trunc("month", cast(WeatherObservation.obs_date, DateTime))
        stmt = (
            select(month.label("month"), func.avg(col).label("value"))
            .where(col.is_not(None))
            .group_by(month)
            .order_by(month)
        )
        if region:
            stmt = stmt.join(Region, Region.region_id == WeatherObservation.region_id).where(
                Region.name == region
            )

    rows = db.execute(stmt).all()
    if not rows:
        return pd.Series(dtype=float)
    index = pd.to_datetime([r[0] for r in rows], utc=True)
    return pd.Series([float(r[1]) for r in rows], index=index, name=variable)


def correlate(db: Session, var1: str, var2: str, region: str | None = None) -> dict:
    for name in (var1, var2):
        if name not in VARIABLES:
            raise ValueError(f"unknown variable {name!r}; choose from {sorted(VARIABLES)}")
    if var1 == var2:
        raise ValueError("pick two different variables")

    s1 = _monthly_series(db, var1, region)
    s2 = _monthly_series(db, var2, region)
    joined = pd.concat([s1, s2], axis=1, join="inner").dropna()

    notes = []
    if region and "ocean" in (VARIABLES[var1]["domain"], VARIABLES[var2]["domain"]):
        notes.append(
            "Region filters do not apply to satellite variables: grid cells sit in "
            "open ocean and carry no region_id, so those series remain national."
        )

    if len(joined) < MIN_MONTHS:
        return {
            "var1": var1, "var2": var2, "region": region,
            "n_months": int(len(joined)),
            "pearson_r": None, "p_value": None, "significant": False,
            "points": [],
            "notes": [*notes, f"Only {len(joined)} overlapping months — too few to correlate."],
        }

    a = joined[var1].to_numpy(dtype=float)
    b = joined[var2].to_numpy(dtype=float)
    r, p = stats.pearsonr(a, b)
    rho, _ = stats.spearmanr(a, b)

    if len(joined) < 24:
        notes.append(
            f"Based on {len(joined)} monthly points; treat the coefficient as indicative, not conclusive."
        )
    notes.append(
        "Computed on spatial means across stations — this describes national month-to-month "
        "co-movement, not a relationship at any single location."
    )

    return {
        "var1": var1, "var2": var2, "region": region,
        "var1_label": VARIABLES[var1]["label"], "var2_label": VARIABLES[var2]["label"],
        "var1_unit": VARIABLES[var1]["unit"], "var2_unit": VARIABLES[var2]["unit"],
        "n_months": int(len(joined)),
        "pearson_r": round(float(r), 4),
        "spearman_rho": round(float(rho), 4),
        "p_value": float(f"{p:.6g}"),
        "significant": bool(p < 0.05),
        "points": [
            {"month": str(idx.date()), "x": round(float(x), 4), "y": round(float(y), 4)}
            for idx, x, y in zip(joined.index, a, b, strict=True)
        ],
        "notes": notes,
    }


def available_variables() -> list[dict]:
    return [{"name": k, **v} for k, v in VARIABLES.items()]


__all__ = ["VARIABLES", "available_variables", "correlate"]
