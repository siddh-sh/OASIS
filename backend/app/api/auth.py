"""Thin proxies to Supabase Auth's own REST API — no hand-rolled password
hashing here, Supabase already owns that (flow.md Phase 2)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import current_user
from app.db.models import Profile
from app.db.session import get_db
from app.schemas.auth import AuthTokenResponse, LoginRequest, ProfileOut, SignupRequest

_bearer = HTTPBearer()

router = APIRouter(prefix="/auth", tags=["auth"])


def _supabase_headers() -> dict:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(500, "SUPABASE_URL / SUPABASE_ANON_KEY not configured")
    return {"apikey": settings.supabase_anon_key, "Content-Type": "application/json"}


async def _supabase_post(path: str, json: dict, headers: dict | None = None) -> dict:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=json, headers=headers or _supabase_headers())
    if resp.status_code >= 400:
        detail = resp.json().get("msg") or resp.json().get("error_description") or resp.text
        raise HTTPException(resp.status_code, detail)
    return resp.json()


@router.post("/signup", response_model=AuthTokenResponse)
async def signup(body: SignupRequest, db: Session = Depends(get_db)):
    data = await _supabase_post(
        "signup",
        {
            "email": body.email,
            "password": body.password,
            "data": {"full_name": body.full_name, "institution": body.institution},
        },
    )
    user = data.get("user") or {}
    user_id = user.get("id")
    if user_id and db.get(Profile, user_id) is None:
        db.add(
            Profile(
                user_id=user_id,
                email=body.email,
                full_name=body.full_name,
                institution=body.institution,
            )
        )
        db.commit()

    if not data.get("access_token"):
        # Email-confirmation-required projects return a user with no
        # session yet — that's a valid state, not an error.
        return AuthTokenResponse(access_token="", token_type="bearer")
    return AuthTokenResponse(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_in=data.get("expires_in"),
    )


@router.post("/login", response_model=AuthTokenResponse)
async def login(body: LoginRequest):
    data = await _supabase_post(
        "token?grant_type=password", {"email": body.email, "password": body.password}
    )
    return AuthTokenResponse(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_in=data.get("expires_in"),
    )


@router.post("/logout", status_code=204)
async def logout(
    profile: Profile = Depends(current_user),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/logout"
    headers = _supabase_headers() | {"Authorization": f"Bearer {credentials.credentials}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, headers=headers)
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, "logout failed upstream")


@router.get("/me", response_model=ProfileOut)
async def me(profile: Profile = Depends(current_user)):
    return ProfileOut.model_validate(profile)
