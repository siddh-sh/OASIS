from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import MolecularRecord
from app.db.session import get_db
from app.ml.edna import search as edna_search
from app.schemas.molecular import MolecularRecordOut, MolecularRecordsPage

router = APIRouter(prefix="/api/molecular", tags=["molecular"])


class SequenceMatchRequest(BaseModel):
    sequence: str = Field(
        min_length=1,
        max_length=20000,
        description="Nucleotide sequence; FASTA headers, gaps and ambiguity codes are stripped",
    )
    limit: int = Field(default=10, ge=1, le=50)
    marker_gene: str | None = Field(default=None, description="restrict to one marker, e.g. COI-5P")


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


@router.post("/match")
def match_sequence(body: SequenceMatchRequest, db: Session = Depends(get_db)):
    """Rank BOLD barcode records against a submitted sequence.

    k-mer composition cosine similarity, **not** alignment — see
    `app/ml/edna.py`. The response carries that caveat so a result is never
    read as a BLAST-grade identification.
    """
    try:
        return edna_search(db, body.sequence, limit=body.limit, marker_gene=body.marker_gene)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
