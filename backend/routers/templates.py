from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from lib.auth import get_current_user, require_admin
from lib.common import audit, aware, now_utc
from lib.db import db
from models.schemas import Calibration, ProductionIn, TemplateOut

router = APIRouter()


def to_out(t: dict) -> TemplateOut:
    return TemplateOut(id=t["id"], name=t["name"], original_url=t["original_url"], clean_url=t["clean_url"],
                       version=t["version"], production_ready=t["production_ready"],
                       calibration=Calibration(**t["calibration"]), updated_at=aware(t["updated_at"]))


@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(user: dict = Depends(get_current_user)):
    docs = await db.templates.find({}, {"_id": 0}).sort("id", 1).to_list(50)
    return [to_out(t) for t in docs]


@router.get("/templates/{tid}/clean")
async def clean_image(tid: str):
    """Public: serves an admin-uploaded clean base (artwork only, no private data)."""
    asset = await db.template_assets.find_one({"template_id": tid})
    if not asset:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return Response(content=bytes(asset["data"]), media_type=asset["content_type"],
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.put("/admin/templates/{tid}/calibration", response_model=TemplateOut)
async def save_calibration(tid: str, body: Calibration, admin: dict = Depends(require_admin)):
    t = await db.templates.find_one_and_update(
        {"id": tid},
        {"$set": {"calibration": body.model_dump(), "updated_at": now_utc()}, "$inc": {"version": 1}},
        projection={"_id": 0}, return_document=True,
    )
    if not t:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")
    await audit(admin, "template.calibrate", tid, f"v{t['version']}")
    return to_out(t)


@router.post("/admin/templates/{tid}/production", response_model=TemplateOut)
async def set_production(tid: str, body: ProductionIn, admin: dict = Depends(require_admin)):
    t = await db.templates.find_one_and_update(
        {"id": tid}, {"$set": {"production_ready": body.production_ready, "updated_at": now_utc()}},
        projection={"_id": 0}, return_document=True,
    )
    if not t:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")
    await audit(admin, "template.production", tid, str(body.production_ready))
    return to_out(t)


@router.post("/admin/templates/{tid}/clean-image", response_model=TemplateOut)
async def upload_clean(tid: str, file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=422, detail="Envie uma imagem PNG, JPG ou WEBP.")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Imagem muito grande (máx. 8 MB).")
    if not await db.templates.find_one({"id": tid}):
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")
    await db.template_assets.update_one({"template_id": tid},
                                        {"$set": {"template_id": tid, "content_type": file.content_type,
                                                  "data": data, "uploaded_at": now_utc()}}, upsert=True)
    t = await db.templates.find_one({"id": tid}, {"_id": 0})
    v = t["version"] + 1
    t = await db.templates.find_one_and_update(
        {"id": tid},
        {"$set": {"clean_url": f"/api/templates/{tid}/clean?v={v}", "version": v,
                  "production_ready": False, "updated_at": now_utc()}},
        projection={"_id": 0}, return_document=True,
    )
    await audit(admin, "template.clean_upload", tid, f"v{v}")
    return to_out(t)
