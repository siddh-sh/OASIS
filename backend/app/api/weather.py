from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Region, WeatherObservation
from app.db.session import get_db
from app.schemas.weather import WeatherObservationOut, WeatherObservationsPage

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/observations", response_model=WeatherObservationsPage)
def list_observations(
    region: str | None = Query(default=None, description="region name, e.g. 'Kerala'"),
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(WeatherObservation)
    if region:
        stmt = stmt.join(Region, Region.region_id == WeatherObservation.region_id).where(Region.name == region)
    if start_date is not None:
        stmt = stmt.where(WeatherObservation.obs_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(WeatherObservation.obs_date <= end_date)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(WeatherObservation.obs_date.desc()).limit(limit).offset(offset)).all()
    return WeatherObservationsPage(
        items=[WeatherObservationOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset
    )
