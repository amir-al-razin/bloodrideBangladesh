"""Donor alerts by web push and Telegram. Owner: Ayman.

Every alert is also printed to the server log, so the demo works even with no channel set up.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import logging

import httpx
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from . import db
from .config import (FRONTEND_URL, LINK_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME,
                     VAPID_DIR, VAPID_SUBJECT)

log = logging.getLogger("bloodride.notify")

# ---------------------------------------------------------------- web push keys
VAPID_DIR.mkdir(parents=True, exist_ok=True)
_PRIVATE = VAPID_DIR / "private_key.pem"
if not _PRIVATE.exists():
    _v = Vapid()
    _v.generate_keys()
    _v.save_key(str(_PRIVATE))
_vapid = Vapid.from_file(str(_PRIVATE))
_raw_public = _vapid.public_key.public_bytes(serialization.Encoding.X962,
                                             serialization.PublicFormat.UncompressedPoint)
VAPID_PUBLIC_KEY = base64.urlsafe_b64encode(_raw_public).rstrip(b"=").decode()


def _send_push(subscription: dict, payload: dict) -> bool:
    try:
        webpush(subscription_info=subscription, data=json.dumps(payload),
                vapid_private_key=str(_PRIVATE), vapid_claims={"sub": VAPID_SUBJECT}, ttl=3600)
        return True
    except WebPushException as exc:
        log.warning("web push failed: %s", exc)
        return False


# ---------------------------------------------------------------- Telegram
TG_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


def telegram_enabled() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


def link_code(donor_id: int) -> str:
    """A code only the server can make, so nobody can link someone else's Telegram."""
    sig = hmac.new(LINK_SECRET.encode(), str(donor_id).encode(), hashlib.sha256).hexdigest()[:10]
    return f"{donor_id}_{sig}"


def telegram_link(donor_id: int) -> str | None:
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME):
        return None
    return f"https://t.me/{TELEGRAM_BOT_USERNAME}?start={link_code(donor_id)}"


async def _tg_send(client: httpx.AsyncClient, chat_id: str, text: str) -> bool:
    try:
        r = await client.post(f"{TG_API}/sendMessage",
                              json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True})
        return r.status_code == 200
    except httpx.HTTPError as exc:
        log.warning("telegram send failed: %s", exc)
        return False


async def telegram_poller() -> None:
    """Long-polls the bot for '/start <code>' and links that chat to the donor."""
    if not TELEGRAM_BOT_TOKEN:
        return
    offset = 0
    async with httpx.AsyncClient(timeout=40) as client:
        while True:
            try:
                r = await client.get(f"{TG_API}/getUpdates", params={"timeout": 30, "offset": offset})
                for upd in r.json().get("result", []):
                    offset = upd["update_id"] + 1
                    msg = upd.get("message") or {}
                    text, chat = msg.get("text", ""), str(msg.get("chat", {}).get("id", ""))
                    if not text.startswith("/start"):
                        continue
                    code = text.partition(" ")[2].strip()
                    donor_id = code.split("_")[0]
                    if donor_id.isdigit() and hmac.compare_digest(code, link_code(int(donor_id))):
                        async with db.pool.connection() as conn:
                            await conn.execute(
                                """INSERT INTO notification_channel (user_id, channel_type, address)
                                   VALUES (%s, 'telegram', %s) ON CONFLICT DO NOTHING""",
                                (int(donor_id), chat))
                        await _tg_send(client, chat, "BloodRide alerts are now on for this chat")
                    else:
                        await _tg_send(client, chat, "Open BloodRide and use the 'Link Telegram' button")
            except asyncio.CancelledError:
                raise
            except Exception as exc:                       # keep polling through network hiccups
                log.warning("telegram poll error: %s", exc)
                await asyncio.sleep(5)


# ---------------------------------------------------------------- sending one alert round
async def alert_round(request_id: int, round_no: int) -> int:
    """Send round `round_no` of a request to every alerted donor's channels. Returns messages sent."""
    async with db.pool.connection() as conn:
        cur = await conn.execute(
            """SELECT a.donor_id, a.distance_km, u.full_name, r.blood_group, r.bags_needed,
                      r.urgency, r.needed_by, h.name AS hospital,
                      coalesce(json_agg(json_build_object('type', c.channel_type, 'address', c.address))
                               FILTER (WHERE c.channel_id IS NOT NULL), '[]') AS channels
                 FROM donor_alert a
                 JOIN app_user u ON u.user_id = a.donor_id
                 JOIN blood_request r USING (request_id)
                 JOIN hospital h USING (hospital_id)
                 LEFT JOIN notification_channel c ON c.user_id = a.donor_id AND c.is_active
                WHERE a.request_id = %s AND a.round_no = %s
                GROUP BY a.donor_id, a.distance_km, u.full_name, r.request_id, h.name""",
            (request_id, round_no))
        rows = await cur.fetchall()

    sent = 0
    async with httpx.AsyncClient(timeout=10) as client:
        for row in rows:
            url = f"{FRONTEND_URL}/alert/{request_id}/{row['donor_id']}"
            title = f"{row['blood_group']} blood needed ({row['urgency']})"
            body = f"{row['hospital']}, {row['distance_km']} km from you. Can you donate?"
            log.info("[alert] round %s -> %s (%s km): %s", round_no, row["full_name"], row["distance_km"], url)
            for ch in row["channels"]:
                if ch["type"] == "web_push":
                    ok = await asyncio.to_thread(_send_push, json.loads(ch["address"]),
                                                 {"title": title, "body": body, "url": url})
                elif ch["type"] == "telegram" and TELEGRAM_BOT_TOKEN:
                    ok = await _tg_send(client, ch["address"], f"BloodRide: {title}\n{body}\n{url}")
                else:
                    ok = False
                sent += ok
    return sent
