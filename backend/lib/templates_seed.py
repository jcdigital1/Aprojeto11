"""The 8 official plaque templates.

QR boxes were measured on the 800x800 originals (pixel-exact bounding box of the printed QR),
then the QR area (+3px) was restored to the surrounding solid white background to produce
frontend/public/templates/clean-N.png (verified: zero non-white pixels left in the region).
All coordinates are normalized to the artwork size.
"""
from datetime import datetime, timezone

from lib.db import db

SIZE = 800.0
# template id -> (name, qr bbox x0,y0,x1,y1 in px, numberY)
_RAW = {
    "1": ("Wi-Fi Preto", (465, 426, 674, 635), 0.955),
    "2": ("WhatsApp Verde", (476, 436, 663, 623), 0.955),
    "3": ("Avalie no Google (Azul)", (540, 552, 697, 710), 0.955),
    "4": ("Nos Avalie no Google (Preto)", (473, 444, 654, 625), 0.925),
    "5": ("Wi-Fi Azul", (471, 432, 667, 627), 0.955),
    "6": ("Siga no Instagram", (535, 541, 701, 708), 0.955),
    "7": ("Nos Avalie no Google (Azul)", (473, 444, 654, 625), 0.925),
    "8": ("Opinião no Google", (103, 486, 312, 695), 0.925),
}


def default_calibration(bbox: tuple[int, int, int, int], number_y: float) -> dict:
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0 + 1, y1 - y0 + 1
    return {
        "qrX": round(x0 / SIZE, 5), "qrY": round(y0 / SIZE, 5),
        "qrWidth": round(w / SIZE, 5), "qrHeight": round(h / SIZE, 5),
        "quietZone": 0.0,  # the clean artwork already has a white margin around the region
        "cleanupRegion": {"x": round((x0 - 3) / SIZE, 5), "y": round((y0 - 3) / SIZE, 5),
                          "w": round((w + 6) / SIZE, 5), "h": round((h + 6) / SIZE, 5)},
        "numberX": 0.955, "numberY": number_y, "numberFontSize": 0.022,
        "numberColor": "#2b2f36", "numberAlignment": "right",
    }


async def seed_templates() -> None:
    now = datetime.now(timezone.utc)
    for tid, (name, bbox, ny) in _RAW.items():
        await db.templates.update_one(
            {"id": tid},
            {"$setOnInsert": {
                "id": tid, "name": name,
                "original_url": f"/templates/t{tid}.jpg",
                "clean_url": f"/templates/clean-{tid}.png",
                "version": 1, "production_ready": True,
                "calibration": default_calibration(bbox, ny),
                "updated_at": now,
            }},
            upsert=True,
        )
