"""SQLAlchemy engine/session, reading DATABASE_URL from settings.

Uses the same Supabase session-pooler connection string as
`backend/db/apply_schema.py` and `data-pipeline/cleaning/load_seeds.py` —
one DATABASE_URL, three consumers.
"""
from collections.abc import Generator

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    settings = get_settings()
    if not settings.database_url:
        # Deferred failure: importing app.db.session (e.g. for Alembic
        # autogenerate or unit tests that don't touch the DB) must not
        # crash just because .env isn't populated yet.
        return None
    return create_engine(settings.database_url, pool_pre_ping=True, future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True) if engine else None


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        # HTTPException (not a raw RuntimeError) so it's caught by FastAPI's
        # exception middleware, which sits inside CORSMiddleware — a raw
        # exception propagates past CORSMiddleware entirely and the browser
        # sees a response with no CORS headers, which surfaces as an opaque
        # "Failed to fetch" instead of this message.
        raise HTTPException(
            503,
            "DATABASE_URL is not configured — copy .env.example to .env and "
            "fill in the Supabase connection string (see docs/supabase-setup.md).",
        )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
