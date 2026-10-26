import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument

from lib.auth import require_admin
from lib.common import audit, aware, get_settings, now_utc, validate_url
from lib.db import db
from models.schemas import (AdminPlaqueOut, AdminStats, PasswordResetRequestOut, ResetLinkOut, SettingsIn,
                            SettingsOut, UserOut)
from routers.auth import RESET_TTL, make_reset_token, to_user_out

router = APIRouter(prefix="/admin")


@router.get("/stats", response_model=AdminStats)
async def stats(admin: dict = Depends(require_admin)):
    c = {"role": "customer"}
    plaques = await db.plaques.count_documents({})
    return AdminStats(
        pending=await db.users.count_documents({**c, "status": "pending"}),
        approved=await db.users.count_documents({**c, "status": "approved"}),
        blocked=await db.users.count_documents({**c, "status": "blocked"}),
        batches=await db.batches.count_documents({"status": "ready"}),
        plaques=plaques,
        qr_issued=await db.plaques.count_documents({"disabled": False}),
        scans=await db.scans.count_documents({}),
    )


@router.get("/users", response_model=list[UserOut])
async def users(status: str = "", admin: dict = Depends(require_admin)):
    filt: dict = {"role": "customer"}
    if status in ("pending", "approved", "blocked"):
        filt["status"] = status
    docs = await db.users.find(filt, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return [to_user_out(u) for u in docs]


@router.post("/users/{uid}/{action}", response_model=UserOut)
async def user_action(uid: str, action: Literal["approve", "block", "reactivate"], admin: dict = Depends(require_admin)):
    allowed_from = {"approve": ["pending"], "block": ["pending", "approved"], "reactivate": ["blocked"]}[action]
    new_status = {"approve": "approved", "block": "blocked", "reactivate": "approved"}[action]
    update: dict = {"status": new_status, "status_changed_at": now_utc()}
    if action != "block":
        update["approved_at"] = now_utc()
    u = await db.users.find_one_and_update(
        {"id": uid, "role": "customer", "status": {"$in": allowed_from}},
        {"$set": update}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not u:
        raise HTTPException(status_code=409, detail="Ação não permitida para o status atual deste comprador.")
    await audit(admin, f"user.{action}", uid, u["email"])
    return to_user_out(u)


@router.get("/password-resets", response_model=list[PasswordResetRequestOut])
async def password_resets(admin: dict = Depends(require_admin)):
    docs = await db.password_resets.find({"used": False}, {"_id": 0}).sort("requested_at", -1).to_list(200)
    return [PasswordResetRequestOut(id=d["id"], user_id=d["user_id"], email=d["email"], name=d["name"],
                                    created_at=aware(d.get("requested_at") or d["created_at"]),
                                    link_generated=bool(d.get("token_hash"))) for d in docs]


@router.post("/password-resets/{rid}/link", response_model=ResetLinkOut)
async def reset_link(rid: str, admin: dict = Depends(require_admin)):
    raw, h = make_reset_token()
    exp = now_utc() + RESET_TTL
    r = await db.password_resets.find_one_and_update({"id": rid, "used": False},
                                                     {"$set": {"token_hash": h, "expires_at": exp}})
    if not r:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    await audit(admin, "password_reset.link", r["user_id"], r["email"])
    base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    return ResetLinkOut(link=f"{base}/redefinir-senha?token={raw}", expires_at=exp)


@router.get("/settings", response_model=SettingsOut)
async def read_settings(admin: dict = Depends(require_admin)):
    return SettingsOut(**await get_settings())


@router.put("/settings", response_model=SettingsOut)
async def write_settings(body: SettingsIn, admin: dict = Depends(require_admin)):
    url = validate_url(body.public_base_url, allow_empty=False).rstrip("/")
    if body.production_confirmed and not url.startswith("https://"):
        raise HTTPException(status_code=422, detail="O domínio de produção precisa usar https://")
    await db.settings.update_one({"_id": "global"}, {"$set": {"public_base_url": url,
                                                             "production_confirmed": body.production_confirmed,
                                                             "updated_at": now_utc()}}, upsert=True)
    await audit(admin, "settings.update", "global", f"{url} prod={body.production_confirmed}")
    return SettingsOut(**await get_settings())


@router.get("/plaques", response_model=list[AdminPlaqueOut])
async def search_plaques(number: int = Query(..., ge=1), admin: dict = Depends(require_admin)):
    docs = await db.plaques.find({"number": number}, {"_id": 0}).to_list(5)
    out = []
    for p in docs:
        owner = await db.users.find_one({"id": p["owner_id"]}, {"email": 1})
        b = await db.batches.find_one({"id": p["batch_id"]}, {"name": 1})
        out.append(AdminPlaqueOut(id=p["id"], code=p["code"], number=p["number"],
                                  owner_email=(owner or {}).get("email", "—"), batch_name=(b or {}).get("name", "—"),
                                  destination_url=p.get("destination_url", ""), disabled=p.get("disabled", False),
                                  scan_count=p.get("scan_count", 0)))
    return out


@router.post("/plaques/{pid}/toggle", response_model=AdminPlaqueOut)
async def toggle_plaque(pid: str, admin: dict = Depends(require_admin)):
    p = await db.plaques.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Plaquinha não encontrada.")
    disabled = not p.get("disabled", False)
    await db.plaques.update_one({"id": pid}, {"$set": {"disabled": disabled, "updated_at": now_utc()}})
    await audit(admin, "plaque.disable" if disabled else "plaque.enable", pid, str(p["number"]))
    owner = await db.users.find_one({"id": p["owner_id"]}, {"email": 1})
    b = await db.batches.find_one({"id": p["batch_id"]}, {"name": 1})
    return AdminPlaqueOut(id=p["id"], code=p["code"], number=p["number"], owner_email=(owner or {}).get("email", "—"),
                          batch_name=(b or {}).get("name", "—"), destination_url=p.get("destination_url", ""),
                          disabled=disabled, scan_count=p.get("scan_count", 0))
