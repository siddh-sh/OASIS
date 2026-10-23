import re
from datetime import datetime

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

# Mirrors frontend/src/auth/passwordPolicy.ts — the frontend checklist is
# for the user's benefit, this is the copy that actually enforces it.
# 72 is bcrypt's input limit, which is what Supabase hashes with; anything
# past it would be silently ignored rather than rejected.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72
_PASSWORD_RULES = [
    (lambda p: len(p) >= PASSWORD_MIN_LENGTH, f"at least {PASSWORD_MIN_LENGTH} characters"),
    (lambda p: len(p) <= PASSWORD_MAX_LENGTH, f"at most {PASSWORD_MAX_LENGTH} characters"),
    (lambda p: re.search(r"[A-Z]", p), "an uppercase letter"),
    (lambda p: re.search(r"[a-z]", p), "a lowercase letter"),
    (lambda p: re.search(r"[0-9]", p), "a number"),
    (lambda p: re.search(r"[^A-Za-z0-9\s]", p), "a special character"),
    (lambda p: not re.search(r"\s", p), "no spaces"),
]


def validate_password_strength(password: str) -> str:
    missing = [label for check, label in _PASSWORD_RULES if not check(password)]
    if missing:
        raise ValueError("Password must have " + ", ".join(missing))
    return password


# Mirrors frontend/src/auth/emailPolicy.ts's suggestion list.
_SUGGESTION_TARGETS = [
    "gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "icloud.com", "rediffmail.com",
]
_KNOWN_DOMAINS = {
    *_SUGGESTION_TARGETS, "googlemail.com", "mail.com", "yahoo.in", "yahoo.co.uk", "ymail.com",
    "outlook.in", "hotmail.co.uk", "live.com", "live.in", "me.com", "protonmail.com", "proton.me",
}


def _edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, row[0] = row[0], i
        for j in range(1, len(b) + 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
    return row[len(b)]


def validate_real_email(email: str) -> str:
    """Reject addresses an email can't actually reach: near-miss typos of
    major providers (gmial.com) and domains with no mail server at all.
    A mistyped address on signup or reset fails silently otherwise — the
    email just never arrives."""
    email = email.strip().lower()
    local, _, domain = email.partition("@")
    if domain not in _KNOWN_DOMAINS:
        for candidate in _SUGGESTION_TARGETS:
            if _edit_distance(domain, candidate) <= (2 if len(candidate) >= 9 else 1):
                raise ValueError(f"That domain looks mistyped. Did you mean {local}@{candidate}?")
        try:
            # DNS MX/A lookup; a timeout is treated as deliverable by the
            # library, so a flaky resolver never locks anyone out.
            validate_email(email, check_deliverability=True)
        except EmailNotValidError as exc:
            raise ValueError(f"This email address can't receive mail: {exc}") from exc
    return email


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    institution: str | None = None

    _check_email = field_validator("email")(validate_real_email)
    _check_password = field_validator("password")(validate_password_strength)


class LoginRequest(BaseModel):
    # No strength check here: accounts created before the policy existed
    # must still be able to log in (and then reset to a compliant password).
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # Where the emailed link should land — the frontend's /reset-password
    # page. Must be one of our own origins; see api/auth.py.
    redirect_to: str | None = None

    _check_email = field_validator("email")(validate_real_email)


class ResetPasswordRequest(BaseModel):
    # The short-lived recovery token Supabase puts in the emailed link's
    # URL fragment, not a normal session token.
    access_token: str
    password: str

    _check_password = field_validator("password")(validate_password_strength)


class MessageResponse(BaseModel):
    message: str


class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str | None
    full_name: str | None
    role: str
    institution: str | None
    created_at: datetime
