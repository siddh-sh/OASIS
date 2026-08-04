import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.main import app

requires_db = pytest.mark.skipif(
    not get_settings().database_url,
    reason="DATABASE_URL not configured — see docs/supabase-setup.md. "
    "These tests exercise real endpoints against a live, seeded Supabase "
    "Postgres instance and are skipped (not faked) without one.",
)

requires_supabase_auth = pytest.mark.skipif(
    not (get_settings().supabase_url and get_settings().supabase_anon_key),
    reason="SUPABASE_URL/SUPABASE_ANON_KEY not configured — these tests call "
    "the real Supabase Auth REST API and create/remove a real throwaway user.",
)


@pytest.fixture
def client():
    return TestClient(app)
