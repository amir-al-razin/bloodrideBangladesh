# BloodRide: Sprint 1 prototype

The first slice of BloodRide: **request → slip check → search → alert → accept**, with a live board.

A patient scans a hospital’s QR poster, continues as a guest, fills the form and uploads the doctor’s slip.
As soon as the slip is uploaded, the database finds eligible donors nearby (PostGIS, 90-day rule) and alerts them by web push, Telegram and the in-app inbox.
The slip is also read (OCR + `auto_check_slip`) and the result is kept for the admin, who can reject a fake slip and stop the request.
The first donor to accept wins; later donors become backups.
The patient watches alerted / seen / declined / accepted update live on a private link.

Stack: PostgreSQL 18 + PostGIS 3.7 · FastAPI · Next.js 16 · psycopg 3 · LISTEN/NOTIFY → server-sent events. Full list: [TECH_STACK.md](TECH_STACK.md).

## Setup (Windows, once)

You need PostgreSQL 18 with PostGIS 3.7, Python 3.12+ and Node 20+.

1. **PostGIS.** Install it on PostgreSQL 18 with Stack Builder (Spatial Extensions → PostGIS 3.7), or with the official bundle from download.osgeo.org/postgis/windows/pg18/.
   - Do **not** overwrite PostgreSQL’s own DLLs (libssl, libcrypto, zlib and others) if asked.
2. **Database.** This runs a small server inside the project folder, on port 5433, with no password:
   ```powershell
   .\scripts\db.ps1 init
   ```
   It creates `.pgdata/`, starts the server and builds the database from `db/*.sql`.
3. **Backend.**
   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   copy .env.example .env
   ```
4. **Frontend.**
   ```powershell
   cd frontend
   npm install
   ```

## Run

**One command** (from the `bloodride` folder), or double-click `run.cmd`:

```powershell
.\run.cmd            # database + API + website, then open http://localhost:3000
.\run.cmd -Keep      # keep last run's data (by default each run starts from a fresh database)
.\run.cmd -Prod      # build the website and run it in production mode
```

The first run also sets things up:
- the database server (`.pgdata`);
- the Python environment and `backend\.env`;
- the npm packages.

Press **Ctrl+C** to stop the API and the website. The database keeps running; stop it with `.\scripts\db.ps1 stop`. You still need PostgreSQL 18 with PostGIS installed, plus Python and Node (Setup above).

**By hand** (three terminals), if you want to restart one part on its own:

```powershell
.\scripts\db.ps1 start                        # database (after a restart of the PC)
cd backend;  .venv\Scripts\python run.py      # API on http://localhost:8000
cd frontend; npm run dev                      # site on http://localhost:3000
```

Use `run.py`, not plain `uvicorn`: on Windows, psycopg’s async mode needs the selector event loop.

## The Sprint 1 demo

1. Open **http://localhost:3000**, pick *Dhaka Medical College Hospital* (or open its QR poster and scan it).
2. **Continue as guest**:
   - Enter any name and an `01…` number, choose **AB-**, 1 bag.
   - Upload a slip. To make one, run `backend\.venv\Scripts\python backend\tests\make_sample_slip.py slip.png`.
3. The tracking page opens and the alerts have already gone out.
   - Slips the OCR could not read (all of them, if Tesseract isn't installed) appear on **/admin**. The key is `ADMIN_KEY` from `.env`, default `change-me`.
   - There you can mark a slip genuine, or reject a fake one, which stops the request.
4. On two phones or two browser windows, open **/donor** and pick **Demo Donor One** and **Demo Donor Two**.
   - Each shows the alert in its inbox; web push or Telegram works if you set it up.
   - Press **I can donate** on both. One wins, the other becomes a backup.
   - The tracking page updates by itself.

Phones on the same Wi-Fi:
- Run `npm run dev -- -H 0.0.0.0` with `ALLOWED_DEV_ORIGINS=<pc-ip>`, then open `http://<pc-ip>:3000`.
- Web push needs HTTPS (localhost is fine), so on phones use Telegram or the inbox.

## Checks

```powershell
cd backend; .venv\Scripts\python -m pytest -q        # 18 tests: race, triggers, slip check, NOTIFY
psql -p 5433 -U postgres -d bloodride -f db/smoke_test.sql   # the whole flow in SQL, rolled back
bash scripts/api_flow.sh                                     # the whole flow through the API
.\scripts\db.ps1 reset                                       # rebuild the database from scratch
```

## Optional parts

- **Tesseract OCR** (auto-verify slips): install it from the UB Mannheim Windows build, then restart the API. Without it, every slip goes to admin review.
- **Telegram:**
  - Create a bot with @BotFather.
  - Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in `backend/.env` and restart the API.
  - On /donor, press **Link Telegram**.

## Where things are

| Path | What | Owner |
|---|---|---|
| `db/schema.sql` | 16 tables from Team15_ERD | Saa’d |
| `db/seed.sql` | 3 hospitals, 3 campuses, 302 donors, riders, fare rate | Saa’d |
| `db/triggers.sql` | 90-day rule, slip rule, audit trail, live-board NOTIFY | Razin |
| `db/routines.sql` | `submit_request`, `donors_in_ring`, `send_alert_wave` (cursor) | Mostafa |
| | `accept_request` (row lock) | Farhan |
| | `auto_check_slip` | Ayman |
| `db/views.sql` | `v_request_progress`, `v_slip_review_queue` | Abir |
| `backend/app/routes/requests.py` | request API | Mostafa |
| `backend/app/routes/alerts.py` | seen / accept / decline API | Farhan |
| `backend/app/routes/track.py` | live board (SSE) | Abir |
| `backend/app/notify.py`, `slip_check.py` | web push, Telegram, OCR | Ayman |
| `backend/tests/` | race test and rule tests | Farhan |
| `frontend/app/request/` | QR request form | Abir |
| `frontend/app/track/` | live board | Abir |
| `frontend/app/alert/` | donor alert page | Farhan |
| `frontend/app/donor/` | donor demo page | Ayman |
| `frontend/public/sw.js` | push service worker | Ayman |

## Known limits (planned for later sprints)

- No sign-in yet (Sprint 2). The donor page lets you pick a sample donor, and alert pages are addressed by request and donor id.
- Only the first alert round runs. The widening search on a timer is Sprint 2.
- `/admin` is protected by a shared key until admin login exists (Sprint 2).
- Each open tracking page holds one database connection for LISTEN. That's fine for a demo; Sprint 5 makes it scale.
