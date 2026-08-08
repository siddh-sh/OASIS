"""Shared PostGIS filter helpers so routers and agent tools build bbox
filters the same way — via ST_Intersects, never manual lat/lon range math
(flow.md Phase-1 requirement).

The comparison is deliberately done in *planar* geometry space, not on the
geography column directly. `geom` is `geography(POINT, 4326)`, and on a
geography the edges of a lat/lon box are great-circle arcs, which bulge
poleward between their endpoints. Against real station data the geodesic
form of bbox 68,6,90,23 was wrong on both edges: it returned a station at
lat 23.0417 (north of the box, let in by the bulging top edge) while
*excluding* 20 stations just north of lat 6 (cut off by the bulging bottom
edge) — 630 rows instead of 650. Casting to geometry and using
ST_MakeEnvelope gives the axis-aligned rectangle callers actually mean, and
matches a plain `lat/lon BETWEEN` query exactly.

The cast means the GIST index on the geography column can't serve this
predicate. That is a deliberate correctness-over-speed trade at current
scale (hundreds of stations, ~10k occurrences); if these tables grow, add a
functional GIST index on `(geom::geometry)` rather than reverting to
geodesic edges.
"""
from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope
from geoalchemy2.types import Geometry
from sqlalchemy import cast
from sqlalchemy.sql import ColumnElement

from app.schemas.common import BBox


def bbox_filter(geom_column, bbox: BBox | None) -> ColumnElement | None:
    if bbox is None:
        return None
    envelope = ST_MakeEnvelope(
        bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, 4326
    )
    # geography -> geometry so the envelope's edges stay axis-aligned.
    return ST_Intersects(cast(geom_column, Geometry(srid=4326)), envelope)
