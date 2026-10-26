import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import HTTPException

from lib.db import db


def new_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt):
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def validate_url(raw: str, allow_empty: bool = True) -> str:
    url = (raw or "").strip()
    if not url:
        if allow_empty:
            return ""
        raise HTTPException(status_code=422, detail="Informe uma URL.")
    if "://" not in url:
        url = "https://" + url
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc or "." not in p.netloc or " " in url:
        raise HTTPException(status_code=422, detail="URL inválida. Use um endereço começando com https://")
    return url


async def get_settings() -> dict:
    doc = await db.settings.find_one({"_id": "global"})
    base = (doc or {}).get("public_base_url") or os.environ.get("PUBLIC_BASE_URL", "")
    return {
        "public_base_url": base.rstrip("/"),
        "production_confirmed": bool((doc or {}).get("production_confirmed", False)),
        "updated_at": aware((doc or {}).get("updated_at")),
    }


async def audit(actor: dict, action: str, target: str, detail: str = "") -> None:
    await db.admin_actions.insert_one({
        "id": new_id(), "actor_id": actor["id"], "actor_email": actor["email"],
        "action": action, "target": target, "detail": detail, "at": now_utc(),
    })
