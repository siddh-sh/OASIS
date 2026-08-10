"""Phase-6 Should-Haves: Correlation Studio and eDNA similarity search."""
import pytest

from app.ml.edna import clean_sequence, cosine, kmer_vector
from tests.conftest import requires_db

# --------------------------------------------------------------- eDNA (pure)


def test_clean_sequence_strips_fasta_gaps_and_ambiguity():
    raw = ">BOLD|ABC123 some description\nACGT--NNRYacgt\nACGT\n"
    # Gaps and ambiguity codes are dropped rather than treated as a fifth
    # base; BOLD records genuinely contain long '-' runs.
    assert clean_sequence(raw) == "ACGTACGTACGT"


def test_cosine_is_1_for_identical_and_0_for_disjoint():
    a = kmer_vector("ACGTACGTACGT")
    assert cosine(a, a) == pytest.approx(1.0)
    assert cosine(a, kmer_vector("TTTTTTTTTTTT")) == 0.0
    assert cosine(a, kmer_vector("")) == 0.0


def test_kmers_preserve_local_order_not_just_base_composition():
    # Identical base counts, opposite arrangement. Pure composition would call
    # these identical; 5-mers share only AAAAA and CCCCC out of six windows
    # each, so they separate. Worth pinning: it bounds how much the caveat in
    # edna.py should claim is lost.
    a, b = kmer_vector("AAAAACCCCC"), kmer_vector("CCCCCAAAAA")
    assert cosine(a, b) == pytest.approx(1 / 3, abs=0.01)
    assert cosine(a, a) == pytest.approx(1.0)


# ---------------------------------------------------------------- eDNA (live)


@requires_db
def test_a_real_barcode_matches_itself_first(client, db_session):
    from sqlalchemy import text

    row = db_session.execute(
        text(
            "select process_id, barcode_sequence from molecular_records "
            "where barcode_sequence is not null and length(barcode_sequence) > 400 limit 1"
        )
    ).one()

    resp = client.post("/api/molecular/match", json={"sequence": row[1], "limit": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["matches"][0]["process_id"] == row[0]
    assert body["matches"][0]["similarity"] == pytest.approx(1.0, abs=1e-6)
    # Separation from the runner-up is what makes the ranking meaningful.
    assert body["matches"][1]["similarity"] < 0.9
    assert "not sequence alignment" in body["caveat"]


@requires_db
def test_match_rejects_a_sequence_with_too_little_signal(client):
    assert client.post("/api/molecular/match", json={"sequence": "ACGT"}).status_code == 422
    # Punctuation-only input cleans to nothing.
    assert client.post("/api/molecular/match", json={"sequence": ">header only\n----"}).status_code == 422


# ----------------------------------------------------------------- correlation


@requires_db
def test_correlation_variables_are_a_fixed_registry(client):
    resp = client.get("/api/analytics/correlation/variables")
    assert resp.status_code == 200
    names = {v["name"] for v in resp.json()}
    assert {"sst", "chlorophyll_a", "air_temp_max", "precipitation"} <= names


@requires_db
def test_sst_and_chlorophyll_are_negatively_correlated(client):
    """The known oceanographic signal: warm water stratifies, nutrients stay
    below the thermocline, phytoplankton declines. If this ever comes back
    positive, something upstream has broken — it is a canary, not decoration.
    """
    resp = client.get("/api/analytics/correlation", params={"var1": "sst", "var2": "chlorophyll_a"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["pearson_r"] < 0
    assert body["n_months"] > 12
    assert len(body["points"]) == body["n_months"]
    assert body["notes"], "caveats must ship with the coefficient"


@requires_db
def test_sst_and_air_temperature_are_positively_correlated(client):
    # Sanity check in the opposite direction.
    body = client.get(
        "/api/analytics/correlation", params={"var1": "sst", "var2": "air_temp_max"}
    ).json()
    assert body["pearson_r"] > 0.5
    assert body["significant"] is True


@requires_db
def test_correlation_rejects_unknown_and_duplicate_variables(client):
    assert client.get(
        "/api/analytics/correlation", params={"var1": "sst", "var2": "salinity"}
    ).status_code == 422
    assert client.get(
        "/api/analytics/correlation", params={"var1": "sst", "var2": "sst"}
    ).status_code == 422
