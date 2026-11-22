"""The patient's private tracking page and its live updates. Owner: Abir.

The trigger trg_notify_live_board sends NOTIFY live_board '<request_id>' whenever an alert or
the request changes. Each open page holds a server-sent-events stream; this endpoint LISTENs and
pushes a fresh snapshot of v_request_progress when its request id comes through.
"""
import asyncio
import json

import psycopg
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from psycopg.rows import dict_row

from .. import db
from ..config import DATABASE_URL

router = APIRouter(prefix="/api/track")


async def snapshot(conn, token: str) -> dict | None:
    cur = await conn.execute("SELECT * FROM v_request_progress WHERE tracking_token = %s", (token,))
    board = await cur.fetchone()
    if not board:
        return None
    cur = await conn.execute(
        """SELECT u.full_name AS donor, a.distance_km, m.phone_shared,
                  CASE WHEN m.phone_shared THEN u.phone END AS phone, m.status AS mission_status
             FROM mission m
             JOIN donor_alert a USING (request_id, donor_id)
             JOIN app_user u ON u.user_id = m.donor_id
            WHERE m.request_id = %s AND m.status NOT IN ('cancelled', 'failed_screening')
            ORDER BY m.created_at""", (board["request_id"],))
    board["donors"] = await cur.fetchall()
    board.pop("tracking_token")
    return json.loads(json.dumps(board, default=str))         # timestamps and numerics as text


@router.get("/{token}")
async def track(token: str):
    async with db.pool.connection() as conn:
        board = await snapshot(conn, token)
    if not board:
        raise HTTPException(404, {"error": "not_found", "message": "No request with this link"})
    return board


@router.get("/{token}/events")
async def track_events(token: str):
    async with db.pool.connection() as conn:
        first = await snapshot(conn, token)
    if not first:
        raise HTTPException(404, {"error": "not_found", "message": "No request with this link"})
    request_id = str(first["request_id"])

    async def stream():
        yield f"data: {json.dumps(first)}\n\n"
        listen = await psycopg.AsyncConnection.connect(DATABASE_URL, autocommit=True, row_factory=dict_row)
        try:
            await listen.execute("LISTEN live_board")
            # Starlette cancels this generator when the browser goes away, so loop until then.
            while True:
                changed = False
                async for note in listen.notifies(timeout=15):   # wake every 15 s to send a heartbeat
                    if note.payload == request_id:
                        changed = True
                        break
                if changed:
                    board = await snapshot(listen, token)
                    yield f"data: {json.dumps(board)}\n\n"
                else:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await listen.close()

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
