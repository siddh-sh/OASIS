from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import MolecularRecord
from app.db.session import get_db
from app.schemas.molecular import MolecularRecordOut, MolecularRecordsPage

router = APIRouter(prefix="/api/molecular", tags=["molecular"])


@router.get("/records", response_model=MolecularRecordsPage)
def list_records(
    species_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(MolecularRecord)
    if species_id is not None:
        stmt = stmt.where(MolecularRecord.species_id == species_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(MolecularRecord.id).limit(limit).offset(offset)).all()
    return MolecularRecordsPage(
        items=[MolecularRecordOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset
    )
