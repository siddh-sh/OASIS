from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class StationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    station_id: int
    name: str | None
    station_type: str
    wmo_platform_code: int | None
    lat: float
    lon: float
    region_id: int | None


class StationsPage(BaseModel):
    items: list[StationOut]
    total: int
    limit: int
    offset: int


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    station_id: int
    timestamp: datetime
    sst: float | None
    chlorophyll_a: float | None
    salinity: float | None
    dissolved_oxygen: float | None
    ph: float | None
    source: str


class ReadingsPage(BaseModel):
    items: list[ReadingOut]
    total: int
    limit: int
    offset: int


class ReadingsSummaryOut(BaseModel):
    variable: str
    region_id: int | None
    count: int
    avg_value: float | None
    min_value: float | None
    max_value: float | None


class SensorReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    station_id: int
    obs_date: date
    sst_c: float | None
    air_temp_c: float | None
    wind_speed_ms: float | None
    rel_humidity_pct: float | None
    barometric_pressure_hpa: float | None
    salinity_psu: float | None
    source: str


class SensorReadingsPage(BaseModel):
    items: list[SensorReadingOut]
    total: int
    limit: int
    offset: int
