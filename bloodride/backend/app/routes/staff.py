"""Hospital staff: approve or reject requests for their own hospital. Approving sends the first
alert round straight away. A BloodRide admin sees every hospital."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .. import db
from ..auth import staff_user
from ..config import UPLOAD_DIR
from .requests import start_alert_round

router = APIRouter(prefix="/api/staff")


def _scope(user: dict, column: str = "hospital_id") -> tuple[str, tuple]:
    """Admins see all hospitals; staff only their own."""
    if user["account_type"] == "admin":
        return "TRUE", ()
    return f"{column} = %s", (user["hospital_id"],)


@router.get("/queue")
async def queue(user: dict = Depends(staff_user)):
    where, args = _scope(user)
    async with db.pool.connection() as conn:
        cur = await conn.execute(f"SELECT * FROM v_slip_review_queue WHERE {where}", args)
        rows = await cur.fetchall()
    for r in rows:
        r.pop("image_path")
    return json.loads(json.dumps(rows, default=str))


@router.get("/recent")
async def recent(user: dict = Depends(staff_user)):
    """Decisions from the last 48 hours, with how the search is going."""
    where, args = _scope(user, "r.hospital_id")
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            f"""SELECT p.request_id, p.blood_group, p.bags_needed, p.urgency, p.hospital, p.status,
                       p.slip_status, p.approved_at, p.alerted, p.accepted, p.rounds,
                       u.full_name AS reviewed_by
                  FROM v_request_progress p
                  JOIN blood_request r USING (request_id)
                  JOIN requisition_slip s ON s.slip_id = r.slip_id
                  LEFT JOIN app_user u ON u.user_id = s.reviewed_by
                 WHERE s.check_status IN ('verified', 'rejected')
                   AND s.reviewed_at > now() - interval '48 hours'
                   AND {where}
                 ORDER BY s.reviewed_at DESC""", args)
        return json.loads(json.dumps(await cur.fetchall(), default=str))


async def _slip_of(conn, request_id: int, user: dict) -> dict:
    cur = await conn.execute(
        """SELECT r.slip_id, r.hospital_id, s.image_path FROM blood_request r
             JOIN requisition_slip s USING (slip_id) WHERE r.request_id = %s""", (request_id,))
    row = await cur.fetchone()
    if not row or (user["account_type"] != "admin" and row["hospital_id"] != user["hospital_id"]):
        raise HTTPException(404, {"error": "not_found", "message": "No such request for your hospital"})
    return row


@router.get("/requests/{request_id}/slip")
async def slip_image(request_id: int, user: dict = Depends(staff_user)):
    async with db.pool.connection() as conn:
        row = await _slip_of(conn, request_id, user)
    path = Path(row["image_path"])
    if not path.is_file() or UPLOAD_DIR.resolve() not in path.resolve().parents:
        raise HTTPException(404, {"error": "not_found", "message": "The slip photo is missing"})
    return FileResponse(path)


async def _decide(request_id: int, user: dict, approve: bool) -> dict:
    async with db.tx() as conn:
        row = await _slip_of(conn, request_id, user)
        await conn.execute("CALL review_slip(%s::int, %s::int, %s::boolean)",
                           (row["slip_id"], user["user_id"], approve))
    result = {"request_id": request_id, "approved": approve}
    if approve:
        result["search"] = await start_alert_round(request_id)
    return result


@router.post("/requests/{request_id}/approve")
async def approve(request_id: int, user: dict = Depends(staff_user)):
    return await _decide(request_id, user, True)


@router.post("/requests/{request_id}/reject")
async def reject(request_id: int, user: dict = Depends(staff_user)):
    return await _decide(request_id, user, False)
