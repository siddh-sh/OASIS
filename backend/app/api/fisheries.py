from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import FisheriesCatch, FisheriesNationalTotal, Region, Species
from app.db.session import get_db
from app.ml.features import CATCH_SOURCES, DEFAULT_CATCH_SOURCE
from app.schemas.fisheries import (
    FisheriesCatchOut,
    FisheriesCatchPage,
    FisheriesNationalTotalOut,
    FisheriesSummaryOut,
)

router = APIRouter(prefix="/api/fisheries", tags=["fisheries"])

# Every species-level query is scoped to one source: FAO reported landings
# and SAU reconstructed catch measure different things and would double
# count if summed (see app.ml.features.CATCH_SOURCES).
_SOURCE_DOC = "FAO (reported landings, 1950-2024) | SAU (reconstructed catch, 1950-2019)"


@router.get("/catch", response_model=FisheriesCatchPage)
def list_catch(
    region: str | None = Query(default=None, description="region name"),
    species_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    source: str = Query(default=DEFAULT_CATCH_SOURCE, pattern="^(FAO|SAU)$", description=_SOURCE_DOC),
    db: Session = Depends(get_db),
):
    """Granular catch by region/species/date from one source: FAO reported
    landings per species per FAO fishing area (1950-2024), or Sea Around Us
    reconstructed catch per taxon per EEZ (1950-2019). `species_id` is null
    for higher-rank groups (FAO "nei", SAU family/order and "Others");
    `gear_type` is null throughout. See /summary for FAO national annual
    totals, which must not be summed with these."""
    stmt = select(FisheriesCatch).where(FisheriesCatch.source == source)
    if region:
        stmt = stmt.join(Region, Region.region_id == FisheriesCatch.region_id).where(Region.name == region)
    if species_id is not None:
        stmt = stmt.where(FisheriesCatch.species_id == species_id)
    if start_date is not None:
        stmt = stmt.where(FisheriesCatch.catch_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(FisheriesCatch.catch_date <= end_date)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(FisheriesCatch.catch_date.desc()).limit(limit).offset(offset)).all()
    return FisheriesCatchPage(
        items=[FisheriesCatchOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset
    )


@router.get("/summary", response_model=FisheriesSummaryOut)
def summary(
    region: str | None = Query(
        default=None, description="region name — only affects granular_catch, totals are national"
    ),
    start_year: int | None = None,
    end_year: int | None = None,
    source: str = Query(default=DEFAULT_CATCH_SOURCE, pattern="^(FAO|SAU)$", description=_SOURCE_DOC),
    db: Session = Depends(get_db),
):
    totals_stmt = select(FisheriesNationalTotal)
    if start_year is not None:
        totals_stmt = totals_stmt.where(FisheriesNationalTotal.year >= start_year)
    if end_year is not None:
        totals_stmt = totals_stmt.where(FisheriesNationalTotal.year <= end_year)
    totals = db.scalars(totals_stmt.order_by(FisheriesNationalTotal.year)).all()

    catch_stmt = select(FisheriesCatch).where(FisheriesCatch.source == source)
    if region:
        catch_stmt = catch_stmt.join(Region, Region.region_id == FisheriesCatch.region_id).where(Region.name == region)
    # A sample, not the series. The 1000-row limit here dated from when
    # fisheries_catch was empty; it now holds 14,214 rows and nothing consumes
    # this field in bulk. Callers wanting the real series use /catch, which is
    # filterable and paginated.
    catch_rows = db.scalars(catch_stmt.order_by(FisheriesCatch.catch_date.desc()).limit(50)).all()

    return FisheriesSummaryOut(
        national_totals=[FisheriesNationalTotalOut.model_validate(r) for r in totals],
        granular_catch=[FisheriesCatchOut.model_validate(r) for r in catch_rows],
    )


@router.get("/filters")
def catch_filters(
    source: str = Query(default=DEFAULT_CATCH_SOURCE, pattern="^(FAO|SAU)$", description=_SOURCE_DOC),
    db: Session = Depends(get_db),
):
    """Regions and species that actually have catch rows.

    Driving the dropdowns from this rather than from the full tables matters:
    `species` holds 1,482 rows but only 110 have any catch history, so the
    other 1,372 would be dead options.
    """
    regions = db.execute(
        select(Region.region_id, Region.name)
        .join(FisheriesCatch, FisheriesCatch.region_id == Region.region_id)
        .where(FisheriesCatch.source == source)
        .group_by(Region.region_id, Region.name)
        .order_by(Region.name)
    ).all()

    species = db.execute(
        select(
            Species.species_id,
            Species.scientific_name,
            Species.common_name,
            func.sum(FisheriesCatch.catch_weight_kg).label("total"),
        )
        .join(FisheriesCatch, FisheriesCatch.species_id == Species.species_id)
        .where(FisheriesCatch.source == source)
        .group_by(Species.species_id, Species.scientific_name, Species.common_name)
        .order_by(func.sum(FisheriesCatch.catch_weight_kg).desc())
    ).all()

    years = db.execute(
        select(func.min(FisheriesCatch.catch_date), func.max(FisheriesCatch.catch_date))
        .where(FisheriesCatch.source == source)
    ).one()

    return {
        "source": source,
        "label": CATCH_SOURCES[source]["label"],
        "first_year": years[0].year if years[0] else None,
        "last_year": years[1].year if years[1] else None,
        "regions": [{"region_id": r[0], "name": r[1]} for r in regions],
        # Ordered by total catch so the dropdown opens on the species that
        # matter, not alphabetically on something landing three tonnes.
        "species": [
            {
                "species_id": s_[0],
                "scientific_name": s_[1],
                "common_name": s_[2],
                "total_tonnes": round(float(s_[3]) / 1000, 1),
            }
            for s_ in species
        ],
    }


@router.get("/timeseries")
def catch_timeseries(
    group_by: str = Query(default="none", description="none | species | region"),
    region_id: int | None = None,
    species_id: int | None = None,
    start_year: int | None = None,
    end_year: int | None = None,
    top_n: int = Query(default=8, ge=1, le=20, description="series kept when grouping"),
    source: str = Query(default=DEFAULT_CATCH_SOURCE, pattern="^(FAO|SAU)$", description=_SOURCE_DOC),
    db: Session = Depends(get_db),
):
    """Annual catch, optionally broken down by species or region.

    `top_n` exists because grouping by species yields 110 series — unreadable
    as a chart and useless as a legend. The largest are kept by total catch
    and the rest collapsed into one "Other" series, so yearly totals still add
    up instead of silently losing the tail.
    """
    if group_by not in ("none", "species", "region"):
        raise HTTPException(422, "group_by must be one of: none, species, region")

    year = func.extract("year", FisheriesCatch.catch_date).label("year")
    tonnes = (func.sum(FisheriesCatch.catch_weight_kg) / 1000.0).label("tonnes")

    if group_by == "species":
        key = Species.species_id
        label = func.coalesce(Species.common_name, Species.scientific_name)
    elif group_by == "region":
        key, label = Region.region_id, Region.name
    else:
        key = label = None

    stmt = select(year, tonnes) if key is None else select(year, key.label("key"), label.label("label"), tonnes)
    if group_by == "species":
        stmt = stmt.join(Species, Species.species_id == FisheriesCatch.species_id)
    elif group_by == "region":
        stmt = stmt.join(Region, Region.region_id == FisheriesCatch.region_id)

    stmt = stmt.where(FisheriesCatch.source == source)
    if region_id is not None:
        stmt = stmt.where(FisheriesCatch.region_id == region_id)
    if species_id is not None:
        stmt = stmt.where(FisheriesCatch.species_id == species_id)
    if start_year is not None:
        stmt = stmt.where(year >= start_year)
    if end_year is not None:
        stmt = stmt.where(year <= end_year)

    stmt = stmt.group_by(year) if key is None else stmt.group_by(year, key, label)
    rows = db.execute(stmt.order_by(year)).all()

    meta = {"unit": "tonnes", "source": CATCH_SOURCES[source]["citation"], "source_key": source}

    if key is None:
        return {
            "group_by": group_by,
            "series": [{
                "key": "total",
                "label": "Total catch",
                "points": [{"year": int(r[0]), "tonnes": round(float(r[1]), 1)} for r in rows],
            }],
            **meta,
        }

    totals: dict[int, float] = {}
    labels: dict[int, str] = {}
    for _, k, lbl, t in rows:
        totals[k] = totals.get(k, 0.0) + float(t)
        labels[k] = lbl
    keep = {k for k, _ in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:top_n]}
    n_other = len(totals) - len(keep)

    series: dict[str, dict] = {}
    for yr, k, _lbl, t in rows:
        bucket = str(k) if k in keep else "other"
        name = labels[k] if k in keep else f"Other ({n_other} more)"
        entry = series.setdefault(bucket, {"key": bucket, "label": name, "_by_year": {}})
        entry["_by_year"][int(yr)] = entry["_by_year"].get(int(yr), 0.0) + float(t)

    out = [
        {
            "key": e["key"],
            "label": e["label"],
            "points": [{"year": y, "tonnes": round(v, 1)} for y, v in sorted(e["_by_year"].items())],
        }
        for e in series.values()
    ]
    out.sort(key=lambda s_: (s_["key"] == "other", -sum(p["tonnes"] for p in s_["points"])))

    return {"group_by": group_by, "series": out, **meta}
