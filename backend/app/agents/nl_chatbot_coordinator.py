"""NL Chatbot Coordinator — agent 6 in flow.md's pipeline diagram.

Owns a conversation: replays stored history into the graph, runs a turn,
persists both sides, and reports which tools were used so the UI can show
provenance rather than asking the user to trust a paragraph.

Conversation state lives in Postgres (`agent_conversations` /
`agent_messages`), not in process memory, so the free-tier backend can cold
start between turns without losing the thread.
"""
from __future__ import annotations

import logging

from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.graph import build_graph, used_tools
from app.db.models import AgentConversation, AgentMessage

# Enough turns for a follow-up question without letting an old thread grow
# until it blows the model's context window mid-demo.
HISTORY_LIMIT = 12

logger = logging.getLogger(__name__)


def _load_history(db: Session, conversation_id: int) -> list:
    rows = db.scalars(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at.desc(), AgentMessage.id.desc())
        .limit(HISTORY_LIMIT)
    ).all()
    messages = []
    for row in reversed(rows):
        if row.role == "user":
            messages.append(HumanMessage(content=row.content))
        elif row.role == "assistant":
            messages.append(AIMessage(content=row.content))
    return messages


def graph_invoke(db: Session, messages: list, language: str = "en") -> dict:
    return build_graph(db, language).invoke({"messages": messages, "hops": 0})


def fallback_code(exc: Exception) -> str:
    """Why the pipeline failed, as a stable code the UI can render in the
    reader's language (the English sentence below is what gets stored)."""
    detail = str(exc)
    if "tool_use_failed" in detail or "Failed to call a function" in detail:
        return "malformed_tool_call"
    if "rate" in detail.lower() and "limit" in detail.lower():
        return "rate_limit"
    return "pipeline_failed"


def _fallback_answer(message: str, exc: Exception) -> str:
    code = fallback_code(exc)
    if code == "malformed_tool_call":
        reason = (
            "I couldn't complete that lookup — the model produced a malformed "
            "tool call, which happens occasionally with the free-tier model."
        )
    elif code == "rate_limit":
        reason = "The LLM provider's free-tier rate limit was hit."
    elif "model_not_found" in detail:
        reason = (
            "The configured LLM model is unavailable at the provider — "
            "LLM_MODEL in .env needs updating."
        )
    else:
        reason = "The agent pipeline failed on that question."
    return (
        f"{reason} Try rephrasing, or ask about one thing at a time — for "
        "example \"what is the catch history for the Indian oil sardine?\" or "
        "\"list critical SST anomalies\". No figures are shown above because "
        "no tool returned data; I won't guess at numbers."
    )


def chat(
    db: Session,
    message: str,
    conversation_id: int | None = None,
    user_id: str | None = None,
    language: str = "en",
) -> dict:
    if conversation_id is None:
        conversation = AgentConversation(user_id=user_id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        conversation_id = int(conversation.id)
    elif db.get(AgentConversation, conversation_id) is None:
        raise ValueError(f"no conversation with id={conversation_id}")

    history = _load_history(db, conversation_id)
    turn = [*history, HumanMessage(content=message)]

    try:
        result = graph_invoke(db, turn, language)
        messages = result["messages"]
        answer = messages[-1].content if messages else ""
        tools = used_tools(messages)
        failure = None
    except Exception as exc:  # noqa: BLE001
        # Smaller models occasionally emit malformed tool-call syntax, which
        # the provider rejects with a 400 before any tool runs. That must not
        # surface as a 500 during a live demo, and retrying the identical
        # prompt usually reproduces it — so fall back to a plain,
        # tool-free answer that is explicit about its own limits.
        # flow.md §15: "cap agent hop count, add per-agent timeouts with
        # graceful fallback text".
        logger.exception("agent pipeline failed for conversation %s", conversation_id)
        answer = _fallback_answer(message, exc)
        tools = []
        failure = fallback_code(exc)

    db.add(AgentMessage(conversation_id=conversation_id, role="user", content=message))
    db.add(
        AgentMessage(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            # Stored so a later reader can audit which numbers the answer
            # was built from, not just what it said.
            tool_calls={"tools_used": tools} if tools else None,
        )
    )
    db.commit()

    return {
        "conversation_id": conversation_id,
        "answer": answer,
        "tools_used": tools,
        "fallback_code": failure,
    }


def get_conversation(db: Session, conversation_id: int) -> dict | None:
    conversation = db.get(AgentConversation, conversation_id)
    if conversation is None:
        return None
    rows = db.scalars(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at, AgentMessage.id)
    ).all()
    return {
        "conversation_id": conversation_id,
        "created_at": conversation.created_at,
        "messages": [
            {
                "role": r.role,
                "content": r.content,
                "tools_used": (r.tool_calls or {}).get("tools_used", []),
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }
