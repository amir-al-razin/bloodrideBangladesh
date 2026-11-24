"""BloodRide API. Run:  uvicorn app.main:app --reload --port 8000  (from backend/)."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, notify, search, slip_check
from .config import CORS_ORIGINS
from .routes import admin, alerts, auth, donors, requests, staff, track

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.pool.open(wait=True)
    tasks = [asyncio.create_task(notify.telegram_poller()), asyncio.create_task(search.loop())]
    yield
    for t in tasks:
        t.cancel()
    await db.pool.close()


app = FastAPI(title="BloodRide API", version="0.2.0-stage1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

for r in (auth, requests, track, alerts, donors, staff, admin):
    app.include_router(r.router)


@app.get("/api/health")
async def health():
    async with db.pool.connection() as conn:
        cur = await conn.execute("SELECT postgis_lib_version() AS postgis, count(*) AS donors FROM donor")
        row = await cur.fetchone()
    return {"ok": True, **row, "ocr": slip_check.ocr_available(), "telegram": notify.telegram_enabled()}
