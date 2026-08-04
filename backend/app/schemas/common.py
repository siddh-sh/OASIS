"""Shared request/response building blocks used across every domain schema."""
from pydantic import BaseModel, Field


class PageParams(BaseModel):
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class BBox(BaseModel):
    """Geospatial filter: min_lon,min_lat,max_lon,max_lat (WGS84)."""

    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    @classmethod
    def parse(cls, raw: str | None) -> "BBox | None":
        if not raw:
            return None
        parts = [p.strip() for p in raw.split(",")]
        if len(parts) != 4:
            raise ValueError("bbox must be 'min_lon,min_lat,max_lon,max_lat'")
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
        return cls(min_lon=min_lon, min_lat=min_lat, max_lon=max_lon, max_lat=max_lat)


class Page(BaseModel):
    items: list
    total: int
    limit: int
    offset: int
