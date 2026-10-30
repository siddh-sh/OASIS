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

import openai
from langchain_core.runnables import Runnable
from langchain_openai import ChatOpenAI

from app.core.config import get_settings


class LLMNotConfigured(RuntimeError):
    """Raised when no LLM key is set, so callers can return 503 not 500."""


# Errors that mean "this model can't answer right now" rather than "the
# request is wrong": free-tier rate limits (per minute or per day), and a
# model the provider has retired (what broke the chatbot once already).
_FALLBACK_ON = (openai.RateLimitError, openai.NotFoundError)


def _chat_model(model: str, temperature: float) -> ChatOpenAI:
    settings = get_settings()
    if not settings.llm_api_key:
        raise LLMNotConfigured(
            "LLM_API_KEY is not set — copy .env.example to .env and add a key "
            "from any OpenAI-compatible provider (console.groq.com is free)."
        )
    return ChatOpenAI(
        model=model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=temperature,
        timeout=45,
        # The fallback model handles rate limits; retrying the exhausted
        # model first would only delay the answer.
        max_retries=1,
        reasoning_effort=settings.llm_reasoning_effort or None,
    )


def _with_fallback(primary: Runnable, build_fallback) -> Runnable:
    fallback_model = get_settings().llm_fallback_model
    if not fallback_model or fallback_model == get_settings().llm_model:
        return primary
    return primary.with_fallbacks([build_fallback(fallback_model)], exceptions_to_handle=_FALLBACK_ON)


@lru_cache
def get_llm(temperature: float = 0.0) -> Runnable:
    """The configured model, falling back to LLM_FALLBACK_MODEL when it is
    rate-limited or retired."""
    model = get_settings().llm_model
    return _with_fallback(_chat_model(model, temperature), lambda m: _chat_model(m, temperature))


def get_llm_with_tools(tools: list, temperature: float = 0.0) -> Runnable:
    """As get_llm, with tools bound to each model before the fallback is
    attached (a fallback wrapper itself has no bind_tools)."""
    model = get_settings().llm_model
    return _with_fallback(
        _chat_model(model, temperature).bind_tools(tools),
        lambda m: _chat_model(m, temperature).bind_tools(tools),
    )


def llm_available() -> bool:
    return bool(get_settings().llm_api_key)


# The UI's languages (frontend/src/i18n/index.ts SUPPORTED_LANGUAGES). Model-
# written text — chat answers, recommendations, species explanations — is
# generated in the reader's language rather than translated afterwards, so
# the model sees the numbers and phrases them directly.
LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "mr": "Marathi (मराठी)",
    "ml": "Malayalam (മലയാളം)",
    "gu": "Gujarati (ગુજરાતી)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
    "or": "Odia (ଓଡ଼ିଆ)",
    "bn": "Bengali (বাংলা)",
}
LANGUAGE_PATTERN = "^(" + "|".join(LANGUAGE_NAMES) + ")$"


def language_instruction(language: str | None) -> str:
    """System-prompt suffix asking for an answer in `language`; empty for
    English. Scientific names, numbers and units are pinned so a translation
    can never alter a figure or a species identity."""
    if not language or language == "en" or language not in LANGUAGE_NAMES:
        return ""
    return (
        f"\n\nWrite your entire answer in {LANGUAGE_NAMES[language]}. Keep scientific "
        "(Latin) species names, all numbers, units, dates and identifiers exactly as "
        "given — do not translate or convert them."
    )
