from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import FisheriesCatch, FisheriesNationalTotal, Region
from app.db.session import get_db
from app.schemas.fisheries import (
    FisheriesCatchOut,
    FisheriesCatchPage,
    FisheriesNationalTotalOut,
    FisheriesSummaryOut,
)

router = APIRouter(prefix="/api/fisheries", tags=["fisheries"])


@router.get("/catch", response_model=FisheriesCatchPage)
def list_catch(
    region: str | None = Query(default=None, description="region name"),
    species_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Granular catch by region/species/date — Sea Around Us reconstructed
    catch per taxon per EEZ, 1950-2019. `species_id` is null for the rows
    SAU reports at family/order level or under its unattributed "Others"
    bucket; `gear_type` is null throughout because SAU's gear breakdown does
    not decompose by species (see data-pipeline/collectors/sea_around_us.py).
    See /summary for FAO national annual totals, which measure something
    different and must not be summed with these."""
    stmt = select(FisheriesCatch)
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
    db: Session = Depends(get_db),
):
    totals_stmt = select(FisheriesNationalTotal)
    if start_year is not None:
        totals_stmt = totals_stmt.where(FisheriesNationalTotal.year >= start_year)
    if end_year is not None:
        totals_stmt = totals_stmt.where(FisheriesNationalTotal.year <= end_year)
    totals = db.scalars(totals_stmt.order_by(FisheriesNationalTotal.year)).all()

    catch_stmt = select(FisheriesCatch)
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
