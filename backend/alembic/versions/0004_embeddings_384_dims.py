"""embeddings: retarget the vector column to 384 dimensions

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-10

The column was drafted as `vector(1536)`, the dimension of OpenAI's
text-embedding-ada-002, back when the plan assumed a paid embeddings API.
This project now runs entirely on free tiers, and the LLM provider it uses
(Groq) serves chat completions only — it has no embeddings endpoint at all.

Embeddings are therefore generated locally with fastembed
(BAAI/bge-small-en-v1.5, ONNX runtime, ~130 MB, no torch and no API key),
which produces **384** dimensions. Keeping the column at 1536 would mean
zero-padding every vector: wasted storage, and a misleading schema that
claims a precision the data does not have.

The table is empty at this point, so the column is dropped and re-added
rather than cast — there is nothing to preserve, and pgvector cannot change
dimensionality in place.

The ivfflat index is still deliberately not created here: it builds its
clusters from the rows present at creation time, so building it on an empty
table gives poor recall. `app/agents/embeddings.py` creates it after loading.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("drop index if exists idx_embeddings_vector")
    op.execute("alter table embeddings drop column if exists embedding")
    op.execute("alter table embeddings add column embedding vector(384)")
    # One row per source record; re-running the loader should update, not duplicate.
    op.execute(
        "create unique index if not exists uq_embeddings_source "
        "on embeddings (source_table, source_id)"
    )


def downgrade() -> None:
    op.execute("drop index if exists uq_embeddings_source")
    op.execute("alter table embeddings drop column if exists embedding")
    op.execute("alter table embeddings add column embedding vector(1536)")
