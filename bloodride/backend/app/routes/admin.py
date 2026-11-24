"""The BloodRide team's admin page: everything live across hospitals, hospitals and their staff logins,
and blocked phone numbers."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import db
from ..auth import admin_user
from .auth import clean_phone

router = APIRouter(prefix="/api/admin", dependencies=[Depends(admin_user)])


def _json(data):
    return json.loads(json.dumps(data, default=str))


class Hospital(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    address: str = Field(default="", max_length=200)
    lat: float = Field(ge=20.5, le=26.7)
    lng: float = Field(ge=88.0, le=92.7)


class Staff(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    phone: str
    password: str = Field(min_length=6, max_length=100)
    hospital_id: int


class Block(BaseModel):
    phone: str
    blocked: bool = True


@router.get("/overview")
async def overview():
    """Counts for the top of the page and every request from the last 48 hours, stuck ones first."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT count(*) FILTER (WHERE slip_status IN ('needs_review', 'auto_verified') AND status = 'open') AS waiting,
                      count(*) FILTER (WHERE escalated_at IS NOT NULL AND slip_status IN ('needs_review', 'auto_verified')
                                       AND status = 'open') AS overdue,
                      count(*) FILTER (WHERE status = 'searching' AND accepted = 0) AS searching,
                      count(*) FILTER (WHERE status = 'filled' AND created_at > now() - interval '24 hours') AS found_today
                 FROM v_request_progress""")
        counts = await cur.fetchone()
        cur = await conn.execute(
            """SELECT count(*) AS donors,
                      count(*) FILTER (WHERE is_available AND (next_eligible_date IS NULL OR next_eligible_date <= current_date)) AS ready
                 FROM donor""")
        counts |= await cur.fetchone()
        cur = await conn.execute(
            """SELECT p.request_id, p.tracking_token, p.hospital, p.blood_group, p.bags_needed, p.urgency, p.status,
                      p.slip_status, p.created_at, p.escalated_at, p.alerted, p.seen, p.accepted, p.rounds,
                      u.full_name AS requester, u.phone
                 FROM v_request_progress p
                 JOIN blood_request r USING (request_id)
                 JOIN app_user u ON u.user_id = r.requester_id
                WHERE p.created_at > now() - interval '48 hours'
                ORDER BY (p.escalated_at IS NOT NULL AND p.slip_status IN ('needs_review', 'auto_verified')) DESC,
                         (p.status IN ('open', 'searching')) DESC, p.created_at DESC""")
        requests = await cur.fetchall()
    return _json({"counts": counts, "requests": requests})


@router.get("/hospitals")
async def hospitals():
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT h.hospital_id, h.name, h.address,
                      coalesce(json_agg(json_build_object('user_id', u.user_id, 'full_name', u.full_name, 'phone', u.phone)
                                        ORDER BY u.full_name) FILTER (WHERE u.user_id IS NOT NULL), '[]') AS staff
                 FROM hospital h
                 LEFT JOIN hospital_staff st USING (hospital_id)
                 LEFT JOIN app_user u ON u.user_id = st.user_id
                GROUP BY h.hospital_id ORDER BY h.name""")
        return await cur.fetchall()


@router.post("/hospitals", status_code=201)
async def add_hospital(body: Hospital):
    async with db.tx() as conn:
        cur = await conn.execute(
            """INSERT INTO hospital (name, address, location)
               VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) RETURNING hospital_id""",
            (body.name.strip(), body.address.strip(), body.lng, body.lat))
        return await cur.fetchone()


@router.post("/staff", status_code=201)
async def add_staff(body: Staff):
    async with db.tx() as conn:
        cur = await conn.execute("CALL create_staff(%s, %s, %s, %s)",
                                 (body.full_name.strip(), clean_phone(body.phone), body.password, body.hospital_id))
        return {"user_id": (await cur.fetchone())["p_user_id"]}


@router.post("/staff/{user_id}/remove")
async def remove_staff(user_id: int):
    async with db.tx() as conn:
        await conn.execute("CALL remove_staff(%s)", (user_id,))
    return {"removed": user_id}


@router.get("/blocked")
async def blocked():
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT u.phone, u.full_name,
                      (SELECT count(*) FROM blood_request r WHERE r.requester_id = u.user_id) AS requests,
                      (SELECT count(*) FROM blood_request r JOIN requisition_slip s USING (slip_id)
                        WHERE r.requester_id = u.user_id AND s.check_status = 'rejected') AS rejected
                 FROM app_user u WHERE u.is_blocked ORDER BY u.phone""")
        return await cur.fetchall()


@router.post("/block")
async def block(body: Block):
    phone = clean_phone(body.phone)
    async with db.tx() as conn:
        cur = await conn.execute("UPDATE app_user SET is_blocked = %s WHERE phone = %s", (body.blocked, phone))
        if cur.rowcount == 0 and body.blocked:            # never used BloodRide yet: block it in advance
            await conn.execute("INSERT INTO app_user (full_name, phone, account_type, is_blocked)"
                               " VALUES ('Blocked number', %s, 'guest', true)", (phone,))
    return {"phone": phone, "blocked": body.blocked}
