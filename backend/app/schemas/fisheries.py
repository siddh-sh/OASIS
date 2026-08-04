from datetime import date

from pydantic import BaseModel, ConfigDict


class FisheriesNationalTotalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    country: str
    year: int
    catch_metric_tons: float
    source: str


class FisheriesCatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    species_id: int | None
    region_id: int | None
    catch_date: date
    catch_weight_kg: float
    gear_type: str | None
    source: str


class FisheriesCatchPage(BaseModel):
    items: list[FisheriesCatchOut]
    total: int
    limit: int
    offset: int


class FisheriesSummaryOut(BaseModel):
    """Surfaces both fisheries tables honestly rather than faking a shared
    grain: national_totals is annual/national (populated), catch is
    granular/regional (empty pending CMFRI data — see schema.sql)."""

    national_totals: list[FisheriesNationalTotalOut]
    granular_catch: list[FisheriesCatchOut]
    granular_catch_note: str = (
        "fisheries_catch is granular (species/region) but currently empty — "
        "CMFRI has no public API, so this table is populated manually once "
        "CMFRI reports are transcribed. National annual totals above are "
        "real FAO-via-OWID data."
    )
