"""NL Chatbot + agent pipeline entry points. Stubbed with 501 in Phase 1;
real implementation (LangGraph pipeline, pgvector RAG, tool-constrained
query templates) lands in Phase 5, per flow.md §5/§10."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatRequest(BaseModel):
    conversation_id: int | None = None
    message: str


@router.post("/chat")
def chat(body: ChatRequest):
    raise HTTPException(501, "NL chatbot not implemented yet (Phase 5)")


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int):
    raise HTTPException(501, "conversation retrieval not implemented yet (Phase 5)")


@router.post("/report")
def session_report(conversation_id: int):
    raise HTTPException(501, "downloadable session report not implemented yet (Phase 6)")
