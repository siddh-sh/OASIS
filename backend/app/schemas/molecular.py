from datetime import date

from pydantic import BaseModel, ConfigDict


class MolecularRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    species_id: int | None
    process_id: str
    bin_uri: str | None
    barcode_sequence: str | None
    marker_gene: str | None
    identification: str | None
    country: str | None
    province_state: str | None
    lat: float | None
    lon: float | None
    collected_at: date | None
    source: str


class MolecularRecordsPage(BaseModel):
    items: list[MolecularRecordOut]
    total: int
    limit: int
    offset: int
