"""SQLAlchemy models — a faithful 1:1 mapping of backend/db/schema.sql.

Table names, columns, nullability, unique constraints and FKs mirror the SQL
exactly. Do not add columns the schema doesn't have without also adding an
Alembic migration for them (see backend/alembic/). The `-- Reconciliation:`
comments in schema.sql explain the real-data-driven design decisions behind
several of these tables (e.g. why sensor_readings is separate from
oceanographic_readings, why fisheries_national_totals exists) — read that
file, not just this one, before changing shape here.
"""
from datetime import date, datetime

from geoalchemy2 import Geography
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Region(Base):
    __tablename__ = "regions"

    region_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    state: Mapped[str | None] = mapped_column(Text)
    geom = mapped_column(Geography("POLYGON", srid=4326), nullable=True)


class OceanographicStation(Base):
    __tablename__ = "oceanographic_stations"
    __table_args__ = (
        UniqueConstraint("lat", "lon", "station_type"),
        CheckConstraint(
            "station_type in ('in-situ-buoy', 'coastal-anchor', 'satellite-grid')",
            name="oceanographic_stations_station_type_check",
        ),
        Index("idx_ocean_stations_geom", "geom", postgresql_using="gist"),
    )

    station_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(Text)
    station_type: Mapped[str] = mapped_column(Text, nullable=False)
    wmo_platform_code: Mapped[int | None]
    lat: Mapped[float] = mapped_column(nullable=False)
    lon: Mapped[float] = mapped_column(nullable=False)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.region_id"))
    geom = mapped_column(Geography("POINT", srid=4326), nullable=True)


class OceanographicReading(Base):
    __tablename__ = "oceanographic_readings"
    __table_args__ = (
        UniqueConstraint("station_id", "timestamp", "source"),
        Index("idx_ocean_readings_station_time", "station_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("oceanographic_stations.station_id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column("timestamp", DateTime(timezone=True), nullable=False)
    sst: Mapped[float | None] = mapped_column(Numeric)
    chlorophyll_a: Mapped[float | None] = mapped_column(Numeric)
    salinity: Mapped[float | None] = mapped_column(Numeric)
    dissolved_oxygen: Mapped[float | None] = mapped_column(Numeric)
    ph: Mapped[float | None] = mapped_column(Numeric)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (
        UniqueConstraint("station_id", "obs_date", "source"),
        Index("idx_sensor_readings_station_date", "station_id", "obs_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("oceanographic_stations.station_id"), nullable=False)
    obs_date: Mapped[date] = mapped_column(Date, nullable=False)
    sst_c: Mapped[float | None] = mapped_column(Numeric)
    air_temp_c: Mapped[float | None] = mapped_column(Numeric)
    wind_speed_ms: Mapped[float | None] = mapped_column(Numeric)
    rel_humidity_pct: Mapped[float | None] = mapped_column(Numeric)
    barometric_pressure_hpa: Mapped[float | None] = mapped_column(Numeric)
    salinity_psu: Mapped[float | None] = mapped_column(Numeric)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="NOAA-PMEL-RAMA")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WeatherObservation(Base):
    __tablename__ = "weather_observations"
    __table_args__ = (
        UniqueConstraint("station_id", "obs_date", "source"),
        Index("idx_weather_region_date", "region_id", "obs_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.region_id"), nullable=False)
    station_id: Mapped[int | None] = mapped_column(ForeignKey("oceanographic_stations.station_id"))
    obs_date: Mapped[date] = mapped_column(Date, nullable=False)
    temp_max_c: Mapped[float | None] = mapped_column(Numeric)
    temp_min_c: Mapped[float | None] = mapped_column(Numeric)
    precipitation_mm: Mapped[float | None] = mapped_column(Numeric)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Numeric)
    pressure_hpa: Mapped[float | None] = mapped_column(Numeric)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="Open-Meteo")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Species(Base):
    __tablename__ = "species"

    species_id: Mapped[int] = mapped_column(primary_key=True)
    scientific_name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    common_name: Mapped[str | None] = mapped_column(Text)
    kingdom: Mapped[str | None] = mapped_column(Text)
    phylum: Mapped[str | None] = mapped_column(Text)
    class_: Mapped[str | None] = mapped_column("class", Text)
    order_: Mapped[str | None] = mapped_column("order", Text)
    family: Mapped[str | None] = mapped_column(Text)
    genus: Mapped[str | None] = mapped_column(Text)
    species_epithet: Mapped[str | None] = mapped_column(Text)
    iucn_status: Mapped[str | None] = mapped_column(Text)


class SpeciesOccurrence(Base):
    __tablename__ = "species_occurrences"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_species_occ_source_external"),
        Index("idx_species_occ_geom", "geom", postgresql_using="gist"),
        Index("idx_species_occ_species_time", "species_id", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    species_id: Mapped[int | None] = mapped_column(ForeignKey("species.species_id"))
    lat: Mapped[float | None]
    lon: Mapped[float | None]
    geom = mapped_column(Geography("POINT", srid=4326), nullable=True)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    depth: Mapped[float | None] = mapped_column(Numeric)
    basis_of_record: Mapped[str | None] = mapped_column(Text)
    sst: Mapped[float | None] = mapped_column(Numeric)
    sss: Mapped[float | None] = mapped_column(Numeric)
    bathymetry: Mapped[float | None] = mapped_column(Numeric)
    shoredistance: Mapped[float | None] = mapped_column(Numeric)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    external_id: Mapped[str | None] = mapped_column(Text)


class FisheriesNationalTotal(Base):
    __tablename__ = "fisheries_national_totals"
    __table_args__ = (UniqueConstraint("country", "year", "source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    country: Mapped[str] = mapped_column(Text, nullable=False, server_default="India")
    year: Mapped[int] = mapped_column(nullable=False)
    catch_metric_tons: Mapped[float] = mapped_column(Numeric, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="FAO-via-OWID")


class FisheriesCatch(Base):
    __tablename__ = "fisheries_catch"
    __table_args__ = (Index("idx_fisheries_region_date", "region_id", "catch_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    species_id: Mapped[int | None] = mapped_column(ForeignKey("species.species_id"))
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.region_id"))
    catch_date: Mapped[date] = mapped_column(Date, nullable=False)
    catch_weight_kg: Mapped[float] = mapped_column(Numeric, nullable=False)
    gear_type: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False)


class MolecularRecord(Base):
    __tablename__ = "molecular_records"
    __table_args__ = (Index("idx_molecular_species", "species_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    species_id: Mapped[int | None] = mapped_column(ForeignKey("species.species_id"))
    process_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    bin_uri: Mapped[str | None] = mapped_column(Text)
    barcode_sequence: Mapped[str | None] = mapped_column(Text)
    marker_gene: Mapped[str | None] = mapped_column(Text)
    identification: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)
    province_state: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None]
    lon: Mapped[float | None]
    collected_at: Mapped[date | None] = mapped_column(Date)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="BOLD")


class MLPrediction(Base):
    __tablename__ = "ml_predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    input_ref: Mapped[str | None] = mapped_column(Text)
    predicted_value: Mapped[float | None] = mapped_column(Numeric)
    confidence: Mapped[float | None] = mapped_column(Numeric)
    shap_values: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"
    __table_args__ = (Index("idx_anomaly_domain_time", "domain", "detected_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    domain: Mapped[str] = mapped_column(Text, nullable=False)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.region_id"))
    variable: Mapped[str] = mapped_column(Text, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    severity: Mapped[str | None] = mapped_column(Text)
    metric_value: Mapped[float | None] = mapped_column(Numeric)
    threshold_value: Mapped[float | None] = mapped_column(Numeric)


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    ml_prediction_id: Mapped[int | None] = mapped_column(ForeignKey("ml_predictions.id"))
    anomaly_event_id: Mapped[int | None] = mapped_column(ForeignKey("anomaly_events.id"))
    narrative: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Embedding(Base):
    __tablename__ = "embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_table: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Dimension must match whatever embedding model Phase 5 picks — see the
    # warning comment above the ivfflat index in schema.sql.
    embedding = mapped_column(Vector(1536), nullable=True)


class DatasetsMetadata(Base):
    __tablename__ = "datasets_metadata"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_type: Mapped[str] = mapped_column(Text, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    record_count: Mapped[int | None]
    license: Mapped[str | None] = mapped_column(Text)
    last_cleaning_notes: Mapped[str | None] = mapped_column(Text)


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(
            "role in ('researcher', 'policymaker', 'admin')",
            name="profiles_role_check",
        ),
    )

    # References Supabase's own auth.users(id) — that table lives outside
    # this app's model set and is managed by Supabase Auth directly.
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    email: Mapped[str | None] = mapped_column(Text)
    full_name: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default="researcher")
    institution: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentConversation(Base):
    __tablename__ = "agent_conversations"
    __table_args__ = (Index("idx_agent_conv_user", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("profiles.user_id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    messages: Mapped[list["AgentMessage"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class AgentMessage(Base):
    __tablename__ = "agent_messages"
    __table_args__ = (
        CheckConstraint("role in ('user', 'assistant', 'tool')", name="agent_messages_role_check"),
        Index("idx_agent_msg_conv", "conversation_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("agent_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_calls: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[AgentConversation] = relationship(back_populates="messages")
