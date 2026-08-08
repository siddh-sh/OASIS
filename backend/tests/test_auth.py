"""Signup -> login -> authenticated request -> logout, against the real
Supabase Auth REST API (never mocked — see conftest.requires_supabase_auth).

Uses a throwaway address unique per run so re-running doesn't collide with
"user already exists".

Two environment conditions, neither of them application defects, can stop
this test from reaching the app at all. Both are detected and skipped with
an actionable message rather than reported as failures:

1. **Email domain validation.** Supabase rejects addresses whose domain it
   considers undeliverable, with `email_address_invalid`. `@example.com`
   and invented domains like `@oasis-test.dev` are both refused, so the
   conventional test domains are unusable here. Override the default with
   `OASIS_TEST_EMAIL_DOMAIN` if this project's validator disagrees with the
   one below.
2. **Email send rate limit.** If Authentication -> Providers -> Email ->
   "Confirm email" is ON, every signup sends a real message and the free
   tier's quota (a handful per hour) is exhausted almost immediately,
   returning 429 *before* validation even runs.

Turning "Confirm email" OFF in the dashboard resolves both symptoms and is
what lets this test exercise the full flow: with confirmation off, signup
returns an access token straight away instead of withholding one until a
link is clicked, so login/me/logout can all be asserted.
"""
import os
import uuid

import pytest

from tests.conftest import requires_supabase_auth

# A real, deliverable domain — Supabase refuses invented ones. Override via
# env if this project's validator rejects it.
TEST_EMAIL_DOMAIN = os.getenv("OASIS_TEST_EMAIL_DOMAIN", "gmail.com")


def _skip_on_environment_limits(resp):
    """Skip (don't fail) on Supabase-side conditions the app can't control."""
    if resp.status_code == 429:
        pytest.skip(
            "Supabase email send rate limit hit (free tier). Turn off "
            'Authentication -> Providers -> Email -> "Confirm email" so '
            "signups stop sending mail, or retry in an hour."
        )
    if resp.status_code == 400 and "invalid" in resp.text.lower():
        pytest.skip(
            f"Supabase rejected the test address domain "
            f"({TEST_EMAIL_DOMAIN!r}) as undeliverable: {resp.text[:120]}. "
            "Set OASIS_TEST_EMAIL_DOMAIN to a domain this project accepts."
        )


@requires_supabase_auth
def test_signup_login_me_logout(client):
    email = f"oasis-test-{uuid.uuid4().hex[:12]}@{TEST_EMAIL_DOMAIN}"
    password = "Test-Password-123!"

    signup_resp = client.post(
        "/auth/signup",
        json={"email": email, "password": password, "full_name": "Test User"},
    )
    _skip_on_environment_limits(signup_resp)
    assert signup_resp.status_code == 200, signup_resp.text
    token = signup_resp.json()["access_token"]
    if not token:
        # Email confirmation required — can't proceed to login/me/logout
        # without clicking a real email link, so the flow stops here.
        return

    me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email
    assert me_resp.json()["role"] == "researcher"

    login_resp = client.post("/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    login_token = login_resp.json()["access_token"]

    logout_resp = client.post("/auth/logout", headers={"Authorization": f"Bearer {login_token}"})
    assert logout_resp.status_code == 204


@requires_supabase_auth
def test_login_wrong_password_rejected(client):
    resp = client.post(
        "/auth/login",
        json={
            "email": f"nonexistent-{uuid.uuid4().hex}@{TEST_EMAIL_DOMAIN}",
            "password": "wrong",
        },
    )
    assert resp.status_code >= 400


def test_me_without_token_rejected(client):
    resp = client.get("/auth/me")
    assert resp.status_code in (401, 403)
