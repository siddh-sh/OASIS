from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    institution: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
