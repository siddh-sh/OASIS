from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import OceanographicStation, Region, WeatherObservation
from app.db.session import get_db
from app.schemas.weather import WeatherObservationOut, WeatherObservationsPage
from app.services.weather_forecast import ForecastUnavailable, get_forecast

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


# The states project-changes.md §3a scopes the weather view to. Applied as a
# UI default, not a data restriction: the other six coastal states stay loaded
# and selectable, so nothing real is thrown away.
PRIORITY_STATES = ("Kerala", "Goa", "Odisha")


@router.get("/stations")
def weather_stations(
    priority_only: bool = Query(default=False, description="restrict to Kerala/Goa/Odisha"),
    db: Session = Depends(get_db),
):
    """Coastal anchor points that have weather observations, with coordinates.

    Returned so the weather map can plot them and the forecast endpoint can be
    called per station — the observations table alone has no lat/lon.
    """
    stmt = (
        select(
            OceanographicStation.station_id,
            OceanographicStation.name,
            OceanographicStation.lat,
            OceanographicStation.lon,
            Region.name.label("region"),
            func.count(WeatherObservation.id).label("n_observations"),
        )
        .join(WeatherObservation, WeatherObservation.station_id == OceanographicStation.station_id)
        .join(Region, Region.region_id == WeatherObservation.region_id)
        .group_by(
            OceanographicStation.station_id, OceanographicStation.name,
            OceanographicStation.lat, OceanographicStation.lon, Region.name,
        )
        .order_by(Region.name, OceanographicStation.name)
    )
    if priority_only:
        stmt = stmt.where(Region.name.in_(PRIORITY_STATES))

    return [
        {
            "station_id": r[0], "name": r[1], "lat": r[2], "lon": r[3],
            "region": r[4], "n_observations": int(r[5]),
        }
        for r in db.execute(stmt).all()
    ]


@router.get("/forecast")
def weather_forecast(
    station_id: int | None = Query(default=None, description="a coastal anchor station"),
    lat: float | None = None,
    lon: float | None = None,
    db: Session = Depends(get_db),
):
    """Live forecast: current conditions, next 24 hours, next 7 days.

    Fetched from Open-Meteo per request rather than read from the database.
    A forecast is only meaningful while current, so storing one would mean
    serving stale numbers that still look authoritative — see
    app/services/weather_forecast.py.
    """
    if station_id is not None:
        station = db.get(OceanographicStation, station_id)
        if station is None:
            raise HTTPException(404, f"no station with id={station_id}")
        lat, lon = station.lat, station.lon
    if lat is None or lon is None:
        raise HTTPException(422, "provide either station_id, or both lat and lon")

    try:
        return get_forecast(lat, lon)
    except ForecastUnavailable as exc:
        # 503, not 500: the upstream provider is down, this service is fine.
        raise HTTPException(503, str(exc)) from exc
