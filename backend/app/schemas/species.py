from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SpeciesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    species_id: int
    scientific_name: str
    common_name: str | None
    kingdom: str | None
    phylum: str | None
    class_: str | None = Field(default=None, alias="class_", serialization_alias="class")
    order_: str | None = Field(default=None, alias="order_", serialization_alias="order")
    family: str | None
    genus: str | None
    species_epithet: str | None
    iucn_status: str | None


class SpeciesPage(BaseModel):
    items: list[SpeciesOut]
    total: int
    limit: int
    offset: int


class SpeciesOccurrenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    species_id: int | None
    lat: float | None
    lon: float | None
    occurred_at: datetime | None
    depth: float | None
    basis_of_record: str | None
    sst: float | None
    sss: float | None
    bathymetry: float | None
    shoredistance: float | None
    source: str
    external_id: str | None


class SpeciesOccurrencesPage(BaseModel):
    items: list[SpeciesOccurrenceOut]
    total: int
    limit: int
    offset: int
