# BloodRide tech stack

| Layer | Choice | Why |
|---|---|---|
| Database | **PostgreSQL 18 + PostGIS 3.7** | Triggers, procedures, cursors, row locks and LISTEN/NOTIFY for the DBMS lab; PostGIS for "donors within X km, nearest first" |
| Backend | **Python 3 + FastAPI** (uvicorn) | Small, fast to write, async (needed for server-sent events) |
| DB driver | **psycopg 3** (+ psycopg_pool) | Plain SQL, calls our procedures directly; async LISTEN for the live board |
| Frontend | **Next.js** (React, TypeScript) | Pages for patient, donor, hospital staff; works on a phone browser |
| Live board | **PostgreSQL LISTEN/NOTIFY → server-sent events (SSE)** | A trigger fires on every alert change; the open page updates without refreshing |
| Alerts | **Web push** (pywebpush + VAPID, service worker) and **Telegram Bot API** | Free; web push works on phones over HTTPS or localhost; Telegram works everywhere |
| Approval | Hospital staff sign in and approve each request; trigger `trg_require_approved_slip` blocks alerts until then | A person checks the slip. OCR (Tesseract + `auto_check_slip`) only gives them a hint |
| Sign-in | Phone + password, bcrypt hashes with **pgcrypto**, session cookie | Donors and staff have real accounts; patients never need one |
| QR posters | `qrcode` (npm) | One poster per hospital, opens the request form with the hospital filled in |
| Tests | **pytest** | Includes the race test: two donors accept at the same moment, exactly one wins |
| Version control | **Git + GitHub** | One repository, one folder per layer |
| Later (Stage 2) | OSRM (fare quote), Leaflet (rider map), bKash sandbox | Parked until Stage 1 is in real use. Kafka dropped: LISTEN/NOTIFY is enough at our size |

## Folder layout

```
bloodride/
├── db/          schema.sql, triggers.sql, routines.sql, views.sql, seed.sql, build.sql
├── backend/     FastAPI app (app/), tests/, requirements.txt, .env.example
├── frontend/    Next.js app
└── scripts/     database setup helpers
```

## Who works where (Sprint 1)

| Member | Folder |
|---|---|
| Saa'd | `db/schema.sql`, `db/seed.sql`, repo and setup |
| Razin | `db/triggers.sql` |
| Mostafa | `db/routines.sql` (search, alert wave), `backend/app/routes/requests.py` |
| Farhan | `accept_request` in `db/routines.sql`, `backend/app/routes/alerts.py`, `frontend/app/alert/`, `backend/tests/` |
| Ayman | `backend/app/notify.py`, `backend/app/slip_check.py`, `frontend/public/sw.js` |
| Abir | `frontend/app/request/`, `frontend/app/track/`, `backend/app/routes/track.py` |
