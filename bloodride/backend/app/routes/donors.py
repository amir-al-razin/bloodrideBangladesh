"""Donor dashboard: profile, settings, donation history, "I donated elsewhere", who saw my number,
alerts, and the alert channels. Owner: Ayman (channels) with Abir (pages).
Real sign-in arrives in Sprint 2; until then the donor page lets you choose a seeded donor.
"""
import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, notify

router = APIRouter(prefix="/api")


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class Settings(BaseModel):
    """Only the fields that are sent are changed."""
    is_available: bool | None = None
    listed_for_reveal: bool | None = None
    campus_id: int | None = None
    clear_campus: bool = False


class SelfReport(BaseModel):
    donated_on: date


def _json(data):
    return json.loads(json.dumps(data, default=str))         # dates and numerics as text


async def _donor_exists(conn, donor_id: int) -> None:
    cur = await conn.execute("SELECT 1 FROM donor WHERE user_id = %s", (donor_id,))
    if not await cur.fetchone():
        raise HTTPException(404, {"error": "donor_not_found", "message": "Unknown donor"})


@router.get("/push/public-key")
async def push_public_key():
    return {"public_key": notify.VAPID_PUBLIC_KEY}


@router.get("/campuses")
async def campuses():
    async with db.pool.connection() as conn:
        cur = await conn.execute("SELECT campus_id, name FROM campus ORDER BY name")
        return await cur.fetchall()


@router.get("/demo/donors")
async def demo_donors():
    """The two named demo donors first, then a few AB- donors (the demo request's group)."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT d.user_id AS donor_id, u.full_name, d.blood_group
                 FROM donor d JOIN app_user u USING (user_id)
                WHERE u.phone LIKE '018%' OR d.blood_group = 'AB-'
                ORDER BY (u.phone LIKE '018%') DESC, d.user_id
                LIMIT 12""")
        return await cur.fetchall()


@router.get("/donors/{donor_id}")
async def donor_profile(donor_id: int):
    """Everything the dashboard shows at the top and in Settings."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT d.user_id AS donor_id, u.full_name, u.phone, d.blood_group, u.campus_id, c.name AS campus,
                      d.is_available, d.listed_for_reveal, d.next_eligible_date, u.created_at AS member_since,
                      (SELECT max(donated_on) FROM donation WHERE donor_id = d.user_id) AS last_donated,
                      (SELECT count(*) FROM donation WHERE donor_id = d.user_id) AS donations,
                      (SELECT count(*) FROM contact_reveal WHERE donor_id = d.user_id) AS times_shown,
                      EXISTS (SELECT 1 FROM notification_channel n WHERE n.user_id = d.user_id
                              AND n.channel_type = 'web_push' AND n.is_active) AS web_push,
                      EXISTS (SELECT 1 FROM notification_channel n WHERE n.user_id = d.user_id
                              AND n.channel_type = 'telegram' AND n.is_active) AS telegram
                 FROM donor d JOIN app_user u USING (user_id) LEFT JOIN campus c USING (campus_id)
                WHERE d.user_id = %s""", (donor_id,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, {"error": "donor_not_found", "message": "Unknown donor"})
    return _json(row)


@router.post("/donors/{donor_id}/settings")
async def update_settings(donor_id: int, body: Settings):
    """Availability (unavailable donors are never alerted, trg_check_donor_eligibility), showing the number
    to verified patients (unlocked_donors), and campus."""
    async with db.tx() as conn:
        await _donor_exists(conn, donor_id)
        if body.is_available is not None:
            await conn.execute("UPDATE donor SET is_available = %s WHERE user_id = %s", (body.is_available, donor_id))
        if body.listed_for_reveal is not None:
            await conn.execute("UPDATE donor SET listed_for_reveal = %s WHERE user_id = %s",
                               (body.listed_for_reveal, donor_id))
        if body.clear_campus:
            await conn.execute("UPDATE app_user SET campus_id = NULL WHERE user_id = %s", (donor_id,))
        elif body.campus_id is not None:
            await conn.execute("UPDATE app_user SET campus_id = %s WHERE user_id = %s", (body.campus_id, donor_id))
    return await donor_profile(donor_id)


@router.get("/donors/{donor_id}/history")
async def donor_history(donor_id: int):
    """Donations (through BloodRide or reported) and the requests this donor accepted."""
    async with db.pool.connection() as conn:
        await _donor_exists(conn, donor_id)
        cur = await conn.execute(
            """SELECT dn.donation_id, dn.donated_on, dn.source, h.name AS hospital, r.blood_group
                 FROM donation dn
                 LEFT JOIN mission m USING (mission_id)
                 LEFT JOIN blood_request r ON r.request_id = m.request_id
                 LEFT JOIN hospital h ON h.hospital_id = r.hospital_id
                WHERE dn.donor_id = %s
                ORDER BY dn.donated_on DESC, dn.donation_id DESC""", (donor_id,))
        donations = await cur.fetchall()
        cur = await conn.execute(
            """SELECT m.mission_id, m.status, m.created_at, m.phone_shared, h.name AS hospital, r.blood_group
                 FROM mission m
                 JOIN blood_request r USING (request_id)
                 JOIN hospital h USING (hospital_id)
                WHERE m.donor_id = %s
                ORDER BY m.created_at DESC""", (donor_id,))
        missions = await cur.fetchall()
    return _json({"donations": donations, "missions": missions})


@router.post("/donors/{donor_id}/donations", status_code=201)
async def report_donation(donor_id: int, body: SelfReport):
    """'I donated elsewhere': a self-reported donation. trg_set_next_eligible starts the 90-day wait."""
    if body.donated_on > date.today():
        raise HTTPException(422, {"error": "bad_date", "message": "The donation date can’t be in the future"})
    if (date.today() - body.donated_on).days > 365:
        raise HTTPException(422, {"error": "bad_date", "message": "Only donations from the last 12 months are needed"})
    async with db.tx() as conn:
        await _donor_exists(conn, donor_id)
        cur = await conn.execute("SELECT 1 FROM donation WHERE donor_id = %s AND donated_on = %s",
                                 (donor_id, body.donated_on))
        if await cur.fetchone():
            raise HTTPException(409, {"error": "already_recorded", "message": "A donation on that day is already recorded"})
        await conn.execute(
            "INSERT INTO donation (donor_id, donated_on, source) VALUES (%s, %s, 'self_reported')",
            (donor_id, body.donated_on))
    return await donor_profile(donor_id)


@router.get("/donors/{donor_id}/reveals")
async def donor_reveals(donor_id: int):
    """Who saw this donor's number through 'reveal all numbers' (the donor's notice)."""
    async with db.pool.connection() as conn:
        await _donor_exists(conn, donor_id)
        cur = await conn.execute(
            """SELECT cr.revealed_at, r.blood_group, h.name AS hospital, r.status AS request_status
                 FROM contact_reveal cr
                 JOIN blood_request r USING (request_id)
                 JOIN hospital h USING (hospital_id)
                WHERE cr.donor_id = %s
                ORDER BY cr.revealed_at DESC LIMIT 50""", (donor_id,))
        return _json(await cur.fetchall())


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


@router.get("/donors/{donor_id}/alerts")
async def donor_alerts(donor_id: int):
    """The donor's inbox: works even when no push or Telegram is set up."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT a.request_id, a.distance_km, a.response, a.sent_at, a.seen_at,
                      r.blood_group, r.urgency, r.needed_by, r.status AS request_status, h.name AS hospital
                 FROM donor_alert a JOIN blood_request r USING (request_id) JOIN hospital h USING (hospital_id)
                WHERE a.donor_id = %s ORDER BY a.sent_at DESC LIMIT 20""", (donor_id,))
        return _json(await cur.fetchall())
