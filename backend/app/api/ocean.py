from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import OceanographicReading, OceanographicStation, SensorReading
from app.db.session import get_db
from app.schemas.common import BBox
from app.schemas.ocean import (
    ReadingOut,
    ReadingsPage,
    ReadingsSummaryOut,
    SensorReadingOut,
    SensorReadingsPage,
    StationOut,
    StationsPage,
)
from app.services.geo import bbox_filter

router = APIRouter(prefix="/api/ocean", tags=["ocean"])


@router.get("/stations", response_model=StationsPage)
def list_stations(
    station_type: str | None = Query(default=None, description="in-situ-buoy | coastal-anchor | satellite-grid"),
    bbox: str | None = Query(default=None, description="min_lon,min_lat,max_lon,max_lat"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(OceanographicStation)
    if station_type:
        stmt = stmt.where(OceanographicStation.station_type == station_type)
    parsed_bbox = BBox.parse(bbox)
    geo_clause = bbox_filter(OceanographicStation.geom, parsed_bbox)
    if geo_clause is not None:
        stmt = stmt.where(geo_clause)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(OceanographicStation.station_id).limit(limit).offset(offset)).all()
    items = [StationOut.model_validate(r) for r in rows]
    return StationsPage(items=items, total=total or 0, limit=limit, offset=offset)


@router.get("/readings", response_model=ReadingsPage)
def list_readings(
    station_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(OceanographicReading)
    if station_id is not None:
        stmt = stmt.where(OceanographicReading.station_id == station_id)
    if start_date is not None:
        stmt = stmt.where(OceanographicReading.timestamp >= datetime.combine(start_date, datetime.min.time()))
    if end_date is not None:
        stmt = stmt.where(OceanographicReading.timestamp <= datetime.combine(end_date, datetime.max.time()))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(OceanographicReading.timestamp.desc()).limit(limit).offset(offset)).all()
    items = [ReadingOut.model_validate(r) for r in rows]
    return ReadingsPage(items=items, total=total or 0, limit=limit, offset=offset)


@router.get("/readings/summary", response_model=list[ReadingsSummaryOut])
def readings_summary(
    variable: str = Query(..., description="sst | chlorophyll_a | salinity | dissolved_oxygen | ph"),
    region_id: int | None = None,
    db: Session = Depends(get_db),
):
    valid = {"sst", "chlorophyll_a", "salinity", "dissolved_oxygen", "ph"}
    if variable not in valid:
        raise HTTPException(422, f"variable must be one of {sorted(valid)}")
    col = getattr(OceanographicReading, variable)

    stmt = (
        select(
            OceanographicStation.region_id,
            func.count(col).label("count"),
            func.avg(col).label("avg_value"),
            func.min(col).label("min_value"),
            func.max(col).label("max_value"),
        )
        .join(OceanographicStation, OceanographicStation.station_id == OceanographicReading.station_id)
        .where(col.is_not(None))
        .group_by(OceanographicStation.region_id)
    )
    if region_id is not None:
        stmt = stmt.where(OceanographicStation.region_id == region_id)

    rows = db.execute(stmt).all()
    return [
        ReadingsSummaryOut(
            variable=variable,
            region_id=r.region_id,
            count=r.count,
            avg_value=float(r.avg_value) if r.avg_value is not None else None,
            min_value=float(r.min_value) if r.min_value is not None else None,
            max_value=float(r.max_value) if r.max_value is not None else None,
        )
        for r in rows
    ]


@router.get("/sensor-readings", response_model=SensorReadingsPage)
def list_sensor_readings(
    station_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """In-situ RAMA/TAO buoy readings — a separate table from satellite-
    derived `readings` (see schema.sql's Sensors-vs-Satellites reconciliation
    note). Exposed on its own so callers don't conflate the two."""
    stmt = select(SensorReading)
    if station_id is not None:
        stmt = stmt.where(SensorReading.station_id == station_id)
    if start_date is not None:
        stmt = stmt.where(SensorReading.obs_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(SensorReading.obs_date <= end_date)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(SensorReading.obs_date.desc()).limit(limit).offset(offset)).all()
    return SensorReadingsPage(
        items=[SensorReadingOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset
    )
