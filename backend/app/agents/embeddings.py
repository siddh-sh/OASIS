"""pgvector RAG grounding (flow.md Phase 5).

Embeds the taxonomy knowledge the chatbot needs to answer species questions
that aren't a straight table lookup — "which sardines are in the data",
"what's the scientific name for Bombay-duck" — and retrieves it by cosine
similarity.

**Embeddings are generated locally, not by an API.** Groq serves chat
completions only and has no embeddings endpoint, and paying for one would
break the free-tier constraint. fastembed runs BAAI/bge-small-en-v1.5 on
ONNX runtime: ~130 MB, no torch, no key, ~15 s to load the model once. That
is why the vector column is 384-dimensional (migration 0004) rather than the
1536 originally drafted for OpenAI's ada-002.

The ivfflat index is created *after* loading, never before: ivfflat builds
its clusters from the rows present at creation time, so an index built on an
empty table gives poor recall forever. `lists` is set from the row count by
the usual rows/1000 heuristic, floored at 10.
"""
from __future__ import annotations

from functools import lru_cache

from psycopg2.extras import execute_values
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import Species

MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBED_DIMS = 384


@lru_cache
def _model():
    from fastembed import TextEmbedding  # imported lazily: ~15 s model load

    return TextEmbedding(MODEL_NAME)


def embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in _model().embed(texts)]


def _species_documents(db: Session) -> list[tuple[str, str, str]]:
    """(source_table, source_id, content) — one document per species.

    Deliberately free of boilerplate. An earlier version wrapped each name in
    a sentence ("X is a marine species in the OASIS catalogue. Its common
    name is Y."), which made every one of the 1,482 documents ~80% identical
    text. The shared framing dominated the embedding and names barely moved
    it: querying the exact string "Harpadon nehereus" returned *Johnius
    plagiostoma* as its top hit. Stripping the scaffolding lets the
    distinguishing tokens — the names and taxonomy — carry the vector.

    Even so, embeddings are a poor tool for exact-identifier lookup; the
    resolver in agents/tools.py tries a lexical match first and only falls
    back to this.
    """
    rows = db.execute(
        select(
            Species.species_id, Species.scientific_name, Species.common_name,
            Species.family, Species.order_, Species.class_, Species.iucn_status,
        )
    ).all()

    docs = []
    for sid, sci, common, family, order, klass, iucn in rows:
        parts = [sci]
        if common:
            parts.append(common)
        parts.extend(x for x in (family, order, klass) if x)
        if iucn:
            parts.append(f"IUCN {iucn}")
        docs.append(("species", str(sid), " | ".join(parts)))
    return docs


def load_species_embeddings(db: Session, batch_size: int = 256) -> int:
    """Embed every species row and upsert into `embeddings`. Idempotent."""
    docs = _species_documents(db)
    if not docs:
        return 0

    raw = db.connection().connection
    total = 0
    for i in range(0, len(docs), batch_size):
        chunk = docs[i : i + batch_size]
        vectors = embed([c[2] for c in chunk])
        rows = [(t, sid, content, str(vec)) for (t, sid, content), vec in zip(chunk, vectors, strict=True)]
        with raw.cursor() as cur:
            execute_values(
                cur,
                "insert into embeddings (source_table, source_id, content, embedding) "
                "values %s on conflict (source_table, source_id) do update set "
                "content = excluded.content, embedding = excluded.embedding",
                rows,
                page_size=batch_size,
            )
        total += len(rows)
    db.commit()
    return total


def ensure_index(db: Session) -> str:
    """Build the ivfflat index once rows exist."""
    n = db.execute(text("select count(*) from embeddings where embedding is not null")).scalar() or 0
    if n == 0:
        return "skipped — no embeddings loaded yet"
    lists = max(10, int(n**0.5))
    db.execute(text("drop index if exists idx_embeddings_vector"))
    db.execute(
        text(
            f"create index idx_embeddings_vector on embeddings "
            f"using ivfflat (embedding vector_cosine_ops) with (lists = {lists})"
        )
    )
    db.commit()
    return f"created ivfflat index over {n} rows (lists={lists})"


def retrieve(db: Session, query: str, k: int = 5) -> list[dict]:
    """Top-k nearest documents by cosine distance."""
    vector = embed([query])[0]
    rows = db.execute(
        text(
            "select source_table, source_id, content, "
            "1 - (embedding <=> cast(:v as vector)) as similarity "
            "from embeddings where embedding is not null "
            "order by embedding <=> cast(:v as vector) limit :k"
        ),
        {"v": str(vector), "k": k},
    ).all()
    return [
        {"source_table": t, "source_id": sid, "content": c, "similarity": float(s)}
        for t, sid, c, s in rows
    ]


def main() -> None:
    from app.db.session import SessionLocal

    if SessionLocal is None:
        raise SystemExit("DATABASE_URL not configured — see docs/supabase-setup.md")
    db = SessionLocal()
    try:
        print(f"  embedded {load_species_embeddings(db):,} species documents")
        print(f"  {ensure_index(db)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
