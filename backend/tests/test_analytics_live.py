"""Phase-4 analytics endpoints against the real seeded database.

Skipped without DATABASE_URL, like the other live tests — these assert on
real detections and real model output rather than fixtures.
"""
import pytest

from tests.conftest import requires_db


@requires_db
def test_anomalies_returns_detected_events(client):
    resp = client.get("/api/analytics/anomalies", params={"limit": 50})
    assert resp.status_code == 200
    events = resp.json()
    assert events, "detector should have persisted anomaly_events rows"
    assert all(e["variable"] in ("sst", "chlorophyll_a") for e in events)
    # station_id is the whole reason migration 0003 exists: satellite grid
    # cells have region_id NULL, so without it an event has no location.
    assert all(e["station_id"] is not None for e in events)
    assert all(e["severity"] in ("low", "medium", "high", "critical") for e in events)


@requires_db
def test_anomalies_severity_filter_narrows(client):
    everything = client.get("/api/analytics/anomalies", params={"limit": 1000}).json()
    critical = client.get(
        "/api/analytics/anomalies", params={"severity": "critical", "limit": 1000}
    ).json()
    assert 0 < len(critical) < len(everything)
    assert all(e["severity"] == "critical" for e in critical)


@requires_db
def test_anomaly_metric_exceeds_its_threshold(client):
    # A flagged event whose value sits below the threshold it supposedly
    # cleared would mean the z-score and the reported bar disagree.
    events = client.get("/api/analytics/anomalies", params={"limit": 200}).json()
    checked = [e for e in events if e["metric_value"] and e["threshold_value"]]
    assert checked
    assert all(e["metric_value"] >= e["threshold_value"] * 0.999 for e in checked)


@requires_db
def test_forecast_returns_points_and_honest_skill(client):
    stations = client.get("/api/ocean/stations", params={"station_type": "satellite-grid", "limit": 1}).json()
    station_id = stations["items"][0]["station_id"]

    resp = client.get(
        "/api/analytics/forecast/ocean-conditions",
        params={"station_id": station_id, "variable": "sst", "horizon": 3},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["points"]) == 3
    assert [p["step"] for p in body["points"]] == [1, 2, 3]
    # Indian Ocean SST: anything outside this is a broken model, not weather.
    assert all(15.0 < p["predicted_value"] < 40.0 for p in body["points"])
    assert body["skill"]["baseline_rmse"] > 0


@requires_db
def test_forecast_rejects_unknown_variable(client):
    resp = client.get(
        "/api/analytics/forecast/ocean-conditions",
        params={"station_id": 1, "variable": "salinity"},
    )
    assert resp.status_code == 422


@requires_db
def test_predict_catch_stores_an_explainable_prediction(client):
    species = client.get("/api/species", params={"q": "Sardinella longiceps", "limit": 1}).json()
    if not species["items"]:
        pytest.skip("Sea Around Us species not loaded")
    species_id = species["items"][0]["species_id"]

    resp = client.get("/api/analytics/predict/catch", params={"species_id": species_id})
    assert resp.status_code == 200
    body = resp.json()
    assert body["predicted_tonnes"] > 0
    assert body["top_features"], "SHAP attribution should be attached"

    # The prediction must be retrievable by the id it just handed back —
    # that link is what the Phase-5 recommendation agent depends on.
    explained = client.get(f"/api/analytics/explain/{body['prediction_id']}")
    assert explained.status_code == 200
    payload = explained.json()
    assert payload["target_type"] == "catch_tonnes"
    assert payload["explanation"]["contributions"]


@requires_db
def test_explain_404s_for_unknown_prediction(client):
    assert client.get("/api/analytics/explain/999999999").status_code == 404


@requires_db
def test_catch_decline_lists_declining_species_only(client):
    resp = client.get("/api/analytics/anomalies/catch-decline", params={"limit": 10})
    assert resp.status_code == 200
    rows = resp.json()
    assert rows
    assert all(r["pct_per_year"] < 0 for r in rows)
    assert rows == sorted(rows, key=lambda r: r["pct_per_year"])


@requires_db
def test_catch_forecast_targets_next_calendar_year_from_fao(client):
    from datetime import date

    sardine = client.get("/api/species", params={"q": "Sardinella longiceps", "limit": 1}).json()["items"]
    if not sardine:
        pytest.skip("Indian oil sardine not loaded")
    resp = client.get("/api/analytics/predict/catch", params={"species_id": sardine[0]["species_id"]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "FAO"
    assert body["year"] == date.today().year + 1
    assert body["last_observed_year"] >= 2024
    # The path runs year by year from the last real record to the target.
    assert [p["year"] for p in body["path"]] == list(range(body["last_observed_year"] + 1, body["year"] + 1))
    assert body["horizon_years"] == len(body["path"])
