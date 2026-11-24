"""Connection pool and the mapping from database errors to HTTP errors."""
from contextlib import asynccontextmanager

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import DATABASE_URL

# check= tests each connection before handing it out, so a database restart (or db.ps1 reset)
# doesn't leave the API with dead connections.
pool = AsyncConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False,
                           kwargs={"row_factory": dict_row},
                           check=AsyncConnectionPool.check_connection)

# SQLSTATE codes raised by our triggers and procedures (db/triggers.sql, db/routines.sql)
NAMED_ERRORS = {
    "BR001": (409, "This donor cannot donate yet (inside the 90-day wait or unavailable)"),
    "BR002": (409, "The hospital has not approved this request yet"),
    "BR003": (404, "Request not found"),
    "BR004": (404, "This donor was not alerted for this request"),
    "BR005": (409, "A mission's status can only move forward"),
    "BR006": (409, "This request is closed"),
    "BR007": (409, "You have already answered this request"),
    "BR008": (403, "Only staff of this hospital can do this"),
    "BR009": (409, "Donor numbers open once the hospital has approved your request"),
    "BR010": (409, "Donor numbers are not unlocked for this request"),
    "BR011": (410, "Donor numbers are closed for this request (it ended, or 48 hours have passed)"),
    "BR012": (409, "This request was already approved or rejected"),
    "BR013": (401, "Wrong phone number or password"),
    "BR014": (409, "This phone number already has an account"),
    "BR015": (403, "This phone number is blocked from sending requests. Please contact the hospital."),
}


def http_error(err: psycopg.Error) -> HTTPException:
    """Turn a named database error into a clear HTTP error; anything else is re-raised."""
    code = err.sqlstate or ""
    name = (err.diag.message_primary or "").split(":")[0]
    if code in NAMED_ERRORS:
        status, message = NAMED_ERRORS[code]
        return HTTPException(status, {"error": name, "message": message})
    if code == "23505" and "image_hash" in (err.diag.constraint_name or "") + (err.diag.message_detail or ""):
        return HTTPException(409, {"error": "slip_reused",
                                   "message": "This slip photo was already used for another request"})
    if code in ("23514", "22P02", "23503"):
        return HTTPException(422, {"error": "invalid_input", "message": err.diag.message_primary})
    raise err


@asynccontextmanager
async def tx():
    """One connection, one transaction; named errors become HTTP errors."""
    async with pool.connection() as conn:
        try:
            async with conn.transaction():
                yield conn
        except psycopg.Error as err:
            raise http_error(err) from err
