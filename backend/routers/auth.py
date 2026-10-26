import hashlib
import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pymongo.errors import DuplicateKeyError

from lib.auth import (admin_email, clear_session, get_current_user, hash_password, require_approved,
                      set_session, verify_password)
from lib.common import aware, new_id, now_utc
from lib.db import db
from models.schemas import (ChangePasswordIn, ForgotIn, LoginIn, MessageOut, MyStats, RegisterIn, ResetIn,
                            UserOut)

router = APIRouter()
log = logging.getLogger("auth")


def to_user_out(u: dict) -> UserOut:
    return UserOut(id=u["id"], name=u["name"], email=u["email"], role=u["role"], status=u["status"],
                   created_at=aware(u["created_at"]), approved_at=aware(u.get("approved_at")))


@router.post("/auth/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response):
    email = body.email.strip().lower()
    is_admin = email == admin_email() and not await db.users.find_one({"role": "admin"})
    now = now_utc()
    user = {
        "id": new_id(), "name": body.name.strip(), "email": email,
        "password_hash": hash_password(body.password),
        "role": "admin" if is_admin else "customer",
        "status": "approved" if is_admin else "pending",
        "created_at": now, "approved_at": now if is_admin else None, "session_version": 0,
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado.")
    log.info("user registered %s role=%s", email, user["role"])
    set_session(response, user["id"], 0)
    return to_user_out(user)


@router.post("/auth/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"email": body.email.strip().lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    set_session(response, user["id"], user.get("session_version", 0))
    return to_user_out(user)


@router.post("/auth/logout", response_model=MessageOut)
async def logout(response: Response):
    clear_session(response)
    return MessageOut(message="Sessão encerrada.")


@router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return to_user_out(user)


@router.post("/auth/forgot", response_model=MessageOut)
async def forgot(body: ForgotIn):
    user = await db.users.find_one({"email": body.email.strip().lower()}, {"_id": 0})
    if user:
        await db.password_resets.update_one(
            {"user_id": user["id"], "used": False},
            {"$set": {"email": user["email"], "name": user["name"], "requested_at": now_utc()},
             "$setOnInsert": {"id": new_id(), "user_id": user["id"], "used": False, "token_hash": None,
                              "expires_at": None, "created_at": now_utc()}},
            upsert=True,
        )
    # Same answer either way: never reveal whether an e-mail exists.
    return MessageOut(message="Se o e-mail estiver cadastrado, o administrador receberá seu pedido e enviará o link de redefinição.")


@router.post("/auth/reset", response_model=MessageOut)
async def reset(body: ResetIn):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    req = await db.password_resets.find_one({"token_hash": token_hash, "used": False})
    if not req or not req.get("expires_at") or aware(req["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Solicite um novo.")
    await db.users.update_one({"id": req["user_id"]},
                              {"$set": {"password_hash": hash_password(body.password)},
                               "$inc": {"session_version": 1}})
    await db.password_resets.update_one({"id": req["id"]}, {"$set": {"used": True, "used_at": now_utc()}})
    return MessageOut(message="Senha redefinida com sucesso. Faça login com a nova senha.")


@router.post("/auth/change-password", response_model=MessageOut)
async def change_password(body: ChangePasswordIn, response: Response, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    sv = user.get("session_version", 0) + 1
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"password_hash": hash_password(body.new_password), "session_version": sv}})
    set_session(response, user["id"], sv)
    return MessageOut(message="Senha alterada com sucesso.")


def make_reset_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


RESET_TTL = timedelta(hours=2)


@router.get("/me/stats", response_model=MyStats)
async def my_stats(user: dict = Depends(require_approved)):
    uid = user["id"]
    batches = await db.batches.count_documents({"owner_id": uid, "status": "ready"})
    plaques = await db.plaques.count_documents({"owner_id": uid})
    configured = await db.plaques.count_documents({"owner_id": uid, "destination_url": {"$ne": ""}})
    scans = await db.scans.count_documents({"owner_id": uid})
    return MyStats(batches=batches, plaques=plaques, configured=configured, scans=scans)
