"""Application settings, read from the repo-root .env (see .env.example)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = ""
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    # Optional: only needed if the Supabase project still signs JWTs with a
    # shared HS256 secret rather than the newer JWKS/ES256 default. See
    # Dashboard -> Project Settings -> API -> JWT Settings.
    supabase_jwt_secret: str = ""

    # LLM for the Phase-5 agent pipeline. Deliberately provider-agnostic
    # rather than an ANTHROPIC_API_KEY: the project runs on free tiers, and
    # Groq, Cerebras and OpenRouter are all OpenAI-API-compatible, so
    # switching provider is a base_url + model change and nothing else.
    # Keeping a second provider configurable is demo insurance — a
    # rate-limited provider mid-evaluation is exactly the failure flow.md
    # §15 asks us to plan for.
    llm_provider: str = "groq"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"

    # CORS: local Vite dev origin always allowed; add the deployed Vercel
    # origin via this env var once known (comma-separated).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    environment: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
