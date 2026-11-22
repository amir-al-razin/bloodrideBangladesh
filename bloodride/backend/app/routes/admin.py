"""Demo admin: slips the automatic check could not read. Requests are already live (alerts go out
on upload); the admin marks a slip verified or rejects a fake one, which cancels the request.
Protected by ADMIN_KEY until Sprint 2 login. The full review page is a Sprint 2 task (Saa'd).
"""
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import db
from ..config import ADMIN_KEY, ADMIN_USER_ID, UPLOAD_DIR

router = APIRouter(prefix="/api/admin")


def _check(key: str | None) -> None:
    if key != ADMIN_KEY:
        raise HTTPException(403, {"error": "not_admin", "message": "Wrong admin key"})


class Review(BaseModel):
    approve: bool


@router.get("/slips")
async def review_queue(x_admin_key: str | None = Header(None)):
    _check(x_admin_key)
    async with db.pool.connection() as conn:
        cur = await conn.execute("SELECT * FROM v_slip_review_queue")
        rows = await cur.fetchall()
    for r in rows:
        r.pop("image_path")
    return rows


@router.get("/slips/{slip_id}/image")
async def slip_image(slip_id: int, key: str = Query(...)):
    _check(key)                                            # <img> tags cannot send headers
    async with db.pool.connection() as conn:
        cur = await conn.execute("SELECT image_path FROM requisition_slip WHERE slip_id = %s", (slip_id,))
        row = await cur.fetchone()
    path = Path(row["image_path"]) if row else None
    if not path or not path.is_file() or UPLOAD_DIR.resolve() not in path.resolve().parents:
        raise HTTPException(404, {"error": "not_found", "message": "No image"})
    return FileResponse(path)


@router.post("/slips/{slip_id}/review")
async def review(slip_id: int, body: Review, x_admin_key: str | None = Header(None)):
    _check(x_admin_key)
    async with db.tx() as conn:
        await conn.execute("CALL review_slip(%s::int, %s::int, %s::boolean)", (slip_id, ADMIN_USER_ID, body.approve))
        cur = await conn.execute("SELECT request_id FROM blood_request WHERE slip_id = %s", (slip_id,))
        request_id = (await cur.fetchone())["request_id"]
    return {"slip_id": slip_id, "request_id": request_id, "approved": body.approve}
