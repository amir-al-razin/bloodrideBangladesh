"""Who is signed in. The session token lives in an http-only cookie; the user and their role come
from the database (user_session, app_user, hospital_staff)."""
from fastapi import Cookie, HTTPException

from . import db
from .config import SESSION_COOKIE


async def current_user(token: str | None) -> dict | None:
    if not token:
        return None
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT u.user_id, u.full_name, u.phone, u.account_type,
                      st.hospital_id, h.name AS hospital,
                      EXISTS (SELECT 1 FROM donor d WHERE d.user_id = u.user_id) AS is_donor
                 FROM user_session s
                 JOIN app_user u USING (user_id)
                 LEFT JOIN hospital_staff st ON st.user_id = u.user_id
                 LEFT JOIN hospital h ON h.hospital_id = st.hospital_id
                WHERE s.token = %s AND s.expires_at > now()""", (token,))
        return await cur.fetchone()


def _signed_out():
    return HTTPException(401, {"error": "signed_out", "message": "Please sign in"})


async def any_user(br_session: str | None = Cookie(None)) -> dict:
    user = await current_user(br_session)
    if not user:
        raise _signed_out()
    return user


async def donor_user(br_session: str | None = Cookie(None)) -> dict:
    user = await any_user(br_session)
    if not user["is_donor"]:
        raise HTTPException(403, {"error": "not_donor", "message": "This account is not a donor account"})
    return user


async def staff_user(br_session: str | None = Cookie(None)) -> dict:
    user = await any_user(br_session)
    if user["account_type"] not in ("staff", "admin"):
        raise HTTPException(403, {"error": "not_staff", "message": "Only hospital staff can open this page"})
    return user


async def admin_user(br_session: str | None = Cookie(None)) -> dict:
    user = await any_user(br_session)
    if user["account_type"] != "admin":
        raise HTTPException(403, {"error": "not_admin", "message": "Only the BloodRide team can open this page"})
    return user
