"""Phase-5 agent tests.

Split deliberately:

  * Tool tests hit the real database but never the LLM. Tools are where a
    wrong number would come from, and they are cheap and deterministic to
    check.
  * Coordinator tests use a stub LLM, so tool *selection* and conversation
    persistence are verified without spending free-tier quota or depending
    on a network round trip in CI.
  * Exactly one test talks to the real provider, and it skips when no key is
    configured.
"""
import pytest
from langchain_core.messages import AIMessage

from tests.conftest import requires_db

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


def _tools(db):
    from app.agents.tools import build_tools

    return {t.name: t for t in build_tools(db)}


@requires_db
def test_tools_return_real_grounded_numbers(db_session):
    tools = _tools(db_session)

    overview = tools["dataset_overview"].invoke({})
    assert overview["row_counts"]["species"] > 1000
    assert overview["row_counts"]["anomalies_detected"] > 0

    sst = tools["ocean_conditions_summary"].invoke({"variable": "sst"})
    # Indian Ocean SST. Outside this range means the tool is reading the
    # wrong column, not that the ocean changed.
    assert 15 < sst["mean"] < 35
    assert sst["unit"] == "degrees_C"


@requires_db
def test_species_tools_accept_a_name_not_just_an_id(db_session):
    # The reason this matters: llama-3.3 reliably mangles a chained
    # lookup-then-use call, emitting a nested tool call the provider rejects
    # outright. Accepting a name removes the failure mode entirely.
    tools = _tools(db_session)
    result = tools["catch_history"].invoke({"species_name": "Indian oil sardine"})
    assert result.get("years"), result
    assert result["years"][0]["tonnes"] > 0


@requires_db
def test_tools_reject_an_unknown_variable_rather_than_guessing(db_session):
    tools = _tools(db_session)
    assert "error" in tools["ocean_conditions_summary"].invoke({"variable": "salinity"})
    assert "error" in tools["forecast_ocean"].invoke({"station_id": 1, "variable": "salinity"})


@requires_db
def test_exact_names_resolve_lexically_not_by_embedding(db_session):
    # Embeddings are bad at exact identifiers: querying the vector store for
    # "Harpadon nehereus" does not return Harpadon nehereus. The lexical path
    # exists precisely for this, and it must win.
    tools = _tools(db_session)
    hits = tools["search_species"].invoke({"query": "Harpadon nehereus"})
    assert hits[0]["scientific_name"] == "Harpadon nehereus"
    assert hits[0]["match"] == "name"


@requires_db
def test_name_matching_ignores_punctuation(db_session):
    # Stored as "Bombay-duck"; nobody types the hyphen.
    tools = _tools(db_session)
    for query in ("Bombay duck", "Bombay-duck"):
        hits = tools["search_species"].invoke({"query": query})
        assert hits and hits[0]["scientific_name"] == "Harpadon nehereus", (query, hits[:2])


@requires_db
def test_semantic_search_handles_category_questions(db_session):
    # No species is literally called "prawns", so this can only come from
    # the vector store — the half of the hybrid that lexical can't do.
    tools = _tools(db_session)
    hits = tools["search_species"].invoke({"query": "prawns"})
    assert hits
    assert hits[0]["match"] == "semantic"
    assert any("Penaeus" in (h["scientific_name"] or "") for h in hits), hits


@requires_db
def test_chat_persists_the_conversation_without_calling_a_real_llm(db_session, monkeypatch):
    from app.agents import nl_chatbot_coordinator as coordinator

    def fake_invoke(db, messages):
        return {"messages": [AIMessage(content="There are 1482 species in the catalogue.")]}

    monkeypatch.setattr(coordinator, "graph_invoke", fake_invoke)

    first = coordinator.chat(db_session, "How many species?")
    assert first["answer"].startswith("There are 1482")

    second = coordinator.chat(db_session, "And how many stations?", conversation_id=first["conversation_id"])
    assert second["conversation_id"] == first["conversation_id"]

    stored = coordinator.get_conversation(db_session, first["conversation_id"])
    assert [m["role"] for m in stored["messages"]] == ["user", "assistant", "user", "assistant"]


@requires_db
def test_chat_degrades_gracefully_when_the_model_emits_a_bad_tool_call(db_session, monkeypatch):
    # Real failure seen against Groq: the model nested one tool call inside
    # another's arguments and the provider returned 400 tool_use_failed. That
    # must not become a 500 mid-demo.
    from app.agents import nl_chatbot_coordinator as coordinator

    def boom(db, messages):
        raise RuntimeError("Error code: 400 - tool_use_failed: Failed to call a function.")

    monkeypatch.setattr(coordinator, "graph_invoke", boom)

    result = coordinator.chat(db_session, "something that trips the model")
    assert result["tools_used"] == []
    assert "malformed tool call" in result["answer"]
    # Crucially, it must not invent figures when no tool ran.
    assert "won't guess at numbers" in result["answer"]


@requires_db
def test_chat_rejects_an_unknown_conversation_id(db_session, monkeypatch):
    from app.agents import nl_chatbot_coordinator as coordinator

    monkeypatch.setattr(coordinator, "graph_invoke", lambda db, m: {"messages": [AIMessage(content="hi")]})
    with pytest.raises(ValueError):
        coordinator.chat(db_session, "hello", conversation_id=999999999)


@requires_db
def test_rag_retrieval_returns_ranked_species_documents(db_session):
    """Vector search is used for category questions, not exact names.

    Note what is deliberately NOT asserted here: that a given name ranks
    first. It does not, reliably — a 384-dim general-purpose model cannot
    discriminate 1,482 near-identical taxonomic strings, which is why
    tools.search_species tries a lexical match before touching this. Pinning
    a top-1 name here would encode a precision the retriever does not have
    and would fail on an unrelated re-embed.
    """
    from app.agents.embeddings import retrieve

    hits = retrieve(db_session, "tuna and mackerel species", k=5)
    assert len(hits) == 5
    assert all(h["source_table"] == "species" for h in hits)
    # Ranked by similarity, descending.
    assert hits[0]["similarity"] >= hits[-1]["similarity"]
    assert 0.0 <= hits[-1]["similarity"] <= 1.0


@requires_db
def test_chat_endpoint_end_to_end_against_the_real_provider(client, db_session):
    """The only test that spends LLM quota. Skips without a key."""
    from sqlalchemy import func, select

    from app.agents.llm import llm_available
    from app.db.models import Species

    if not llm_available():
        pytest.skip("LLM_API_KEY not configured")

    resp = client.post("/api/agent/chat", json={"message": "How many species are in the catalogue?"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message"]["role"] == "assistant"
    # Read from the database rather than hardcoded: the catalogue grows
    # whenever a new source contributes species.
    expected = db_session.scalar(select(func.count()).select_from(Species))
    assert str(expected) in body["message"]["content"].replace(",", "")
    assert body["message"]["sources"], "the answer should cite the tool it used"
