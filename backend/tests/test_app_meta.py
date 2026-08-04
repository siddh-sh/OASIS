"""Structural tests that don't need a DB: the app boots, every endpoint
from flow.md §11 is registered, and OpenAPI docs generate cleanly."""

EXPECTED_PATHS = {
    "/health",
    "/auth/signup",
    "/auth/login",
    "/auth/logout",
    "/auth/me",
    "/api/ocean/stations",
    "/api/ocean/readings",
    "/api/ocean/readings/summary",
    "/api/ocean/sensor-readings",
    "/api/weather/observations",
    "/api/species",
    "/api/species/{species_id}",
    "/api/species/occurrences",
    "/api/fisheries/catch",
    "/api/fisheries/summary",
    "/api/molecular/records",
    "/api/admin/datasets/status",
    "/api/admin/sync/{source}",
    "/api/analytics/predict/catch",
    "/api/analytics/forecast/ocean-conditions",
    "/api/analytics/anomalies",
    "/api/analytics/explain/{prediction_id}",
    "/api/analytics/recommendation/{prediction_or_anomaly_id}",
    "/api/analytics/correlation",
    "/api/agent/chat",
    "/api/agent/conversations/{conversation_id}",
    "/api/agent/report",
}


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_openapi_schema_has_every_planned_endpoint(client):
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    paths = set(resp.json()["paths"].keys())
    missing = EXPECTED_PATHS - paths
    assert not missing, f"missing routes: {missing}"


def test_analytics_endpoints_stub_501(client):
    resp = client.get("/api/analytics/predict/catch")
    assert resp.status_code == 501


def test_agent_chat_stub_501(client):
    resp = client.post("/api/agent/chat", json={"message": "hello"})
    assert resp.status_code == 501


def test_admin_status_requires_auth(client):
    # No Authorization header -> current_user dependency rejects it before
    # any DB access, so this doesn't need DATABASE_URL to be meaningful.
    resp = client.get("/api/admin/datasets/status")
    assert resp.status_code == 401
