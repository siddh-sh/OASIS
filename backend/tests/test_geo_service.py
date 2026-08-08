from app.db.models import OceanographicStation
from app.schemas.common import BBox
from app.services.geo import bbox_filter


def test_bbox_filter_none_bbox_returns_none():
    assert bbox_filter(OceanographicStation.geom, None) is None


def test_bbox_filter_builds_st_intersects_clause():
    bbox = BBox(min_lon=68.0, min_lat=6.0, max_lon=90.0, max_lat=23.0)
    clause = bbox_filter(OceanographicStation.geom, bbox)
    rendered = str(clause.compile(compile_kwargs={"literal_binds": True}))
    assert "ST_Intersects" in rendered
    assert "ST_MakeEnvelope(68.0, 6.0, 90.0, 23.0, 4326)" in rendered


def test_bbox_filter_compares_in_planar_geometry_space():
    # The geography column must be cast to geometry: on a geography, box
    # edges are great-circle arcs that bulge poleward, which both admits
    # points north of max_lat and drops points just north of min_lat.
    # See app/services/geo.py for the real-data numbers behind this.
    bbox = BBox(min_lon=68.0, min_lat=6.0, max_lon=90.0, max_lat=23.0)
    clause = bbox_filter(OceanographicStation.geom, bbox)
    rendered = str(clause.compile(compile_kwargs={"literal_binds": True}))
    assert "CAST(oceanographic_stations.geom AS geometry" in rendered
