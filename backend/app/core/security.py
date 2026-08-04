"""Verifies Supabase-issued JWTs and loads/creates the matching `profiles`
row. Supabase signs access tokens either asymmetrically (ES256/RS256, key
published at SUPABASE_URL/auth/v1/.well-known/jwks.json — current default
for new projects) or with a shared HS256 secret (older projects,
SUPABASE_JWT_SECRET from Dashboard -> Project Settings -> API -> JWT
Settings). Both paths are supported here since either can be true depending
on when the project was created; JWKS is tried first.

The read API stays open (per flow.md Phase 2), but every route still gets a
best-effort identity via `optional_user` so `agent_conversations.user_id`
can be set when a caller happens to be logged in. `/api/admin/*` requires
`require_admin`.
"""
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Profile
from app.db.session import SessionLocal

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def _jwks_client() -> "jwt.PyJWKClient | None":
    settings = get_settings()
    if not settings.supabase_url:
        return None
    return jwt.PyJWKClient(f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json")


def decode_token(token: str) -> dict:
    settings = get_settings()
    last_error: Exception | None = None

    client = _jwks_client()
    if client is not None:
        try:
            signing_key = client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token, signing_key.key, algorithms=["ES256", "RS256"], audience="authenticated"
            )
        except Exception as e:  # noqa: BLE001 — fall through to HS256 attempt
            last_error = e

    jwt_secret = getattr(settings, "supabase_jwt_secret", "")
    if jwt_secret:
        try:
            return jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
        except Exception as e:  # noqa: BLE001
            last_error = e

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {last_error}")


def _get_or_create_profile(db: Session, claims: dict) -> Profile:
    user_id = claims["sub"]
    profile = db.get(Profile, user_id)
    if profile is None:
        profile = Profile(user_id=user_id, email=claims.get("email"))
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Profile | None:
    # Deliberately does NOT depend on get_db: with no bearer token present
    # (the common case for the open read API), this must resolve to
    # "anonymous" without ever touching the database.
    if credentials is None:
        return None
    try:
        claims = decode_token(credentials.credentials)
    except HTTPException:
        return None
    if SessionLocal is None:
        return None
    db: Session = SessionLocal()
    try:
        return _get_or_create_profile(db, claims)
    finally:
        db.close()


def current_user(profile: Profile | None = Depends(optional_user)) -> Profile:
    if profile is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "authentication required")
    return profile


def require_admin(profile: Profile = Depends(current_user)) -> Profile:
    if profile.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin role required")
    return profile
