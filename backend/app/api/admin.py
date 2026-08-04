from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import require_admin
from app.db.models import DatasetsMetadata
from app.db.session import get_db
from app.schemas.admin import DatasetStatusOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/datasets/status", response_model=list[DatasetStatusOut])
def datasets_status(_admin=Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(DatasetsMetadata).order_by(DatasetsMetadata.source_name)).all()
    return [DatasetStatusOut.model_validate(r) for r in rows]


@router.post("/sync/{source}", status_code=501)
def sync_source(source: str, _admin=Depends(require_admin)):
    """Wires a live collector re-run to this endpoint in Phase 7 (see
    docs/developer-c-week1-flow.md's 'Week 2 extension' note). Stubbed so
    the OpenAPI schema is complete from Phase 1."""
    raise HTTPException(501, f"sync for '{source}' not implemented yet")
