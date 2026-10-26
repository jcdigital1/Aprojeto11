import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from lib.db import client, ensure_indexes  # noqa: E402
from lib.templates_seed import seed_templates  # noqa: E402
from routers import admin, auth, batches, redirect, templates  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    try:
        await seed_templates()
    except Exception:
        logger.exception("template seed failed")
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="DINÂMICO PRO")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "DINÂMICO PRO API"}


api_router.include_router(auth.router)
api_router.include_router(templates.router)
api_router.include_router(batches.router)
api_router.include_router(admin.router)
api_router.include_router(redirect.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the router in the main app — keep this the last statement.
app.include_router(api_router)
