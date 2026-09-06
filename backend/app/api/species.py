import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.functions import ST_AsGeoJSON, ST_Contains
from geoalchemy2.types import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.agents.llm import LLMNotConfigured, llm_available
from app.db.models import Region, Species, SpeciesOccurrence
from app.db.session import get_db
from app.schemas.common import BBox
from app.schemas.species import (
    SpeciesOccurrenceOut,
    SpeciesOccurrencesPage,
    SpeciesOut,
    SpeciesPage,
)
from app.services.geo import bbox_filter
from app.services.species_media import MediaUnavailable, get_species_photos

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
    # Species with a common name first (110 of 1,482 have one) — otherwise an
    # unfiltered, alphabetical-by-scientific-name list buries them at random
    # and a non-researcher view mode never gets to show what it has.
    rows = db.scalars(
        stmt.order_by(Species.common_name.is_(None), Species.scientific_name).limit(limit).offset(offset)
    ).all()
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


@router.get("/{species_id}/photos")
def species_photos(species_id: int, limit: int = Query(default=6, ge=1, le=20), db: Session = Depends(get_db)):
    """Recent photographed sightings of this species in India (§4b).

    Live from GBIF rather than stored: the URLs point at third-party hosts, so
    ingesting them would preserve a pointer that can rot, not an image.
    Coverage is genuinely partial — many species have no photographed Indian
    occurrence — and `total_with_photos` says so instead of returning a bare
    empty list.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")
    try:
        return get_species_photos(species.scientific_name, limit=limit)
    except MediaUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/{species_id}/regions")
def species_regions(species_id: int, db: Session = Depends(get_db)):
    """Which coastal state(s) this species' occurrences fall within.

    Point-in-polygon against `regions.geom` — not a stored relationship,
    since `species_occurrences` only carries lat/lon, not a region_id. Only
    the 9 coastal states have a boundary loaded (simplified from GADM, see
    `data-pipeline/cleaning/load_seeds.py:load_region_boundaries`); the EEZ
    regions and "Open Indian Ocean" have none, so open-water occurrences
    simply match no region rather than a fabricated one.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")

    region_geom = cast(Region.geom, Geometry(srid=4326))
    occ_geom = cast(SpeciesOccurrence.geom, Geometry(srid=4326))

    rows = db.execute(
        select(
            Region.region_id,
            Region.name,
            func.count(SpeciesOccurrence.id),
            ST_AsGeoJSON(Region.geom),
        )
        .join(SpeciesOccurrence, ST_Contains(region_geom, occ_geom))
        .where(SpeciesOccurrence.species_id == species_id, Region.geom.isnot(None))
        .group_by(Region.region_id, Region.name, Region.geom)
        .order_by(func.count(SpeciesOccurrence.id).desc())
    ).all()

    def polygon_latlon(geojson_str: str) -> list[list[float]]:
        # GeoJSON is [lon, lat]; the frontend map wants [lat, lon].
        ring = json.loads(geojson_str)["coordinates"][0]
        return [[lat, lon] for lon, lat in ring]

    return {
        "regions": [
            {
                "region_id": region_id,
                "name": name,
                "occurrence_count": count,
                "polygon": polygon_latlon(geojson_str),
            }
            for region_id, name, count, geojson_str in rows
        ]
    }


@router.get("/{species_id}/context")
def species_context(species_id: int, db: Session = Depends(get_db)):
    """Why this species turns up where it does, from its own occurrence records.

    Summarises the environmental conditions actually recorded alongside the
    sightings — OBIS ships sst/sss/bathymetry per record — then has the LLM
    phrase it. The numbers are computed here; the model only narrates them,
    the same split as the Phase-5 recommendation agent.

    **No relocation forecast is returned, deliberately.** The doc asks for
    one. The occurrence data is two years of opportunistic OBIS/GBIF records,
    where apparent movement between years tracks who went looking far more
    than it tracks the fish. A "predicted future range" built on that would be
    an artefact of sampling effort wearing the costume of a model, and it is
    the same reason the Phase-4 anomaly work refused a species-decline
    detector. Doing it properly needs either tagging data or a species
    distribution model trained on environmental covariates — neither is in
    this platform.
    """
    species = db.get(Species, species_id)
    if species is None:
        raise HTTPException(404, f"no species with id={species_id}")

    stats = db.execute(
        select(
            func.count(SpeciesOccurrence.id),
            func.avg(SpeciesOccurrence.sst),
            func.min(SpeciesOccurrence.sst),
            func.max(SpeciesOccurrence.sst),
            func.avg(SpeciesOccurrence.sss),
            func.avg(SpeciesOccurrence.bathymetry),
            func.min(SpeciesOccurrence.lat),
            func.max(SpeciesOccurrence.lat),
            func.min(SpeciesOccurrence.lon),
            func.max(SpeciesOccurrence.lon),
        ).where(SpeciesOccurrence.species_id == species_id)
    ).one()

    n, sst_avg, sst_min, sst_max, sss_avg, bathy_avg, lat0, lat1, lon0, lon1 = stats
    if not n:
        raise HTTPException(404, f"no occurrence records for species_id={species_id}")

    def num(v):
        return round(float(v), 2) if v is not None else None

    evidence = {
        "scientific_name": species.scientific_name,
        "common_name": species.common_name,
        "n_occurrences": int(n),
        "sst_c": {"mean": num(sst_avg), "min": num(sst_min), "max": num(sst_max)},
        "salinity_psu_mean": num(sss_avg),
        "seabed_depth_m_mean": num(bathy_avg),
        "latitude_range": [num(lat0), num(lat1)],
        "longitude_range": [num(lon0), num(lon1)],
    }

    if not llm_available():
        return {**evidence, "explanation": None,
                "note": "Set LLM_API_KEY to get a plain-language explanation of these figures."}

    from langchain_core.messages import HumanMessage, SystemMessage

    from app.agents.llm import get_llm

    prompt = (
        "You explain marine species distribution to Indian fishing communities. "
        "Given the recorded conditions where a species was observed, write 3-4 short "
        "sentences on what those conditions suggest about where and why it is found. "
        "Use ONLY the numbers given. Do not invent migration routes, seasons or "
        "spawning behaviour that the data does not show. If the sample is small, say so. "
        "Plain language, no headings."
    )
    try:
        explanation = get_llm(temperature=0.2).invoke(
            [SystemMessage(content=prompt), HumanMessage(content=str(evidence))]
        ).content.strip()
    except LLMNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc

    return {
        **evidence,
        "explanation": explanation,
        "relocation_forecast": None,
        "relocation_note": (
            "Not provided. Two years of opportunistic occurrence records cannot "
            "distinguish real range shift from changes in observer effort; a "
            "prediction from them would reflect who went looking, not the fish. "
            "This needs tagging data or a species distribution model."
        ),
    }
