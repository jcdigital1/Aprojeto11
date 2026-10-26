"""Pydantic models. Every model here has a hand-written TS twin in frontend/src/lib/types.ts."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

UserStatus = Literal["pending", "approved", "blocked"]


# ---------- auth ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Literal["admin", "customer"]
    status: UserStatus
    created_at: datetime
    approved_at: Optional[datetime] = None


class MessageOut(BaseModel):
    message: str


# ---------- templates ----------
class Region(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(ge=0, le=1)
    h: float = Field(ge=0, le=1)


class Calibration(BaseModel):
    qrX: float = Field(ge=0, le=1)
    qrY: float = Field(ge=0, le=1)
    qrWidth: float = Field(gt=0, le=1)
    qrHeight: float = Field(gt=0, le=1)
    quietZone: float = Field(ge=0, le=0.25)  # fraction of QR box reserved as white margin
    cleanupRegion: Region
    numberX: float = Field(ge=0, le=1)
    numberY: float = Field(ge=0, le=1)
    numberFontSize: float = Field(gt=0, le=0.1)  # fraction of plaque width
    numberColor: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    numberAlignment: Literal["left", "center", "right"]


class TemplateOut(BaseModel):
    id: str
    name: str
    original_url: str
    clean_url: str
    version: int
    production_ready: bool
    calibration: Calibration
    updated_at: datetime


class ProductionIn(BaseModel):
    production_ready: bool


# ---------- batches / plaques ----------
class RenderSnapshot(BaseModel):
    template_id: str
    template_version: int
    clean_url: str
    calibration: Calibration


class BatchCreate(BaseModel):
    template_id: str
    quantity: int = Field(ge=1, le=200)
    name: Optional[str] = Field(default=None, max_length=80)
    idempotency_key: str = Field(min_length=8, max_length=64)


class BatchOut(BaseModel):
    id: str
    owner_id: str
    name: str
    template_id: str
    template_name: str
    template_version: int
    render: RenderSnapshot
    quantity: int
    number_start: int
    number_end: int
    status: Literal["creating", "ready", "failed"]
    test_mode: bool
    created_at: datetime


class PlaqueOut(BaseModel):
    id: str
    code: str
    number: int
    batch_id: str
    batch_name: str
    template_id: str
    qr_url: str
    destination_url: str
    disabled: bool
    scan_count: int
    test_mode: bool
    render: RenderSnapshot
    created_at: datetime
    updated_at: datetime


class PlaquePage(BaseModel):
    items: list[PlaqueOut]
    total: int
    page: int
    page_size: int


class DestinationIn(BaseModel):
    destination_url: str = Field(max_length=2048)


# ---------- stats / admin ----------
class MyStats(BaseModel):
    batches: int
    plaques: int
    configured: int
    scans: int


class AdminStats(BaseModel):
    pending: int
    approved: int
    blocked: int
    batches: int
    plaques: int
    qr_issued: int
    scans: int


class PasswordResetRequestOut(BaseModel):
    id: str
    user_id: str
    email: str
    name: str
    created_at: datetime
    link_generated: bool


class ResetLinkOut(BaseModel):
    link: str
    expires_at: datetime


class SettingsOut(BaseModel):
    public_base_url: str
    production_confirmed: bool
    updated_at: Optional[datetime] = None


class SettingsIn(BaseModel):
    public_base_url: str = Field(min_length=8, max_length=200)
    production_confirmed: bool


class AdminPlaqueOut(BaseModel):
    id: str
    code: str
    number: int
    owner_email: str
    batch_name: str
    destination_url: str
    disabled: bool
    scan_count: int
