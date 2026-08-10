"""anomaly_events: add station_id + a natural key for idempotent re-detection

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-09

Two problems with the table as drafted, both only visible once real
detection runs against real data:

1. **No location.** Anomalies are located by `region_id`, but every
   satellite grid cell in `oceanographic_stations` has `region_id` NULL —
   they sit in open ocean, not inside any coastal state, and `regions.geom`
   was never populated so there is no spatial join available to infer one.
   Since SST and chlorophyll anomalies are exactly the satellite-derived
   ones, every alert the detector produces would have been location-less:
   "a marine heatwave somewhere in India". `station_id` gives each event the
   grid cell (and therefore lat/lon) it was actually detected at.

2. **No natural key.** Re-running the detector — which happens on every data
   refresh — would insert a duplicate row for every previously-detected
   event. `(variable, station_id, detected_at)` is the real identity of an
   anomaly: one variable, one place, one timestep.

Partial unique index rather than a plain one: `station_id` is nullable (a
future non-satellite detector may be region-scoped instead), and Postgres
treats NULLs as distinct, which would silently allow duplicates for exactly
those rows.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "alter table anomaly_events add column if not exists station_id integer "
        "references oceanographic_stations(station_id)"
    )
    op.execute(
        "create unique index if not exists uq_anomaly_variable_station_time "
        "on anomaly_events (variable, station_id, detected_at) "
        "where station_id is not null"
    )
    op.execute(
        "create index if not exists idx_anomaly_station on anomaly_events (station_id)"
    )


def downgrade() -> None:
    op.execute("drop index if exists idx_anomaly_station")
    op.execute("drop index if exists uq_anomaly_variable_station_time")
    op.execute("alter table anomaly_events drop column if exists station_id")
