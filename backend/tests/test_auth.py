"""Signup -> login -> authenticated request -> logout, against the real
Supabase Auth REST API (never mocked — see conftest.requires_supabase_auth).

Uses a throwaway @example.com address unique per run so re-running doesn't
collide with "user already exists". Requires the target Supabase project to
allow unconfirmed-email sign-in (default for a fresh dev project) — if
email confirmation is enforced, the signup assertion below is relaxed to
just check the call succeeded, since no access_token is issued until the
user clicks the confirmation link.
"""
import uuid

from tests.conftest import requires_supabase_auth


@requires_supabase_auth
def test_signup_login_me_logout(client):
    email = f"oasis-test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test-Password-123!"

    signup_resp = client.post(
        "/auth/signup",
        json={"email": email, "password": password, "full_name": "Test User"},
    )
    assert signup_resp.status_code == 200
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
        json={"email": f"nonexistent-{uuid.uuid4().hex}@example.com", "password": "wrong"},
    )
    assert resp.status_code >= 400


def test_me_without_token_rejected(client):
    resp = client.get("/auth/me")
    assert resp.status_code in (401, 403)
