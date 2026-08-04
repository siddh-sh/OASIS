from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DatasetStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_name: str
    dataset_type: str
    last_synced_at: datetime | None
    record_count: int | None
    license: str | None
    last_cleaning_notes: str | None
