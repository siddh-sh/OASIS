"""Shared PostGIS filter helpers so routers and agent tools build bbox
filters the same way — via ST_Intersects on the geography column, never
manual lat/lon range math (flow.md Phase-1 requirement)."""
from geoalchemy2.elements import WKTElement
from geoalchemy2.functions import ST_Intersects
from sqlalchemy.sql import ColumnElement

from app.schemas.common import BBox


def bbox_filter(geom_column, bbox: BBox | None) -> ColumnElement | None:
    if bbox is None:
        return None
    envelope = WKTElement(
        f"POLYGON(({bbox.min_lon} {bbox.min_lat}, {bbox.max_lon} {bbox.min_lat}, "
        f"{bbox.max_lon} {bbox.max_lat}, {bbox.min_lon} {bbox.max_lat}, "
        f"{bbox.min_lon} {bbox.min_lat}))",
        srid=4326,
    )
    return ST_Intersects(geom_column, envelope)
