import pytest

from app.schemas.common import BBox


def test_bbox_parse_none():
    assert BBox.parse(None) is None
    assert BBox.parse("") is None


def test_bbox_parse_valid():
    bbox = BBox.parse("68.0,6.0,90.0,23.0")
    assert bbox.min_lon == 68.0
    assert bbox.min_lat == 6.0
    assert bbox.max_lon == 90.0
    assert bbox.max_lat == 23.0


def test_bbox_parse_wrong_arity_raises():
    with pytest.raises(ValueError):
        BBox.parse("1,2,3")


def test_bbox_parse_non_numeric_raises():
    with pytest.raises(ValueError):
        BBox.parse("a,b,c,d")
