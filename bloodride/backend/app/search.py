"""Runs every 30 seconds:
1. The widening search: for each approved request that still needs donors and whose last round went out
   more than WAVE_MINUTES ago, send the next, wider round (ALERT_RADII_KM).
2. The approval fallback: requests the hospital hasn't decided in time (APPROVAL_MINUTES) are escalated:
   staff are reminded and the BloodRide team is alerted. Nothing is approved automatically."""
import asyncio
import logging

from fastapi import HTTPException

from . import db, notify
from .config import ALERT_RADII_KM, APPROVAL_MINUTES, WAVE_MINUTES
from .routes.requests import start_alert_round

log = logging.getLogger("bloodride.search")


async def due_requests() -> list[int]:
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT r.request_id
                 FROM blood_request r JOIN requisition_slip s USING (slip_id)
                WHERE r.status = 'searching' AND s.check_status = 'verified'
                  AND r.search_round < %s
                  AND r.last_wave_at < now() - make_interval(secs => %s)
                  AND r.needed_by > now()""",
            (len(ALERT_RADII_KM), WAVE_MINUTES * 60))
        return [r["request_id"] for r in await cur.fetchall()]


async def widen_once() -> int:
    sent = 0
    for request_id in await due_requests():
        try:
            res = await start_alert_round(request_id)
            sent += 1
            log.info("request %s: round %s, %s km, %s donors alerted",
                     request_id, res["round"], res["radius_km"], res["alerted"])
        except HTTPException as exc:                  # closed meanwhile: nothing to do
            log.info("request %s skipped: %s", request_id, exc.detail)
    return sent


async def escalate_once() -> list[int]:
    async with db.tx() as conn:
        cur = await conn.execute("SELECT request_id FROM escalate_overdue_approvals(%s, %s, %s)",
                                 (APPROVAL_MINUTES["emergency"], APPROVAL_MINUTES["urgent"], APPROVAL_MINUTES["scheduled"]))
        ids = [r["request_id"] for r in await cur.fetchall()]
    for request_id in ids:
        log.info("request %s: not approved in time, BloodRide team alerted", request_id)
        await notify.approval_overdue(request_id)
    return ids


async def loop() -> None:
    while True:
        try:
            await escalate_once()
            await widen_once()
        except asyncio.CancelledError:
            raise
        except Exception as exc:                      # keep running through database hiccups
            log.warning("search loop error: %s", exc)
        await asyncio.sleep(30)
