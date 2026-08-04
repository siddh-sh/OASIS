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
    anthropic_api_key: str = ""

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
