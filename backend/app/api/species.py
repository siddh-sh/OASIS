from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Species, SpeciesOccurrence
from app.db.session import get_db
from app.schemas.common import BBox
from app.schemas.species import SpeciesOccurrenceOut, SpeciesOccurrencesPage, SpeciesOut, SpeciesPage
from app.services.geo import bbox_filter

router = APIRouter(prefix="/api/species", tags=["species"])


@router.get("", response_model=SpeciesPage)
def list_species(
    q: str | None = Query(default=None, description="substring match on scientific or common name"),
    kingdom: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Species)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Species.scientific_name.ilike(like)) | (Species.common_name.ilike(like)))
    if kingdom:
        stmt = stmt.where(Species.kingdom == kingdom)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Species.scientific_name).limit(limit).offset(offset)).all()
    return SpeciesPage(items=[SpeciesOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset)


@router.get("/occurrences", response_model=SpeciesOccurrencesPage)
def list_occurrences(
    bbox: str | None = Query(default=None, description="min_lon,min_lat,max_lon,max_lat"),
    species_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(SpeciesOccurrence)
    if species_id is not None:
        stmt = stmt.where(SpeciesOccurrence.species_id == species_id)
    if start_date is not None:
        stmt = stmt.where(SpeciesOccurrence.occurred_at >= start_date)
    if end_date is not None:
        stmt = stmt.where(SpeciesOccurrence.occurred_at <= end_date)
    parsed_bbox = BBox.parse(bbox)
    geo_clause = bbox_filter(SpeciesOccurrence.geom, parsed_bbox)
    if geo_clause is not None:
        stmt = stmt.where(geo_clause)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(SpeciesOccurrence.id).limit(limit).offset(offset)).all()
    return SpeciesOccurrencesPage(
        items=[SpeciesOccurrenceOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset
    )


@router.get("/{species_id}", response_model=SpeciesOut)
def get_species(species_id: int, db: Session = Depends(get_db)):
    row = db.get(Species, species_id)
    if row is None:
        raise HTTPException(404, "species not found")
    return SpeciesOut.model_validate(row)
