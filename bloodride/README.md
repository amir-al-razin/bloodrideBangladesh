# BloodRide: the app

Stage 1 is built: **a request goes in, the hospital approves it, nearby donors are alerted, a donor says yes.** For the idea and the plan, read [`../PROJECT.md`](../PROJECT.md) first.

Stack: PostgreSQL + PostGIS (database), FastAPI (Python API), Next.js (website).

## Run it

**Linux or Mac** (needs Docker, Python 3.12+, Node 20+):

```bash
./run.sh            # fresh database with sample data, then API + website
./run.sh --keep     # keep last run's data
```

**Windows** (needs PostgreSQL 18 with PostGIS, Python 3.12+, Node 20+; see "Windows setup" below):

```powershell
.\run.cmd           # or: .\run.cmd -Keep
```

Then open **http://localhost:3000**.

## Demo accounts

All use the password **`bloodride123`**.

| Who | Phone | What they do |
|---|---|---|
| Dhaka Medical College blood bank | 01500000001 | Approves requests at that hospital |
| BMU blood bank | 01500000002 | Same, for BMU |
| Square Hospital blood bank | 01500000003 | Same, for Square |
| Demo Donor One (AB−) | 01800000001 | Gets alerts near Dhaka Medical |
| Demo Donor Two (AB−) | 01800000002 | Same |
| Admin | 01700000000 | `/admin`, and approves for any hospital on `/staff` |

## Try the whole flow (5 minutes)

Use two browser windows. One is normal, the other is private, so each has its own sign-in.

1. **Family:** open `/request`, choose *Dhaka Medical College Hospital*, blood group **AB−**, 1 bag. Add any photo as the slip and send it. You land on the tracking page: "Waiting for the hospital to approve".
2. **Staff:** in the other window, open `/staff`, sign in as `01500000001`. The request is there with the slip photo. Press **Approve and alert donors**.
3. **Family's page** updates by itself: approved, donors alerted.
4. **Donor:** sign out of staff, open `/donor`, sign in as `01800000001`. The request is under *Requests*. Open it and press **I can donate**.
5. **Family's page** now shows the donor with a **Call** button.

Want a test slip? `backend/.venv/bin/python backend/tests/make_sample_slip.py slip.png`

## Pages

| Page | Who | What |
|---|---|---|
| `/` | Everyone | What BloodRide is |
| `/request` | Family | The request form. The QR poster opens `/request?hospital=<id>` |
| `/track/<link>` | Family | Live progress on a private link |
| `/staff` | Hospital staff | Approve or reject requests for their hospital |
| `/donor` | Donor | Sign up, sign in, alerts, history, settings |
| `/alert/<id>` | Donor | One request: "I can donate" or "Not this time" |
| `/posters` | Hospital | Printable QR posters |
| `/admin` | BloodRide team | Live dashboard of all requests, hospitals and their staff logins, blocked phone numbers |

## How the search works

- Round 1 alerts up to 10 donors within **5 km** of the hospital, nearest first.
- If the request still needs donors 5 minutes later, the next round goes to **10 km**, then **20**, then **35**. A donor is never alerted twice for the same request.
- A donor is only alerted if they have the right blood group, are switched to "available", and are past their 90-day rest.
- All numbers are settings in `backend/.env`: `ALERT_RADII_KM`, `ALERT_BATCH`, `WAVE_MINUTES`.

## If the hospital doesn't approve in time

After 5 minutes for an emergency (15 urgent, 60 scheduled), the request is marked **overdue**:
- staff get a reminder
- every admin account gets an alert
- the request moves to the top of the staff page

An admin calls the blood bank and approves it from `/staff`, since admins can approve for any hospital. Nothing is approved automatically. The time limits are settings in `backend/.env`: `APPROVE_EMERGENCY_MIN`, `APPROVE_URGENT_MIN`, `APPROVE_SCHEDULED_MIN`.

## Checks

```bash
cd backend && .venv/bin/python -m pytest -q     # 37 tests: approval rules, overdue fallback, race, 90 days, sign-in…
bash scripts/api_flow.sh                         # the whole flow through the running site
psql -h localhost -p 5433 -U postgres -d bloodride -f db/smoke_test.sql   # the flow in SQL, rolled back
```

On Windows, use `backend\.venv\Scripts\python` instead of `backend/.venv/bin/python`.

## Where the code is

| File | What | Owner |
|---|---|---|
| `db/schema.sql` | 19 tables | Saa'd |
| `db/seed.sql` | 3 hospitals with staff, 302 donors, demo accounts | Saa'd |
| `db/triggers.sql` | 90-day rule, **no alerts before approval**, audit trail, live updates | Razin |
| `db/routines.sql` | request, search, alert rounds, accept (row lock), approval, sign-in, sign-up | Mostafa, Farhan, Razin |
| `db/views.sql` | live progress, staff queue | Abir |
| `backend/app/routes/` | API: `requests`, `staff`, `alerts`, `donors`, `track`, `auth` | Mostafa, Farhan, Abir |
| `backend/app/search.py` | the widening search on a timer | Mostafa |
| `backend/app/notify.py` | browser notifications (and Telegram, parked) | Ayman |
| `frontend/app/` | one folder per page (table above) | Abir, Farhan, Ayman |
| `frontend/app/globals.css` | the design, matching bloodridebd.com | Abir |

## Known limits

- Runs on a laptop only. Phones on the same Wi-Fi can use it, but notifications need https, so test those on the laptop.
- Browser notifications only. No phone app yet.
- The slip reader (OCR) is off unless Tesseract is installed. Staff check every slip by eye, which is the plan anyway.

## Windows setup (once)

1. **PostGIS:** install it on PostgreSQL 18 with Stack Builder (Spatial Extensions → PostGIS 3.7). If asked, don't overwrite PostgreSQL's own DLLs.
2. **Database:** `.\scripts\db.ps1 init` creates a small server in the project folder on port 5433.
3. `run.cmd` does the rest on its first run: the Python environment, `backend\.env`, and npm packages.
