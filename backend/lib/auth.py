"""Session auth (httpOnly JWT cookie) + principal dependencies.

The role/status are ALWAYS re-read from Mongo on every request, never trusted from the token,
so blocking or approving a user takes effect immediately.
"""
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext

from lib.db import db

COOKIE_NAME = "dp_session"
SESSION_DAYS = 14
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(raw: str) -> str:
    return _pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return _pwd.verify(raw, hashed)
    except Exception:
        return False


def admin_email() -> str:
    return os.environ.get("ADMIN_EMAIL", "").strip().lower()


def set_session(response: Response, user_id: str, session_version: int) -> None:
    exp = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    token = jwt.encode({"sub": user_id, "sv": session_version, "exp": exp}, os.environ["JWT_SECRET"], algorithm="HS256")
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, secure=True, samesite="lax",
        max_age=SESSION_DAYS * 86400, path="/",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", secure=True, httponly=True, samesite="lax")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Sessão não encontrada. Faça login.")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user or user.get("session_version", 0) != payload.get("sv", 0):
        raise HTTPException(status_code=401, detail="Sessão inválida. Faça login novamente.")
    return user


async def require_approved(user: dict = Depends(get_current_user)) -> dict:
    """Customer-protected functions: only approved (or admin) accounts."""
    if user["role"] == "admin":
        return user
    if user["status"] == "blocked":
        raise HTTPException(status_code=403, detail="Sua conta está bloqueada. Fale com o administrador.")
    if user["status"] != "approved":
        raise HTTPException(status_code=403, detail="Sua conta ainda aguarda aprovação.")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return user
