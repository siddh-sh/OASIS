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
    assert "POLYGON" in rendered
