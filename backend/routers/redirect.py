"""Public, login-free dynamic QR redirect. Exposes nothing but the redirect itself."""
import logging
import re

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from lib.common import new_id, now_utc
from lib.db import db

router = APIRouter()
log = logging.getLogger("redirect")
_CODE = re.compile(r"^[A-Za-z0-9]{6,32}$")


@router.get("/r/{code}")
async def resolve(code: str, request: Request):
    if not _CODE.match(code):
        return RedirectResponse("/q/indisponivel?motivo=nao-encontrado", status_code=302)
    p = await db.plaques.find_one({"code": code}, {"_id": 0, "id": 1, "owner_id": 1, "destination_url": 1,
                                                    "disabled": 1, "number": 1})
    if not p:
        return RedirectResponse("/q/indisponivel?motivo=nao-encontrado", status_code=302)
    if p.get("disabled"):
        return RedirectResponse("/q/indisponivel?motivo=desativado", status_code=302)
    dest = p.get("destination_url") or ""
    if not dest.startswith(("http://", "https://")):
        return RedirectResponse(f"/q/indisponivel?motivo=nao-configurado&n={p['number']}", status_code=302)
    # Counting policy: every GET resolution is one "leitura registrada" (not unique visitors).
    try:
        await db.scans.insert_one({"id": new_id(), "plaque_id": p["id"], "owner_id": p["owner_id"], "at": now_utc(),
                                   "ua": (request.headers.get("user-agent") or "")[:200]})
        await db.plaques.update_one({"id": p["id"]}, {"$inc": {"scan_count": 1}})
    except Exception:
        log.exception("scan logging failed for %s", code)  # never block the redirect on analytics
    return RedirectResponse(dest, status_code=302, headers={"Cache-Control": "no-store"})
