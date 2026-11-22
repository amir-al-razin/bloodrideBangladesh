"""Hospitals and blood requests. Owner: Mostafa.

POST /api/requests is the whole first half of the flow:
save slip + request (guest account if needed) -> first alert round at once -> OCR + auto_check_slip
(the check is recorded for the admin; since 22 Nov it no longer holds the alerts back).
"""
import asyncio
import hashlib
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .. import db, notify, slip_check
from ..config import ALERT_BATCH, ALERT_RADIUS_KM, MAX_SLIP_BYTES, UPLOAD_DIR

router = APIRouter(prefix="/api")
DHAKA = timezone(timedelta(hours=6))                       # Bangladesh has no daylight saving
GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


@router.get("/hospitals")
async def hospitals():
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            "SELECT hospital_id, name, address FROM hospital ORDER BY hospital_id")
        return await cur.fetchall()


@router.get("/hospitals/{hospital_id}")
async def hospital(hospital_id: int):
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            "SELECT hospital_id, name, address FROM hospital WHERE hospital_id = %s", (hospital_id,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, {"error": "hospital_not_found", "message": "Unknown hospital"})
    return row


@router.get("/hospitals/{hospital_id}/donors")
async def donors_near_hospital(hospital_id: int):
    """Eligible, available donors per blood group within the first-round radius of a hospital.
    Same rules as donors_in_ring (90-day wait, availability), so the number is who would be alerted."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT g.blood_group, count(d.user_id) AS nearby
                 FROM unnest(ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-']) AS g(blood_group)
                 CROSS JOIN (SELECT location FROM hospital WHERE hospital_id = %s) h
                 LEFT JOIN donor d
                        ON d.blood_group = g.blood_group AND d.is_available
                       AND (d.next_eligible_date IS NULL OR d.next_eligible_date <= current_date)
                       AND ST_DWithin(d.home_location, h.location, %s * 1000)
                GROUP BY g.blood_group""", (hospital_id, ALERT_RADIUS_KM))
        rows = await cur.fetchall()
    if not rows:
        raise HTTPException(404, {"error": "hospital_not_found", "message": "Unknown hospital"})
    return {"radius_km": ALERT_RADIUS_KM, "groups": {r["blood_group"]: r["nearby"] for r in rows}}


async def start_alert_round(request_id: int) -> dict:
    """Run send_alert_wave (round 1 radius) and send the alerts. Used here and by the admin review."""
    async with db.tx() as conn:
        cur = await conn.execute("CALL send_alert_wave(%s::int, %s::numeric, %s::int)",
                                 (request_id, ALERT_RADIUS_KM, ALERT_BATCH))
        res = await cur.fetchone()
    if res["p_alerted"]:
        task = asyncio.create_task(notify.alert_round(request_id, res["p_round"]))
        _sending.add(task)                     # keep a reference until it finishes
        task.add_done_callback(_sending.discard)
    return {"round": res["p_round"], "alerted": res["p_alerted"]}


_sending: set[asyncio.Task] = set()


@router.post("/requests", status_code=201)
async def create_request(
    hospital_id: int = Form(...),
    full_name: str = Form(..., min_length=2, max_length=80),
    phone: str = Form(...),
    blood_group: str = Form(...),
    bags_needed: int = Form(..., ge=1, le=10),
    urgency: str = Form(...),
    needed_by: str = Form(...),             # from <input type="datetime-local">, Dhaka time
    slip: UploadFile = File(...),
):
    phone = re.sub(r"[\s-]", "", phone).removeprefix("+88")
    if not re.fullmatch(r"01[3-9]\d{8}", phone):
        raise HTTPException(422, {"error": "bad_phone", "message": "Enter an 11-digit mobile number, like 01712345678"})
    if blood_group not in GROUPS:
        raise HTTPException(422, {"error": "bad_blood_group", "message": "Choose a blood group"})
    if urgency not in ("emergency", "urgent", "scheduled"):
        raise HTTPException(422, {"error": "bad_urgency", "message": "Choose how urgent it is"})
    try:
        when = datetime.fromisoformat(needed_by)
    except ValueError:
        raise HTTPException(422, {"error": "bad_time", "message": "Enter when the blood is needed"})
    if when.tzinfo is None:
        when = when.replace(tzinfo=DHAKA)
    if when < datetime.now(DHAKA) - timedelta(hours=1):
        raise HTTPException(422, {"error": "bad_time", "message": "The time needed is in the past"})

    if not (slip.content_type or "").startswith("image/"):
        raise HTTPException(422, {"error": "bad_slip", "message": "Upload a photo of the doctor's slip"})
    data = await slip.read()
    if not data or len(data) > MAX_SLIP_BYTES:
        raise HTTPException(422, {"error": "bad_slip", "message": "The photo must be under 8 MB"})

    digest = hashlib.sha256(data).hexdigest()
    ext = {"image/png": ".png", "image/webp": ".webp"}.get(slip.content_type, ".jpg")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path = UPLOAD_DIR / f"{digest}{ext}"

    async with db.tx() as conn:
        cur = await conn.execute(
            "CALL submit_request(%s::int, %s, %s, %s, %s::int, %s, %s::timestamptz, %s, %s)",
            (hospital_id, full_name.strip(), phone, blood_group, bags_needed, urgency, when,
             str(path), digest))
        created = await cur.fetchone()
    path.write_bytes(data)                     # only after the database accepted it (not a reused slip)

    request_id, token = created["p_request_id"], created["p_token"]
    wave = await start_alert_round(request_id)          # everything opens once the slip is uploaded

    # then read the slip; the result is only recorded for the admin (it does not hold alerts back)
    text = await asyncio.to_thread(slip_check.read_slip, str(path))
    async with db.tx() as conn:
        cur = await conn.execute(
            """SELECT c.check_status, c.failed_checks
                 FROM blood_request r, auto_check_slip(r.slip_id, %s::text) c
                WHERE r.request_id = %s""", (text, request_id))
        check = await cur.fetchone()

    return {"request_id": request_id, "tracking_token": token,
            "slip_status": check["check_status"], "failed_checks": check["failed_checks"],
            "ocr_available": slip_check.ocr_available(), **wave}
