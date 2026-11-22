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

# first alert round (Sprint 2 adds the timer that widens the radius)
ALERT_RADIUS_KM = float(os.getenv("ALERT_RADIUS_KM", "10"))
ALERT_BATCH = int(os.getenv("ALERT_BATCH", "10"))

# demo admin: the seeded admin user and a shared key for the admin page (real login is Sprint 2)
ADMIN_USER_ID = int(os.getenv("ADMIN_USER_ID", "1"))
ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me")

# web push (VAPID keys are generated on first run if missing)
VAPID_DIR = Path(os.getenv("VAPID_DIR", BASE_DIR / ".vapid"))
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:alerts@bloodride.invalid")

# Telegram (optional; leave empty to skip)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "")
LINK_SECRET = os.getenv("LINK_SECRET", "dev-link-secret")

# OCR: path to tesseract.exe if it is not on PATH
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
