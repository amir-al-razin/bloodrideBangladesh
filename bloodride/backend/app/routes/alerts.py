"""What a donor sees after an alert: details, seen, Accept / Can't donate. Owner: Farhan.
The donor is the signed-in account; the alert is addressed by request id.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db
from ..auth import donor_user

router = APIRouter(prefix="/api/alerts")


class AcceptBody(BaseModel):
    share_phone: bool = False


@router.get("/{request_id}")
async def alert_details(request_id: int, user: dict = Depends(donor_user)):
    donor_id = user["user_id"]
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT a.request_id, a.donor_id, u.full_name AS donor, a.distance_km, a.round_no,
                      a.response, a.seen_at, r.blood_group, r.bags_needed, r.urgency, r.needed_by,
                      r.status AS request_status, h.name AS hospital, h.address,
                      ST_Y(h.location::geometry) AS lat, ST_X(h.location::geometry) AS lng,
                      (SELECT count(*) FROM mission m WHERE m.request_id = r.request_id
                          AND m.status NOT IN ('cancelled', 'failed_screening')) AS bags_filled
                 FROM donor_alert a
                 JOIN blood_request r USING (request_id)
                 JOIN hospital h USING (hospital_id)
                 JOIN app_user u ON u.user_id = a.donor_id
                WHERE a.request_id = %s AND a.donor_id = %s""", (request_id, donor_id))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, {"error": "alert_not_found", "message": "This alert does not exist"})
    return row


@router.post("/{request_id}/seen")
async def mark_seen(request_id: int, user: dict = Depends(donor_user)):
    donor_id = user["user_id"]
    async with db.tx() as conn:
        cur = await conn.execute(
            """UPDATE donor_alert SET seen_at = now()
                WHERE request_id = %s AND donor_id = %s AND seen_at IS NULL""", (request_id, donor_id))
    return {"updated": cur.rowcount}


@router.post("/{request_id}/accept")
async def accept(request_id: int, body: AcceptBody, user: dict = Depends(donor_user)):
    donor_id = user["user_id"]
    async with db.tx() as conn:
        cur = await conn.execute("CALL accept_request(%s::int, %s::int, %s::boolean)", (request_id, donor_id, body.share_phone))
        res = await cur.fetchone()
    if res["p_result"] == "accepted":
        return {"result": "accepted", "mission_id": res["p_mission_id"],
                "message": "Thank you, you’re reserved for this request, please head to the hospital"}
    return {"result": "backup",
            "message": "This request is already filled, so you’re on the backup list and we’ll alert you if needed"}


@router.post("/{request_id}/decline")
async def decline(request_id: int, user: dict = Depends(donor_user)):
    donor_id = user["user_id"]
    async with db.tx() as conn:
        cur = await conn.execute(
            """UPDATE donor_alert SET response = 'declined', responded_at = now(),
                      seen_at = coalesce(seen_at, now())
                WHERE request_id = %s AND donor_id = %s AND response = 'pending'""", (request_id, donor_id))
        if cur.rowcount == 0:
            cur = await conn.execute("SELECT response FROM donor_alert WHERE request_id = %s AND donor_id = %s",
                                     (request_id, donor_id))
            row = await cur.fetchone()
            if not row:
                raise HTTPException(404, {"error": "alert_not_found", "message": "This alert does not exist"})
            raise HTTPException(409, {"error": "already_responded",
                                      "message": f"You already answered this request ({row['response']})"})
    return {"result": "declined", "message": "Thanks for letting us know"}
