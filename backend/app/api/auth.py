"""Thin proxies to Supabase Auth's own REST API — no hand-rolled password
hashing here, Supabase already owns that (flow.md Phase 2)."""
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import current_user
from app.db.models import Profile
from app.db.session import get_db
from app.schemas.auth import (
    AuthTokenResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ProfileOut,
    ResetPasswordRequest,
    SignupRequest,
)

_bearer = HTTPBearer()

router = APIRouter(prefix="/auth", tags=["auth"])


def _supabase_headers() -> dict:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(500, "SUPABASE_URL / SUPABASE_ANON_KEY not configured")
    return {"apikey": settings.supabase_anon_key, "Content-Type": "application/json"}


async def _supabase_post(
    path: str, json: dict, headers: dict | None = None, method: str = "POST", params: dict | None = None
) -> dict:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(
            method, url, json=json, params=params, headers=headers or _supabase_headers()
        )
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


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest):
    params = None
    if body.redirect_to:
        # Only ever send the reset link back to one of our own frontends —
        # otherwise this endpoint could mail a recovery token to any URL a
        # caller names. Supabase's redirect allow-list is a second check.
        origin = "{0.scheme}://{0.netloc}".format(urlparse(body.redirect_to))
        if origin not in get_settings().cors_origin_list:
            raise HTTPException(400, "redirect_to is not an allowed origin")
        params = {"redirect_to": body.redirect_to}

    try:
        await _supabase_post("recover", {"email": body.email}, params=params)
    except HTTPException as exc:
        # Surface rate limiting (the user should wait), but swallow
        # everything else so the response never reveals whether an
        # account exists for this address.
        if exc.status_code == 429:
            # Supabase's built-in mailer allows only a couple of emails per
            # hour per project; a custom SMTP provider lifts that.
            raise HTTPException(
                429,
                "Too many password reset emails have been sent recently. "
                "Please wait a while (up to an hour) and try again.",
            ) from exc
    return MessageResponse(
        message="If an account exists for that email, a password reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest):
    # The recovery token from the emailed link is a session token scoped to
    # this user, so updating "the current user" is all a reset needs.
    headers = _supabase_headers() | {"Authorization": f"Bearer {body.access_token}"}
    try:
        await _supabase_post("user", {"password": body.password}, headers=headers, method="PUT")
    except HTTPException as exc:
        if exc.status_code in (401, 403):
            raise HTTPException(
                401, "This reset link is invalid or has expired. Request a new one from the login page."
            ) from exc
        raise
    return MessageResponse(message="Password updated. You can now log in with your new password.")


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
