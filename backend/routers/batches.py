import logging
import re
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib.auth import require_approved
from lib.common import aware, get_settings, new_id, now_utc, validate_url
from lib.db import db
from models.schemas import (BatchCreate, BatchOut, Calibration, DestinationIn, PlaqueOut, PlaquePage,
                            RenderSnapshot)

router = APIRouter()
log = logging.getLogger("batches")
_ALPHA = string.ascii_letters + string.digits


def new_code() -> str:
    return "".join(secrets.choice(_ALPHA) for _ in range(12))


def batch_out(b: dict) -> BatchOut:
    r = b["render"]
    return BatchOut(id=b["id"], owner_id=b["owner_id"], name=b["name"], template_id=b["template_id"],
                    template_name=b["template_name"], template_version=b["template_version"],
                    render=RenderSnapshot(template_id=r["template_id"], template_version=r["template_version"],
                                          clean_url=r["clean_url"], calibration=Calibration(**r["calibration"])),
                    quantity=b["quantity"], number_start=b.get("number_start", 0), number_end=b.get("number_end", 0),
                    status=b["status"], test_mode=b.get("test_mode", True), created_at=aware(b["created_at"]))


def plaque_out(p: dict, b: dict) -> PlaqueOut:
    bo = batch_out(b)
    return PlaqueOut(id=p["id"], code=p["code"], number=p["number"], batch_id=p["batch_id"], batch_name=b["name"],
                     template_id=p["template_id"], qr_url=p["qr_url"], destination_url=p.get("destination_url", ""),
                     disabled=p.get("disabled", False), scan_count=p.get("scan_count", 0),
                     test_mode=b.get("test_mode", True), render=bo.render,
                     created_at=aware(p["created_at"]), updated_at=aware(p["updated_at"]))


async def reserve_numbers(qty: int) -> tuple[int, int]:
    """Atomic global range reservation: a single $inc on one document can never hand out overlapping ranges."""
    doc = await db.counters.find_one_and_update(
        {"_id": "plaque_number"}, {"$inc": {"value": qty}}, upsert=True, return_document=ReturnDocument.AFTER)
    end = int(doc["value"])
    return end - qty + 1, end


@router.post("/batches", response_model=BatchOut)
async def create_batch(body: BatchCreate, user: dict = Depends(require_approved)):
    uid = user["id"]
    existing = await db.batches.find_one({"owner_id": uid, "idempotency_key": body.idempotency_key}, {"_id": 0})
    if existing:
        return batch_out(existing)
    tpl = await db.templates.find_one({"id": body.template_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")
    if not tpl["production_ready"]:
        raise HTTPException(status_code=409, detail="Este modelo ainda não foi aprovado para produção.")
    settings = await get_settings()
    base = settings["public_base_url"]
    if not base:
        raise HTTPException(status_code=503, detail="Domínio público não configurado pelo administrador.")
    test_mode = not settings["production_confirmed"]
    now = now_utc()
    count = await db.batches.count_documents({"owner_id": uid})
    batch = {
        "id": new_id(), "owner_id": uid, "idempotency_key": body.idempotency_key,
        "name": (body.name or "").strip() or f"Lote {count + 1}",
        "template_id": tpl["id"], "template_name": tpl["name"], "template_version": tpl["version"],
        "render": {"template_id": tpl["id"], "template_version": tpl["version"],
                   "clean_url": tpl["clean_url"], "calibration": tpl["calibration"]},
        "quantity": body.quantity, "number_start": 0, "number_end": 0,
        "status": "creating", "test_mode": test_mode, "base_url": base, "created_at": now,
    }
    try:
        await db.batches.insert_one(batch)  # unique (owner_id, idempotency_key) blocks double clicks
    except DuplicateKeyError:
        existing = await db.batches.find_one({"owner_id": uid, "idempotency_key": body.idempotency_key}, {"_id": 0})
        return batch_out(existing)
    try:
        start, end = await reserve_numbers(body.quantity)
        plaques = []
        for n in range(start, end + 1):
            code = new_code()
            plaques.append({
                "id": new_id(), "code": code, "number": n, "batch_id": batch["id"], "owner_id": uid,
                "template_id": tpl["id"], "qr_url": f"{base}/api/r/{code}", "destination_url": "",
                "disabled": False, "scan_count": 0, "created_at": now, "updated_at": now,
            })
        await db.plaques.insert_many(plaques, ordered=True)
        await db.batches.update_one({"id": batch["id"]},
                                    {"$set": {"status": "ready", "number_start": start, "number_end": end}})
        batch.update(status="ready", number_start=start, number_end=end)
        log.info("batch %s created by %s: %s-%s", batch["id"], uid, start, end)
    except Exception:
        log.exception("batch creation failed %s", batch["id"])
        await db.plaques.delete_many({"batch_id": batch["id"]})
        await db.batches.update_one({"id": batch["id"]}, {"$set": {"status": "failed"}})
        raise HTTPException(status_code=500, detail="Falha ao gerar o lote. Tente novamente.")
    return batch_out(batch)


@router.get("/batches", response_model=list[BatchOut])
async def list_batches(user: dict = Depends(require_approved)):
    docs = await db.batches.find({"owner_id": user["id"], "status": "ready"}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return [batch_out(b) for b in docs]


async def _owned_batch(bid: str, uid: str) -> dict:
    b = await db.batches.find_one({"id": bid, "owner_id": uid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Lote não encontrado.")
    return b


@router.get("/batches/{bid}", response_model=BatchOut)
async def get_batch(bid: str, user: dict = Depends(require_approved)):
    return batch_out(await _owned_batch(bid, user["id"]))


@router.get("/batches/{bid}/plaques", response_model=PlaquePage)
async def batch_plaques(bid: str, page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=500),
                        user: dict = Depends(require_approved)):
    b = await _owned_batch(bid, user["id"])
    q = {"batch_id": bid, "owner_id": user["id"]}
    total = await db.plaques.count_documents(q)
    docs = await db.plaques.find(q, {"_id": 0}).sort("number", 1).skip((page - 1) * page_size).limit(page_size) \
        .to_list(page_size)
    return PlaquePage(items=[plaque_out(p, b) for p in docs], total=total, page=page, page_size=page_size)


@router.get("/plaques", response_model=PlaquePage)
async def list_plaques(q: str = "", batch_id: str = "", page: int = Query(1, ge=1),
                       page_size: int = Query(20, ge=1, le=100), user: dict = Depends(require_approved)):
    uid = user["id"]
    filt: dict = {"owner_id": uid}  # tenant isolation lives in the query itself
    if batch_id:
        filt["batch_id"] = batch_id
    term = q.strip().lstrip("Nº").strip()
    if term:
        if re.fullmatch(r"\d{1,9}", term):
            filt["number"] = int(term)
        else:
            filt["$or"] = [{"destination_url": {"$regex": re.escape(term), "$options": "i"}},
                           {"code": term}]
    total = await db.plaques.count_documents(filt)
    docs = await db.plaques.find(filt, {"_id": 0}).sort("number", -1).skip((page - 1) * page_size) \
        .limit(page_size).to_list(page_size)
    bids = list({p["batch_id"] for p in docs})
    batches = {b["id"]: b for b in await db.batches.find({"id": {"$in": bids}, "owner_id": uid}, {"_id": 0})
               .to_list(len(bids) or 1)}
    items = [plaque_out(p, batches[p["batch_id"]]) for p in docs if p["batch_id"] in batches]
    return PlaquePage(items=items, total=total, page=page, page_size=page_size)


@router.patch("/plaques/{pid}", response_model=PlaqueOut)
async def update_destination(pid: str, body: DestinationIn, user: dict = Depends(require_approved)):
    url = validate_url(body.destination_url)
    # Only destination_url is writable: code, number and qr_url are permanent.
    p = await db.plaques.find_one_and_update(
        {"id": pid, "owner_id": user["id"]},
        {"$set": {"destination_url": url, "updated_at": now_utc()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not p:
        raise HTTPException(status_code=404, detail="Plaquinha não encontrada.")
    b = await _owned_batch(p["batch_id"], user["id"])
    return plaque_out(p, b)
