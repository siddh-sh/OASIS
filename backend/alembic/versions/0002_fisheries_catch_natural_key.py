"""fisheries_catch: add external_id + unique natural key for idempotent reload

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-08

`fisheries_catch` was created with only a surrogate `id` primary key, because
at the time nothing loaded into it (CMFRI has no API, so the table sat empty).
Populating it from Sea Around Us exposes the gap: without a unique constraint
there is nothing for `ON CONFLICT DO NOTHING` to target, so re-running
load_seeds.py would duplicate every row instead of being idempotent like
every other loader.

This adopts the same natural-key pattern `species_occurrences` already uses —
`(source, external_id)` with a unique index — rather than inventing a
different one. A composite key over the data columns was rejected because
`species_id` and `gear_type` are both nullable and Postgres treats NULLs as
distinct, which would silently permit duplicates for exactly the higher-rank
taxa (Penaeidae, Decapoda) that cannot resolve to a species row.

external_id format for SAU rows: "<eez_region_id>:<sau_entity_id>:<year>",
e.g. "356:601511:1950" — stable across re-pulls because all three components
are SAU's own identifiers.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("alter table fisheries_catch add column if not exists external_id text")
    op.execute(
        "create unique index if not exists uq_fisheries_catch_source_external "
        "on fisheries_catch (source, external_id)"
    )


def downgrade() -> None:
    op.execute("drop index if exists uq_fisheries_catch_source_external")
    op.execute("alter table fisheries_catch drop column if exists external_id")
