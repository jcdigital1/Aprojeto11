"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("role", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)], name="role_status"),
    ],
    "templates": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "template_assets": [IndexModel([("template_id", ASCENDING)], name="template_id", unique=True)],
    "batches": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("owner_id", ASCENDING), ("idempotency_key", ASCENDING)], name="owner_idem", unique=True),
        IndexModel([("owner_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)], name="owner_created"),
    ],
    "plaques": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code", unique=True),
        IndexModel([("number", ASCENDING)], name="number", unique=True),
        IndexModel([("owner_id", ASCENDING), ("number", DESCENDING)], name="owner_number"),
        IndexModel([("batch_id", ASCENDING), ("number", ASCENDING)], name="batch_number"),
    ],
    "scans": [IndexModel([("owner_id", ASCENDING), ("at", DESCENDING)], name="owner_at"),
              IndexModel([("plaque_id", ASCENDING), ("at", DESCENDING)], name="plaque_at")],
    "password_resets": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                        IndexModel([("token_hash", ASCENDING)], name="token_hash"),
                        IndexModel([("user_id", ASCENDING), ("used", ASCENDING)], name="user_used")],
    "admin_actions": [IndexModel([("at", DESCENDING)], name="at_desc")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
