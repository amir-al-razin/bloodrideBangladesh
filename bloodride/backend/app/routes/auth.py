"""Sign in, sign out, who am I, and donor sign-up."""
import re

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .. import db
from ..auth import any_user
from ..config import COOKIE_SECURE, SESSION_COOKIE

router = APIRouter(prefix="/api/auth")
GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


def clean_phone(phone: str) -> str:
    phone = re.sub(r"[\s-]", "", phone).removeprefix("+88")
    if not re.fullmatch(r"01[3-9]\d{8}", phone):
        raise HTTPException(422, {"error": "bad_phone", "message": "Enter an 11-digit mobile number, like 01712345678"})
    return phone


class Login(BaseModel):
    phone: str
    password: str


class Signup(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    phone: str
    password: str = Field(min_length=6, max_length=100)
    blood_group: str
    lat: float = Field(ge=20.5, le=26.7)          # inside Bangladesh
    lng: float = Field(ge=88.0, le=92.7)
    campus_id: int | None = None
    listed_for_reveal: bool = False


async def _open_session(response: Response, phone: str, password: str) -> dict:
    async with db.tx() as conn:
        cur = await conn.execute("SELECT * FROM start_session(%s, %s)", (phone, password))
        row = await cur.fetchone()
    response.set_cookie(SESSION_COOKIE, row["token"], max_age=30 * 24 * 3600, httponly=True,
                        samesite="lax", secure=COOKIE_SECURE, path="/")
    return {"user_id": row["user_id"], "account_type": row["account_type"]}


@router.post("/login")
async def login(body: Login, response: Response):
    return await _open_session(response, clean_phone(body.phone), body.password)


@router.post("/logout")
async def logout(response: Response, br_session: str | None = Cookie(None)):
    if br_session:
        async with db.tx() as conn:
            await conn.execute("DELETE FROM user_session WHERE token = %s", (br_session,))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"signed_out": True}


@router.get("/me")
async def me(user: dict = Depends(any_user)):
    return user


@router.post("/signup", status_code=201)
async def signup(body: Signup, response: Response):
    phone = clean_phone(body.phone)
    if body.blood_group not in GROUPS:
        raise HTTPException(422, {"error": "bad_blood_group", "message": "Choose your blood group"})
    async with db.tx() as conn:
        await conn.execute(
            "CALL register_donor(%s, %s, %s, %s, %s, %s, %s, %s)",
            (body.full_name.strip(), phone, body.password, body.blood_group,
             body.lat, body.lng, body.campus_id, body.listed_for_reveal))
    return await _open_session(response, phone, body.password)
