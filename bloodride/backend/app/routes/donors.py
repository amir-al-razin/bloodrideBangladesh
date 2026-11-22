"""Donor side for the demo: pick a demo donor, turn on web push / Telegram, see your alerts.
Real sign-in arrives in Sprint 2; until then the donor page lets you choose a seeded donor.
"""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, notify

router = APIRouter(prefix="/api")


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


@router.get("/push/public-key")
async def push_public_key():
    return {"public_key": notify.VAPID_PUBLIC_KEY}


@router.get("/demo/donors")
async def demo_donors():
    """The two named demo donors first, then a few AB- donors (the demo request's group)."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT d.user_id AS donor_id, u.full_name, d.blood_group, c.name AS campus,
                      d.next_eligible_date,
                      EXISTS (SELECT 1 FROM notification_channel n
                               WHERE n.user_id = d.user_id AND n.channel_type = 'web_push') AS web_push,
                      EXISTS (SELECT 1 FROM notification_channel n
                               WHERE n.user_id = d.user_id AND n.channel_type = 'telegram') AS telegram
                 FROM donor d JOIN app_user u USING (user_id) LEFT JOIN campus c USING (campus_id)
                WHERE u.phone LIKE '018%' OR d.blood_group = 'AB-'
                ORDER BY (u.phone LIKE '018%') DESC, d.user_id
                LIMIT 12""")
        return await cur.fetchall()


async def _donor_exists(conn, donor_id: int) -> None:
    cur = await conn.execute("SELECT 1 FROM donor WHERE user_id = %s", (donor_id,))
    if not await cur.fetchone():
        raise HTTPException(404, {"error": "donor_not_found", "message": "Unknown donor"})


@router.post("/donors/{donor_id}/webpush", status_code=201)
async def save_push_subscription(donor_id: int, sub: PushSubscription):
    async with db.tx() as conn:
        await _donor_exists(conn, donor_id)
        await conn.execute(
            """INSERT INTO notification_channel (user_id, channel_type, address)
               VALUES (%s, 'web_push', %s) ON CONFLICT DO NOTHING""",
            (donor_id, json.dumps(sub.model_dump(), sort_keys=True)))
    return {"saved": True}


@router.get("/donors/{donor_id}/telegram")
async def telegram_link(donor_id: int):
    return {"enabled": notify.telegram_enabled(), "link": notify.telegram_link(donor_id)}


class Availability(BaseModel):
    available: bool


@router.get("/donors/{donor_id}")
async def donor_profile(donor_id: int):
    """Everything the donor home page shows at the top."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT d.user_id AS donor_id, u.full_name, d.blood_group, c.name AS campus,
                      d.is_available, d.next_eligible_date,
                      (SELECT max(donated_on) FROM donation WHERE donor_id = d.user_id) AS last_donated,
                      (SELECT count(*) FROM donation WHERE donor_id = d.user_id) AS donations,
                      EXISTS (SELECT 1 FROM notification_channel n WHERE n.user_id = d.user_id
                              AND n.channel_type = 'web_push' AND n.is_active) AS web_push,
                      EXISTS (SELECT 1 FROM notification_channel n WHERE n.user_id = d.user_id
                              AND n.channel_type = 'telegram' AND n.is_active) AS telegram
                 FROM donor d JOIN app_user u USING (user_id) LEFT JOIN campus c USING (campus_id)
                WHERE d.user_id = %s""", (donor_id,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, {"error": "donor_not_found", "message": "Unknown donor"})
    return row


@router.post("/donors/{donor_id}/availability")
async def set_availability(donor_id: int, body: Availability):
    """The donor's own on/off switch. Unavailable donors are never alerted (trg_check_donor_eligibility)."""
    async with db.tx() as conn:
        await _donor_exists(conn, donor_id)
        await conn.execute("UPDATE donor SET is_available = %s WHERE user_id = %s", (body.available, donor_id))
    return {"available": body.available}


@router.get("/donors/{donor_id}/alerts")
async def donor_alerts(donor_id: int):
    """The donor's inbox: works even when no push or Telegram is set up."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT a.request_id, a.distance_km, a.response, a.sent_at, a.seen_at,
                      r.blood_group, r.urgency, r.needed_by, r.status AS request_status, h.name AS hospital
                 FROM donor_alert a JOIN blood_request r USING (request_id) JOIN hospital h USING (hospital_id)
                WHERE a.donor_id = %s ORDER BY a.sent_at DESC LIMIT 20""", (donor_id,))
        return await cur.fetchall()
