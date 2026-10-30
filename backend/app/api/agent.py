"""NL Chatbot + agent pipeline entry points (flow.md Phase 5).

The coordinator is a LangGraph ReAct loop over a fixed, typed tool surface
(`app/agents/tools.py`) — the model never emits SQL. See `app/agents/graph.py`
for the hop cap and the rest of the guardrails.

`/report` remains 501: session export is Phase 6.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.llm import LANGUAGE_PATTERN, LLMNotConfigured, llm_available
from app.agents.nl_chatbot_coordinator import chat as run_chat
from app.agents.nl_chatbot_coordinator import get_conversation as load_conversation
from app.core.security import optional_user
from app.db.models import Profile
from app.db.session import get_db

router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatRequest(BaseModel):
    conversation_id: int | None = None
    message: str = Field(min_length=1, max_length=2000)
    # The UI language; the answer is written in it (see llm.language_instruction).
    language: str = Field(default="en", pattern=LANGUAGE_PATTERN)


class ChatMessage(BaseModel):
    role: str
    content: str
    # Which tools actually ran. Surfaced so a reader can audit where the
    # numbers came from instead of trusting a paragraph. Named `sources` to
    # match the contract the frontend was built against in Phase 3, which
    # already renders these through its SourceCitation component.
    sources: list[str] = []
    # Set when the pipeline failed and `content` is the canned English
    # fallback, so the UI can show that message in the reader's language.
    fallback_code: str | None = None


class ChatResponse(BaseModel):
    conversation_id: int
    message: ChatMessage


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    profile: Profile | None = Depends(optional_user),
):
    """Ask a question in natural language.

    503 rather than 500 when no LLM key is configured: that is a deployment
    gap, not a bug, and the UI shows a different message for it.
    """
    if not llm_available():
        raise HTTPException(
            503,
            "No LLM configured. Set LLM_API_KEY in .env — any OpenAI-compatible "
            "provider works (console.groq.com is free).",
        )
    try:
        result = run_chat(
            db,
            message=body.message,
            conversation_id=body.conversation_id,
            user_id=profile.user_id if profile else None,
            language=body.language,
        )
    except LLMNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ChatResponse(
        conversation_id=result["conversation_id"],
        message=ChatMessage(
            role="assistant",
            content=result["answer"],
            sources=result["tools_used"],
            fallback_code=result.get("fallback_code"),
        ),
    )


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    payload = load_conversation(db, conversation_id)
    if payload is None:
        raise HTTPException(404, f"no conversation with id={conversation_id}")
    return payload


@router.post("/report")
def session_report(conversation_id: int):
    raise HTTPException(501, "downloadable session report not implemented yet (Phase 6)")
