"""LLM client factory — provider-agnostic by construction.

flow.md specified Claude, but this project runs on free tiers. Groq,
Cerebras and OpenRouter all expose the OpenAI chat-completions API, so the
whole agent layer talks to `ChatOpenAI` and the provider is three settings
(`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) rather than a code change. If
Groq rate-limits during a demo, switching to Cerebras is an .env edit.

Verified against Groq's `openai/gpt-oss-120b` (llama-3.3-70b-versatile was
retired from Groq): chat completions return in about a
second, and — critically — native tool calling works, which is what the
coordinator depends on.
"""
from __future__ import annotations

from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.core.config import get_settings


class LLMNotConfigured(RuntimeError):
    """Raised when no LLM key is set, so callers can return 503 not 500."""


@lru_cache
def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    settings = get_settings()
    if not settings.llm_api_key:
        raise LLMNotConfigured(
            "LLM_API_KEY is not set — copy .env.example to .env and add a key "
            "from any OpenAI-compatible provider (console.groq.com is free)."
        )
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=temperature,
        timeout=45,
        max_retries=2,
    )


def llm_available() -> bool:
    return bool(get_settings().llm_api_key)
