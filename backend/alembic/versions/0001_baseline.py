"""baseline: adopt the existing backend/db/schema.sql as revision 0

Revision ID: 0001
Revises:
Create Date: 2026-08-04

This does NOT re-derive the DDL by hand — it executes backend/db/schema.sql
verbatim, so there is exactly one source of truth for the schema and no risk
of this migration drifting from what apply_schema.py actually applies.

For a project whose DB was already created via `apply_schema.py` (the Week 1
path), don't run `alembic upgrade head` — that would try to re-create
existing tables. Instead run `alembic stamp 0001` to mark this revision as
already applied, then make all *future* schema changes via
`alembic revision` + `alembic upgrade head` from here on, per flow.md's
"schema changes go through Alembic after Week 1" rule.

For a fresh database, `alembic upgrade head` applies schema.sql for you and
apply_schema.py becomes unnecessary (kept only as the documented
connection-check / --reset convenience tool).
"""
from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA_SQL = Path(__file__).resolve().parents[2] / "db" / "schema.sql"

# Children before parents, so FKs don't block the drop — matches
# backend/db/apply_schema.py's TABLES ordering exactly.
TABLES = [
    "recommendations",
    "anomaly_events",
    "ml_predictions",
    "embeddings",
    "agent_messages",
    "agent_conversations",
    "molecular_records",
    "fisheries_catch",
    "fisheries_national_totals",
    "species_occurrences",
    "species",
    "weather_observations",
    "sensor_readings",
    "oceanographic_readings",
    "oceanographic_stations",
    "regions",
    "datasets_metadata",
    "profiles",
]


def upgrade() -> None:
    op.execute(SCHEMA_SQL.read_text(encoding="utf-8"))


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'drop table if exists public."{table}" cascade')
