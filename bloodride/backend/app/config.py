"""Settings, read from environment variables or backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5433/bloodride")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", FRONTEND_URL).split(",") if o.strip()]

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
MAX_SLIP_BYTES = 8 * 1024 * 1024

# the search: round 1 alerts the nearest donors within the first radius; if nobody accepts within
# WAVE_MINUTES, the next round alerts more donors further out, up to the last radius.
ALERT_RADII_KM = [float(r) for r in os.getenv("ALERT_RADII_KM", "5,10,20,35").split(",")]
ALERT_RADIUS_KM = ALERT_RADII_KM[0]
ALERT_BATCH = int(os.getenv("ALERT_BATCH", "10"))
WAVE_MINUTES = float(os.getenv("WAVE_MINUTES", "5"))

# minutes the hospital has to approve or reject before the BloodRide team is alerted
APPROVAL_MINUTES = {
    "emergency": int(os.getenv("APPROVE_EMERGENCY_MIN", "5")),
    "urgent": int(os.getenv("APPROVE_URGENT_MIN", "15")),
    "scheduled": int(os.getenv("APPROVE_SCHEDULED_MIN", "60")),
}

# sign-in cookie
SESSION_COOKIE = "br_session"
COOKIE_SECURE = FRONTEND_URL.startswith("https://")

# web push (VAPID keys are generated on first run if missing)
VAPID_DIR = Path(os.getenv("VAPID_DIR", BASE_DIR / ".vapid"))
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:alerts@bloodride.invalid")

# Telegram (optional; leave empty to skip)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "")
LINK_SECRET = os.getenv("LINK_SECRET", "dev-link-secret")

# OCR: path to tesseract.exe if it is not on PATH
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
