from fastapi import APIRouter, Depends, Query
from geoalchemy2.functions import ST_Contains
from geoalchemy2.types import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.db.models import Region
from app.db.session import get_db

router = APIRouter(prefix="/api/regions", tags=["regions"])


@router.get("/locate")
def locate(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db),
):
    """Which coastal state a lat/lon point falls in, for location-based
    features (e.g. defaulting the UI language to the visitor's state).

    Point-in-polygon against the same simplified state boundaries used by
    `/api/species/{id}/regions` — see
    `data-pipeline/cleaning/load_seeds.py:load_region_boundaries` for their
    source and limits. Only the 9 coastal states have a boundary loaded, so a
    point outside all of them (inland, another country, open ocean) simply
    matches nothing rather than a guessed region.
    """
    point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    region_geom = cast(Region.geom, Geometry(srid=4326))

    row = db.execute(
        select(Region.region_id, Region.name, Region.state)
        .where(Region.geom.isnot(None), ST_Contains(region_geom, point))
        .limit(1)
    ).first()

    if row is None:
        return {"matched": False, "region_id": None, "name": None, "state": None}

    return {"matched": True, "region_id": row.region_id, "name": row.name, "state": row.state}
