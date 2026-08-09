"""Endpoint tests against real rows in a seeded Supabase Postgres instance.

Skipped automatically when DATABASE_URL isn't set (see conftest.requires_db)
rather than mocked — per this repo's no-synthetic-data rule, these assert
against whatever real data load_seeds.py actually loaded, not fixtures.
Run `python backend/db/apply_schema.py` then
`python data-pipeline/cleaning/load_seeds.py` before running these.
"""
from tests.conftest import requires_db


@requires_db
def test_ocean_stations_returns_real_rows(client):
    resp = client.get("/api/ocean/stations", params={"limit": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] > 0
    assert len(body["items"]) > 0
    station = body["items"][0]
    assert station["station_type"] in ("in-situ-buoy", "coastal-anchor", "satellite-grid")


@requires_db
def test_ocean_stations_bbox_filter(client):
    # India coastal bbox per docs/developer-c-week1-flow.md
    resp = client.get("/api/ocean/stations", params={"bbox": "68,6,90,23", "limit": 500})
    assert resp.status_code == 200
    body = resp.json()
    for s in body["items"]:
        assert 68 <= s["lon"] <= 90
        assert 6 <= s["lat"] <= 23


@requires_db
def test_species_list_and_get(client):
    resp = client.get("/api/species", params={"limit": 1})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    species_id = items[0]["species_id"]

    resp = client.get(f"/api/species/{species_id}")
    assert resp.status_code == 200
    assert resp.json()["species_id"] == species_id


@requires_db
def test_species_get_404_for_missing_id(client):
    resp = client.get("/api/species/999999999")
    assert resp.status_code == 404


@requires_db
def test_fisheries_summary_has_both_grains(client):
    resp = client.get("/api/fisheries/summary")
    assert resp.status_code == 200
    body = resp.json()
    # Two different measurements, deliberately not summed: FAO national
    # annual landings, and Sea Around Us per-taxon reconstruction.
    assert len(body["national_totals"]) > 0
    assert len(body["granular_catch"]) > 0
    # A sample, not the series — /catch is the paginated endpoint.
    assert len(body["granular_catch"]) <= 50


@requires_db
def test_fisheries_catch_returns_species_resolved_rows(client):
    resp = client.get("/api/fisheries/catch", params={"limit": 100})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] > 10_000, "Sea Around Us load should give ~14k taxon-year rows"
    assert all(r["source"] == "SAU" for r in body["items"])
    # Some rows resolve to a species; others are SAU's family/order-level
    # aggregates and its unattributed "Others" bucket, which carry a real
    # tonnage but no species. Both are expected — see schema.sql.
    assert any(r["species_id"] is not None for r in body["items"])
    assert all(r["catch_weight_kg"] > 0 for r in body["items"])


@requires_db
def test_fisheries_catch_species_filter_narrows_results(client):
    unfiltered = client.get("/api/fisheries/catch", params={"limit": 1}).json()["total"]
    sardine = client.get("/api/species", params={"q": "Sardinella longiceps", "limit": 1}).json()
    assert sardine["items"], "expected Sea Around Us to have contributed this species"
    species_id = sardine["items"][0]["species_id"]

    resp = client.get("/api/fisheries/catch", params={"species_id": species_id, "limit": 200})
    assert resp.status_code == 200
    body = resp.json()
    assert 0 < body["total"] < unfiltered
    assert all(r["species_id"] == species_id for r in body["items"])


@requires_db
def test_molecular_records_returns_real_rows(client):
    resp = client.get("/api/molecular/records", params={"limit": 5})
    assert resp.status_code == 200
    assert resp.json()["total"] > 0


@requires_db
def test_weather_observations_returns_real_rows(client):
    resp = client.get("/api/weather/observations", params={"limit": 5})
    assert resp.status_code == 200
    assert resp.json()["total"] > 0
