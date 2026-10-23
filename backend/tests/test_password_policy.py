"""Password strength rules on signup/reset — pure schema validation, no
network. Mirrors frontend/src/auth/passwordPolicy.test.ts."""
import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest, ResetPasswordRequest, SignupRequest


def test_strong_password_accepted():
    assert SignupRequest(email="a@gmail.com", password="Ocean-Tide42").password == "Ocean-Tide42"


@pytest.mark.parametrize(
    "password, missing",
    [
        ("Sh0rt!", "at least 8 characters"),
        ("lowercase-only1", "an uppercase letter"),
        ("UPPERCASE-ONLY1", "a lowercase letter"),
        ("No-Digits-Here", "a number"),
        ("NoSpecial123", "a special character"),
        ("Has Space-123", "no spaces"),
        ("Aa1!" + "x" * 69, "at most 72 characters"),
    ],
)
def test_weak_password_rejected(password, missing):
    for model, extra in ((SignupRequest, {"email": "a@gmail.com"}), (ResetPasswordRequest, {"access_token": "t"})):
        with pytest.raises(ValidationError, match=missing):
            model(password=password, **extra)


def test_login_does_not_enforce_policy():
    # Pre-policy accounts must still be able to sign in.
    assert LoginRequest(email="a@gmail.com", password="weak").password == "weak"


def test_forgot_password_rejects_foreign_redirect(client):
    resp = client.post(
        "/auth/forgot-password",
        json={"email": "a@gmail.com", "redirect_to": "https://evil.example/steal"},
    )
    assert resp.status_code == 400


@pytest.mark.parametrize("email", ["a@gmial.com", "a@gmail.con", "a@gamil.com", "a@hotmial.com"])
def test_mistyped_provider_rejected(email):
    with pytest.raises(ValidationError, match="Did you mean"):
        SignupRequest(email=email, password="Ocean-Tide42")


def test_email_normalized_and_known_domain_skips_dns():
    assert SignupRequest(email="Siddh@Gmail.com", password="Ocean-Tide42").email == "siddh@gmail.com"
