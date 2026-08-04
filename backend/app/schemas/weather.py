from datetime import date

from pydantic import BaseModel, ConfigDict


class WeatherObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    region_id: int
    station_id: int | None
    obs_date: date
    temp_max_c: float | None
    temp_min_c: float | None
    precipitation_mm: float | None
    wind_speed_kmh: float | None
    pressure_hpa: float | None
    source: str


class WeatherObservationsPage(BaseModel):
    items: list[WeatherObservationOut]
    total: int
    limit: int
    offset: int
