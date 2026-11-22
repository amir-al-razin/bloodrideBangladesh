# BloodRide tech stack

| Layer | Choice | Why |
|---|---|---|
| Database | **PostgreSQL 18 + PostGIS 3.7** | Triggers, procedures, cursors, row locks and LISTEN/NOTIFY for the DBMS lab; PostGIS for "donors within X km, nearest first" |
| Backend | **Python 3 + FastAPI** (uvicorn) | Small, fast to write, async (needed for server-sent events) |
| DB driver | **psycopg 3** (+ psycopg_pool) | Plain SQL, calls our procedures directly; async LISTEN for the live board |
| Frontend | **Next.js** (React, TypeScript) | Pages for patient, donor, admin; works on a phone browser |
| Live board | **PostgreSQL LISTEN/NOTIFY → server-sent events (SSE)** | A trigger fires on every alert change; the open page updates without refreshing |
| Alerts | **Web push** (pywebpush + VAPID, service worker) and **Telegram Bot API** | Free; web push works on phones over HTTPS or localhost; Telegram works everywhere |
| Slip check | **Tesseract OCR** (pytesseract) + SQL function `auto_check_slip` | OCR reads the slip in Python; the database decides auto_verified / needs_review |
| QR posters | `qrcode` (npm) | One poster per hospital, opens the request form with the hospital filled in |
| Tests | **pytest** | Includes the race test: two donors accept at the same moment, exactly one wins |
| Version control | **Git + GitHub** | One repository, one folder per layer |
| Later sprints | OSRM (fare quote), Apache Kafka + Leaflet (rider map), bKash sandbox | Not needed for Sprint 1 |

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
