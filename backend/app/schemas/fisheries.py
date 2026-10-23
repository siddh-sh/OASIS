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
    external_id: str | None


class FisheriesCatchPage(BaseModel):
    items: list[FisheriesCatchOut]
    total: int
    limit: int
    offset: int


class FisheriesSummaryOut(BaseModel):
    """Surfaces both fisheries tables honestly rather than faking a shared
    grain: national_totals is annual/national (FAO reported landings), while
    granular_catch is per-taxon per-EEZ (Sea Around Us reconstruction). The
    two are NOT summable — see schema.sql's reconciliation note."""

    national_totals: list[FisheriesNationalTotalOut]
    granular_catch: list[FisheriesCatchOut]
    granular_catch_note: str = (
        "Granular catch is Sea Around Us reconstructed catch by taxon and "
        "year for the Indian EEZs (14,214 rows, 1950-2019, 108 species "
        "resolved). It is not comparable with the national totals above: FAO "
        "reports official landings, SAU reconstructs total extraction "
        "including estimated discards and unreported catch. Licensed "
        "CC-BY-NC-SA 4.0. Use /api/fisheries/catch for the full, filterable "
        "series — granular_catch here is only a small sample."
    )
