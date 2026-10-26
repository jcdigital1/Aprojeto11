"""Exports every DINÂMICO PRO record from the original MongoDB into migration/export.json.

Run once inside the Emergent workspace (where MongoDB lives):
    cd /app/backend && python ../dinamico-pro/scripts/export_mongo.py
Password hashes are intentionally NOT exported (users set a new password via Firebase e-mail).
"""
import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path("/app/backend/.env"))
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
OUT = Path(__file__).resolve().parent.parent / "migration" / "export.json"

COLLECTIONS = ["users", "templates", "template_assets", "batches", "plaques", "scans", "settings", "counters", "admin_actions"]
DROP = {"_id", "password_hash", "session_version"}


def conv(v):
    if isinstance(v, datetime):
        return {"$date": (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()}
    if isinstance(v, (bytes, bytearray)):
        return {"$bytes": base64.b64encode(bytes(v)).decode()}
    if isinstance(v, dict):
        return {k: conv(x) for k, x in v.items()}
    if isinstance(v, list):
        return [conv(x) for x in v]
    if hasattr(v, "binary"):  # bson.Binary
        return {"$bytes": base64.b64encode(bytes(v)).decode()}
    return v


def main():
    data = {}
    for c in COLLECTIONS:
        docs = []
        for d in db[c].find({}):
            row = {k: conv(v) for k, v in d.items() if k not in DROP}
            if c in ("settings", "counters"):
                row["__key"] = str(d["_id"])
            docs.append(row)
        data[c] = docs
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"exported_at": datetime.now(timezone.utc).isoformat(), "data": data}, ensure_ascii=False, indent=1))
    for c in COLLECTIONS:
        print(f"{c:16s} {len(data[c]):6d}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
