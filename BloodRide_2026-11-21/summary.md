# BloodRide: full project summary

> **Older plan (21-23 Nov).** Some parts changed on 24 Nov: requests now wait for hospital approval before donors are alerted, and donor numbers are never sold. The current plan is in [`../PROJECT.md`](../PROJECT.md).

Last updated **22 November 2026**. This file is the single source for the current design, decisions, prototype status, open questions and risks. The detailed workflow is in `BloodRide_2026-11-21/WORKFLOW.md`. Files listed as stale in section 7.4 describe older designs; don't show them.

---

## 0. Status at a glance

| Area | Status |
|---|---|
| DBMS lab proposal (ERD, outline, slides) | Submitted earlier (16 entities). A few later decisions are not in those PDFs yet (section 8.2) |
| SD lab proposal deck | Ready for **Tue 24 Nov**. Doesn't yet mention the paid unlock or donor location (decided 22 Nov) |
| Product backlog | **63 tasks**, five two-week sprints, balanced 1–4 tasks per person per sprint |
| **Sprint 1 prototype** | **Built and working locally:** request → alerts → accept → live board, redesigned website, one-command launcher. **28/28 tests pass.** Left: real-device checks of web push and Telegram, Tesseract install, pushing to GitHub |
| Open decisions | Section 11 (team) and section 12 (later) |

---

## 1. Team, courses, calendar

| Member | ID |
|---|---|
| Sazidul Karim Saa’d | 230041204 |
| Farhan Fuad | 230041210 |
| Aminul Islam Abir | 230041216 |
| Amir Al Mohymin Razin | 230041218 |
| Mostafa Mubashir Hossain | 230041232 |
| Ayman Nazir Chowdhury | 230041242 |

- **CSE 4508 RDBMS Programming Lab (DBMS):** PostgreSQL + PostGIS. The Lab 4 proposal is done. File names keep "Team15".
- **Software Development lab (SD):** the project is just **BloodRide** (no "Team 15"). Stack: FastAPI + Next.js + PostgreSQL/PostGIS.
- **Calendar (two-week sprints):**

| Event | Date |
|---|---|
| SD proposal presentation | **Tue 24 Nov 2026** |
| Sprint 1 review (demo) | Tue 8 Dec |
| Sprint 2 review | Tue 22 Dec |
| Sprint 3 review | Tue 5 Jan 2027 |
| Sprint 4 review | Tue 19 Jan |
| Sprint 5 review / final demo | Tue 2 Feb (see question 12.1) |

---

## 2. What BloodRide is, and the full workflow

A web system for Dhaka that finds blood donors for patients and, when a donor lives far away, sends a **student volunteer on a motorbike** to take them to the hospital and back.
- The focus is students and campus clusters of volunteers.
- It is **not a charity**. It is an initiative to make donating easy, so more people are willing to donate.

### 2.1 Patient
1. **Scan** the hospital's QR poster. The form opens with the hospital filled in.
2. **No sign-up or sign-in.** Just a name and a phone number (kept as a hidden guest record).
3. **Fill the form:** blood group, bags, urgency, needed-by time. **Upload the doctor's slip.**
4. **Everything opens immediately:**
   - The alert wave goes out to eligible donors nearby.
   - The private tracking link shows alerted / seen / declined / accepted, live.
   - The slip is only uploaded. The one rule is that **the same slip photo can't be used twice**.
   - OCR reads the slip and the result is recorded for the admin. It **does not** hold alerts back.
5. **Optional: Tk 10 contact unlock** (2.5).
6. A donor accepts and may share their number. The patient calls them.
7. The donor travels alone or with a volunteer rider (2.4). Donation, rest, ride home. The request closes.

### 2.2 Donor
- **Sign-up:**
  - blood group;
  - campus;
  - home-area pin;
  - alert channels (web push, Telegram);
  - "list my number for paid unlock" (off by default).
- **Location:** each time the donor opens the site, it asks for their location once (2.6).
- **On an alert:** open it (counts as *seen*), then **I can donate** or **I can't**.
  - Accepting can share the donor's number with that patient.
  - If every bag is already taken, the button becomes **Join the backup list**.
- **First donor to accept wins; later ones become backups.** A database row lock guarantees this; it is tested with simultaneous accepts.
- **90-day rule:** a trigger sets `next_eligible_date` from the latest donation. Donors inside the wait are never alerted.
- **"I donated elsewhere"** form (self-report) also starts the 90-day wait.

### 2.3 Admin
- **Slips to check:** slips OCR couldn't read. The request is already live.
- The admin marks a slip **genuine**, or **rejects a fake one**, which cancels the request and blocks further alerts.
- Later: admin dashboard, manual rider assignment, reports.

### 2.4 Rides
- **One student volunteer** takes the donor, **waits with them**, and brings them home. Same rider both ways.
- **The fare is shown before booking**, as Pathao does: `base + per_km × km + per_min × min`, with a minimum. Exact taka.
  - Starting rates: **Tk 25 + Tk 15/km + Tk 0.50/min, minimum Tk 50** (Pathao's last published bike rates, 2022).
  - Example: 8.4 km, 32 min = **Tk 167**.
- **Booking:** the patient confirms the fare. Then riders near the donor are alerted (same campus first), and the first to accept wins.
- **The trip:**
  - 4-digit pickup and drop-off codes.
  - The return leg is allowed only after the 20-minute rest, with a fresh quote.
  - The final fare equals the quote, unless the route is more than 20% longer.
- **Payment:** the patient pays each leg by **bKash**. It is recorded only until the bKash test system arrives in **Sprint 4**. **The donor pays nothing and is never paid.**
- **Not now:** waiting fee, CNG fallback, club charity fund.
- **Live map:** rider location is streamed through **Apache Kafka** to the patient's map and is not stored.

### 2.5 Paid contact unlock (Tk 10, with safety rules)
1. **Opt-in only:** donors who ticked "list my number"; off by default.
2. **This request only:** its blood group, eligible donors, **at most 20**, nearest first. The list refreshes while the unlock is valid.
3. **Logged, and donors told:** every donor shown is written to `contact_reveal` and notified, with **Report misuse**. Two reports block the requester's phone.
4. **One unlock per request.** One request per slip photo.

Access ends when the request closes, or 48 hours after payment.

### 2.6 Donor location (browser)
- The browser gives a position only while the site is open, after permission, and only on HTTPS. There is no background tracking.
- **Home pin** (sign-up) and **current location** (asked each time the site is opened; rounded to about 200 m; used if under 6 hours old).
- **Exact position** is read on the alert page, for the travel decision and the fare.
- If the donor refuses permission, the home pin is used.
- Patients only ever see the distance, never the location.
- Optional later: Telegram live location.

---

## 3. Decision log

| # | Decision |
|---|---|
| 1 | A donor without a vehicle travels alone (walk-in), not a hired CNG. Rides only for far donors |
| 2 | Wording: "patient", plain language, nothing invented |
| 3 | Requests come from the patient side uploading the doctor's slip, not from doctors |
| 4 | The 90-day rule is a **trigger** |
| 5 | ERD redrawn by hand, crow's foot notation |
| 6 | Notifications: **web push + Telegram** (no SMS budget) |
| 7 | Rider live location: **Apache Kafka**, not the database (Redis/WebSocket are lighter fallbacks) |
| 8 | Dropped: welfare features, masked calling |
| 9 | Payments recorded now; bKash test system later (Sprint 4) |
| 10 | **CAMPUS** table; students and campus clusters are the focus |
| 11 | Patients: private tracking link (accounts dropped for patients, see 21) |
| 12 | Donor may share their number on accepting; self-reported donation form |
| 13 | Rides: same volunteer both ways; fare shown before booking (Pathao-style); patient confirms first; return after the rest |
| 14 | SD resource constraints: paid services left out; ride service at a small scale |
| 15 | **Slip only uploaded for now.** Verification is parked (12.4). One request per slip photo |
| 16 | **Tk 10 contact unlock with the four safety rules** (2.5) |
| 17 | **Donor location asked when the donor opens the site** (2.6) |
| 18 | *(22 Nov, from the cross-check)* **Alerts go out on upload.** OCR is informational; an admin can reject a fake slip, which stops the request. The trigger `trg_require_verified_slip` is replaced by `trg_block_rejected_slip` |
| 19 | Prototype runs PostGIS on the local PostgreSQL 18, with **no Docker needed** (scripts/db.ps1) |
| 20 | Two-week sprints; proposal on 24 Nov; reviews every second Tuesday |
| 21 | *(22 Nov)* **Patients never sign up or sign in.** They fill the form on the go (name, phone, slip); the system keeps a hidden guest record. Sign-in is only for donors, riders and admins |
| 22 | *(22 Nov)* Website look: minimal, off-white and one red, flat surfaces; **Figtree** (English) + Hind Siliguri (Bangla); the landing page **is** the request form, with live counts of eligible donors per blood group near the chosen hospital, and only Send request alerts anyone. The donor page is a donor home (blood-group label, 90-day status, requests, availability switch, alert channels). Designed with the impeccable and ui-ux-pro-max skills |
| 23 | *(22 Nov, testing phase)* `run.cmd` starts from a **fresh database every run** (sample data, no requests, uploads cleared), so test slip photos can be reused; `run.cmd -Keep` keeps data |
| 24 | *(22 Nov)* Interface copy: **no full stop at the end of sentences**; two sentences in one line are rewritten as one
| 25 | *(23 Nov)* **Show all donor numbers** built (free for now, Tk 10 later): needs a **verified** slip; lists **every** opted-in donor of that blood group who can donate today, nearest first, updating by itself; every reveal logged; closes when the request ends or after 48 h. Replaces the earlier cap of 20 numbers (decision 16)
| 26 | *(23 Nov)* **Donor dashboard**: Requests, History and Settings tabs; donation history, "I donated somewhere else" (starts the 90-day wait), who saw your number, availability, show-my-number opt-in, campus

---

## 4. Database

### 4.1 Built now (17 tables: the 16 of Team15_ERD plus `contact_reveal`, added 23 Nov)
`campus`, `app_user` (guest/member/admin), `donor` (subtype, `next_eligible_date` set by trigger), `rider` (subtype), `notification_channel`, `hospital`, `requisition_slip` (`image_hash` UNIQUE), `blood_request` (`tracking_token` UNIQUE), `donor_alert` (associative; seen_at, response), `mission` (rider_id = escort both ways), `trip` (weak; fare quote columns), `mission_event` (weak; audit), `donation` (mission null = self-reported), `payment`, `payout_entry`, `fare_rate`.

### 4.2 Planned additions (Sprints 2–4) → 18 tables
- `donor`: + `current_location`, `location_updated_at`, `listed_for_unlock`.
- `payment`: + `purpose` (ride_fare / contact_unlock).
- New tables `contact_reveal` and `misuse_report`; `app_user` + `is_blocked`.
- New routines: `unlock_contacts`, `unlocked_donors`, `trg_one_unlock_per_request`, `trg_block_after_reports`, `trg_unlock_expiry`.
- `donors_in_ring` will use the current location when it is fresh.

### 4.3 Routines

| | Built in Sprint 1 | Planned |
|---|---|---|
| Procedures | `submit_request`, `send_alert_wave` (cursor), `accept_request` (row lock), `review_slip` (preview) | `assign_rider`, `record_donation_outcome`, `close_mission`, `unlock_contacts` |
| Functions | `donors_in_ring`, `auto_check_slip` | `riders_nearby`, `quote_fare`, `unlocked_donors` |
| Triggers | `trg_set_next_eligible` (statement-level, transition table), `trg_check_donor_eligibility`, **`trg_block_rejected_slip`**, `trg_log_status_change` (forward-only + audit), `trg_notify_live_board` | `trg_payout_immutable`, `trg_return_after_rest`, unlock and report triggers |
| Views | `v_request_progress`, `v_slip_review_queue` | `v_mission_timeline` |

Named errors (SQLSTATE `BR001`–`BR008`) become clear messages in the API.

### 4.4 DBMS lab roles (from the DBMS slides)
- **Saa'd:** schema, data.
- **Farhan:** accept, assign rider, concurrency.
- **Abir:** donation outcome, close mission, payments.
- **Razin:** 90-day and audit triggers.
- **Mostafa:** search, alert waves, reports.
- **Ayman:** OCR, live board, roles.

---

## 5. Sprint 1 prototype (`bloodride/`)

**Stack:**
- PostgreSQL 18 + PostGIS 3.7, on a project-local server on port 5433;
- FastAPI + psycopg 3, with `run.py` providing the event loop psycopg needs on Windows;
- Next.js 16.4.5, with `/api/*` proxied to FastAPI;
- LISTEN/NOTIFY → server-sent events for the live board;
- pywebpush with VAPID keys, the Telegram Bot API, and Tesseract OCR (optional).

**Run everything with one command:** `bloodride\run.cmd` (database + API + website; Ctrl+C stops). Setup and run instructions are in `bloodride/README.md`; tool choices are in `bloodride/TECH_STACK.md`.

### 5.0 The website today

| Page | What it does |
|---|---|
| `/` landing | Bangla line "রক্ত লাগবে?" and a short headline, then **the real request form**. Picking a hospital shows **live counts of donors who can give today, per blood group, within 10 km** (same rules as the alert wave). Only **Send request** alerts anyone. Then three plain promises and a line inviting donors |
| `/request` | The same form, opened by the hospital QR posters (hospital already chosen, with a Change button) |
| `/track/<link>` | The patient's private live board: alerted, seen, declined, accepted, donors with phone numbers if shared, and **Show all donor numbers** once the slip is verified |
| `/alert/<request>/<donor>` | What a donor opens from an alert: details, directions, share-my-number, I can donate / I can't. If every bag is taken: Join the backup list |
| `/donor` | **Donor dashboard**: blood-group label and 90-day status, then tabs. **Requests** (alerts to answer), **History** (donations, "I donated somewhere else", requests accepted, who saw your number), **Settings** (available for alerts, show my number to verified patients, campus, notifications) |
| `/posters`, `/poster/<id>` | Printable QR posters per hospital |
| `/admin` | Slips the OCR couldn't read; mark genuine or reject a fake (stops the request). Key: `ADMIN_KEY` in `backend\.env` (default `change-me`) |

**Look:** minimal, off-white with one red, flat surfaces (thin borders, no shadows), Figtree for English and Hind Siliguri for Bangla, blood-drop logo. **No full stops** at the end of sentences anywhere in the interface.

**Running it:** `bloodride\run.cmd` starts the database, API and website together, from a **fresh database every run** (sample data, no requests, uploads cleared); `run.cmd -Keep` keeps the data, `run.cmd -Prod` runs the production build. Ctrl+C stops the API and website; the database keeps running in its own window (`scripts\db.ps1 stop` to stop it).

### 5.1 Sprint 1 task status

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | Proposal presentation | All | 24 Nov |
| 2 | Repo + local PostgreSQL/PostGIS + FastAPI + Next.js | Saa'd | **Done.** Local git repo created; **not on GitHub yet** (no commit made) |
| 3 | First tables | Saa'd | **Done** (all 16) |
| 4 | Sample data | Saa'd | **Done:** 3 hospitals, 3 campuses, 302 donors (2 named demo donors), 3 riders, fare row |
| 5 | 90-day triggers | Razin | **Done, tested** |
| 6 | Audit trigger | Razin | **Done, tested** |
| 7 | Rejected-slip trigger | Razin | **Done, tested** (changed today, decision 18) |
| 8 | Request API (guest, tracking link) | Mostafa | **Done** |
| 9 | PostGIS donor search | Mostafa | **Done** |
| 10 | First alert round (cursor) | Mostafa | **Done** |
| 11 | `accept_request` with row lock | Farhan | **Done** |
| 12 | Accept API with clear errors | Farhan | **Done** |
| 13 | Donor alert page | Farhan | **Done** (+ backup-list state, added today) |
| 14 | Race test | Farhan | **Done:** 2 donors and all 6 donors at once; exactly one wins |
| 15 | Web push | Ayman | **Built**, not yet tried in a real browser. Phone testing (https tunnel) is a Sprint 2 task |
| 16 | Telegram bot | Ayman | **Moved to Sprint 4** (23 Nov). Code exists; needs a bot from @BotFather |
| 17 | OCR slip check | Ayman | **Moved to Sprint 3** (23 Nov). Code exists; Tesseract not installed, so every slip shows "needs review" (harmless, alerts don't wait for it) |
| 18 | QR request page (guest) | Abir | **Done** |
| 19 | Live board (SSE) | Abir | **Done**; live updates verified through the proxy |
| 20 | Demo rehearsal | All | 8 Dec |

**Checks run on 22 Nov:**
- `pytest`: 19 passed.
- `db/smoke_test.sql`: the whole flow in SQL.
- `scripts/api_flow.sh`: the whole flow through the API:
  - guest request, 6 donors alerted at once;
  - reused slip refused;
  - first accept wins, the second becomes a backup;
  - a repeat accept and an unknown donor both refused;
  - decline counted.
- Frontend type-check, lint and production build are clean.
- Screenshots of the home, request, alert and donor pages.

**Ask of each owner:** the code was written for you as a starting point. **Read your own files** (README, "Where things are"), run them, and be ready to explain them at the review.

### 5.2 Prototype limits (planned later)
- **No sign-in yet (Sprint 2).** The donor page lets you pick a sample donor. Alert pages are addressed by request and donor id, so anyone who knows the ids could open one.
- **Only the first alert round.** The widening timer is Sprint 2.
- **`/admin` uses a shared key** until admin login exists.
- **Each open tracking page holds one database connection.** Fine for a demo; hardened in Sprint 5.
- **Web push needs HTTPS** (localhost is fine). Phones on Wi-Fi use Telegram or the inbox.

---

## 6. Product backlog (65 tasks)

| Sprint | Dates | Theme | Tasks |
|---|---|---|---|
| 1 | 25 Nov – 8 Dec (+ proposal 24 Nov) | Request → alert → accept, live board | 20 |
| 2 | 9 – 22 Dec | Login and roles, admin slip page, wider search, backups, sign-up with campus, SRS, **donor location on open, home pin, unlock opt-in** | 11 |
| 3 | 23 Dec – 5 Jan | Rides (fare quote, rider, codes, ride home, Kafka map), **unlock procedure, unlocked list, unlock screen** | 11 |
| 4 | 6 – 19 Jan | Hospital stage, donation outcome, `close_mission`, payouts, payments, **bKash test system**, admin dashboard, hotline, **reveal notices + reports, exact position at alert** | 11 |
| 5 | 20 Jan – 2 Feb | Live board hardening, row-level security, reports, indexes, testing, deploy, pilot, final demo, Telegram live location (optional) | 10 |

The file is `Product Backlog_BloodRide.xlsx`, generated by `sd_proposal/make_backlog.py`. A copy is in `BloodRide_2026-11-21/`.

---

## 7. Files

### 7.1 Current deliverables
| File | What |
|---|---|
| `dbms_proposal/Team15_ERD.pdf`, `Team15_proposal_slides.pdf`, `Team_15_Outline.pdf` | DBMS proposal (16 entities) |
| `sd_proposal/BloodRide_SD_Proposal_Slides.pdf` | SD deck for 24 Nov |
| `Product Backlog_BloodRide.xlsx` | Backlog (63 tasks) |
| `BloodRide_2026-11-21/` | Folder to share: this summary, WORKFLOW.md, backlog, PDFs |
| `bloodride/` | **Sprint 1 code** (db, backend, frontend, scripts, README) |

### 7.2 Sources
- **ERD:** `dbms_proposal/er_source/er_v2.py`.
- **DBMS deck:** `dbms_proposal/slides.html`.
- **Outline:** `er_source/outline.html`.
- **SD deck:** `sd_proposal/slides.html` + `build.py` (Gantt).
- **Backlog:** `sd_proposal/make_backlog.py`.
- **PDFs:** printed with headless Chrome.

### 7.3 Backups
Files named `*_before_redesign`, `*_before_slip_change`, `*_before_workflow`, `*_before_fare` and `*_before_2week`.

### 7.4 Stale: don't show
- `ER_Guide.*`, `summary.pdf`, `Slides_8_9_Explained.pdf`, `Presentation_Script.pdf`;
- `BloodrideBD_proposal_*.pdf`, `BloodRide_ER_Draft.pdf`, `bloodride_proposal_slides.*`;
- the root `To_Submit_Slides.pdf` (17 Nov);
- `sd_proposal/204_210_…_BloodRide_Proposal_Slides.pdf` (18 Nov);
- `PROJECT_STATUS.md`, `pulselink/…_v1.md`;
- `BloodRide_2026-11-21/CHANGES_2026-11-21.md` is a dated log: its task counts are from 21 Nov.

---

## 8. Cross-check of 22 November

### 8.1 Faults found and fixed today
| # | Fault | Fix |
|---|---|---|
| 1 | Prototype **held alerts until the slip was verified**, against decision 15 | Alerts go out on upload. OCR is informational; admin "reject" stops a request. Trigger, API, pages, tests, README and backlog updated |
| 2 | Even then, alerts would have waited for OCR to finish | Alerts are sent **before** OCR runs |
| 3 | `WORKFLOW.md` and the old summary said bKash comes in Sprint 5; the backlog has **Sprint 4** | Both corrected |
| 4 | Backlog task 1 said "Docker PostgreSQL + PostGIS" | Changed to "local PostgreSQL 18 + PostGIS 3.7" |
| 5 | Sample data used the old name **"Bangabandhu Sheikh Mujib Medical University"** | Renamed **Bangladesh Medical University** in 2025; seed updated |
| 6 | Alert page offered "I can donate" when every bag was already taken | Shows "Join the backup list" with a note |
| 7 | Card lists had no inner padding (a CSS conflict) | Fixed |
| 8 | After a database reset, the API kept dead connections (500 errors) | The pool now checks connections before use |

### 8.2 Known mismatches left on purpose (no new PDFs, per instruction)
| Where | Mismatch | Needed when |
|---|---|---|
| DBMS slides and outline | Still list `trg_require_verified_slip` ("no alerts until verified"); the code now has `trg_block_rejected_slip` | Next DBMS submission |
| DBMS ERD | 16 tables; the plan adds 2 (`contact_reveal`, `misuse_report`) + new columns | When the team confirms the unlock |
| SD deck | No paid unlock or donor location; tools slide lists Docker (now optional) and not OSRM | Mention verbally on 24 Nov, or update if the team wants |
| SD deck FR1 and DBMS slides 3–4, 7 | Say patients "sign in or continue as a guest"; now patients never sign in (decision 21) | Mention verbally |
| SD deck FR8 "Check the slip" | Still describes OCR + admin; now it's upload + optional admin reject | Mention verbally |

---

## 9. Issues and risks

| Risk | Mitigation |
|---|---|
| **Unverified slips + Tk 10 unlock** are cheap for a broker | Opt-in, 20-number cap, log, donor notice, reports → block. Real fix: verification (12.4) |
| **Fake requests waste donors' time** (alerts go out unverified) | Admin can reject; one request per slip photo; 2 open requests per phone (backlog Sprint 2) |
| **Fares may count as ride-sharing** under BRTA rules (enlistment) | Fine for a student pilot; ask the teacher (11.2) |
| Starting fare rates are 2022 figures | Stored in `fare_rate`; change any time |
| Few volunteer riders | A ride never blocks a donation; the donor can always go alone |
| Donor faints on the ride home | Return only after the 20-minute rest; rider stays with the donor. Suggested: "I feel fine" check, second helmet |
| OCR on handwritten slips | Now only informational; admin reviews when needed |
| Kafka is heavy for a pilot | Team choice; Redis or WebSocket as fallback |
| Web push needs HTTPS | Telegram + in-app inbox; deploy with HTTPS in Sprint 5 |
| Location privacy | Rounded, never shown to patients, can be turned off |
| Previous DBMS criticism (invented ERD, odd wording) | Everything traced to decisions; plain wording |

---

## 10. Feasibility

- **Everything uses free, standard tools.** The core flow already works end to end in the prototype.
- **Riskiest parts are off the critical path:** Kafka map, OCR, Telegram setup.
- **Sprint 1 is effectively complete in code.** What's left is real-device testing, setup (Tesseract, bot token, GitHub) and each member understanding their part.
- **Later sprints** average about 11 tasks for six people per two weeks. That's realistic.

---

## 11. Questions to ask

### 11.1 Team
1. **Unlock:** Tk 10 or Tk 5? Quota of 20 numbers? 48-hour lifetime?
2. **Fare rates:** keep Pathao's 2022 rates (Tk 25 + 15/km + 0.50/min, min 50) or lower?
3. **bKash ownership:** the backlog says Saa'd, the DBMS roles slide says Abir ("payments, payouts").
4. **Before 24 Nov:** should the SD deck be updated for the unlock, location and upload-only slip, or will these be mentioned verbally?
5. **GitHub:** who creates the repository? Then push `bloodride/` (I made no commits).
6. **Telegram:** who creates the bot with @BotFather? The token goes in `backend/.env`.

### 11.2 Teacher
1. Is the **final demo on 2 Feb** fine, or must it be in January? (Two-week reviews put the last one on 2 Feb.)
2. Is it fine that the DBMS project's design has moved since the Lab 4 proposal: the slip rule, and the planned unlock tables?
3. Is charging a ride fare in a student pilot acceptable, given BRTA ride-sharing rules?
4. Is a paid contact unlock acceptable ethically, with opt-in and logging?

---

## 12. Decisions for later

1. **Final date:** 2 Feb or squeeze into January.
2. **Club-funded charity** for poor patients (unlock and fares).
3. **Waiting fee** for riders; assigned (paid) riders; same-gender rider option.
4. **Slip verification:** parked options:
   - in-app camera + near-hospital check;
   - known-doctors list;
   - BMDC check (verify.bmdc.org.bd);
   - campus volunteer phone check;
   - confirmation at donation;
   - hospital staff (optional);
   - government digital prescriptions, expected around 2028.
5. **SMS one-time codes** (costs money) to confirm phone numbers.
6. **Telegram live location** for donors.
7. **Kafka vs a lighter option** for the rider map.

---

## 13. Research sources (ride plan, rules, prices)

| Finding | Source |
|---|---|
| Pathao + Hamro LifeBank (Kathmandu) covered round trips for emergency donors | ictframe.com |
| Uber India free or flat-fare donor rides (Fortis, BloodConnect) | fortishealthcare.com, uber.com |
| UK Blood Bikes: volunteers; the charity pays the fuel | motorcyclenews.com, itv.com |
| Amra Roktosandhani (BD): own volunteer riders | thedailystar.net |
| Brazil: a ride discount nearly doubled donations on the day (+97.4%); long waits hurt return visits | FGV / Social Science and Medicine |
| Ghana: transport is the top barrier (88.2%) | medRxiv 2026 |
| WHO/IFRC: covering travel costs keeps donation voluntary | Cochrane review summary |
| Uber upfront price = base + distance + time (+ demand) | uber.com |
| Pathao bike 2022: Tk 25 + Tk 15/km + Tk 0.50/min, min Tk 50 | businesspostbd.com |
| Octane Tk 165/L (Sept–Nov 2026) | nst.com.my, bdnews24.com |
| BRTA: ride-sharing providers need enlistment; fares capped at taxi fare | thefinancialexpress.com.bd, unb.com.bd |
| Delayed fainting after donation; avoid driving soon after | transfusionguidelines.org (JPAC) |
| BMDC public doctor search (verify.bmdc.org.bd) | bmdc.org.bd |
| BD e-health card / digital prescription pilots; full coverage expected by 2028 | bssnews.net, tbsnews.net |
| BSMMU renamed Bangladesh Medical University (2025) | dhakatribune.com |

---

## 14. Work log (what has been done, in order)

**Proposals and design (before 21 Nov)**
- DBMS Lab 4 proposal: ER diagram, one-page outline, slides. Redrawn by hand after criticism of the first version.
- SD lab proposal deck from the course brief: motivation, objective, requirements, modules, Gantt, stakeholders, tools, challenges, conflicts.
- First product backlog in the course template.

**21 November: workflow redesign**
- Adopted the team's workflow: QR poster, slip upload, search wave, web push + Telegram, live progress, donor shares number, student volunteer rider, bKash.
- Database grew to 16 tables: CAMPUS, guest patients, seen tracking, phone sharing, fares.
- Researched donor rides worldwide (Pathao Nepal, Uber India, UK Blood Bikes, Bangladeshi groups, WHO rules, BRTA, fuel prices). Settled the ride plan: one volunteer both ways, Pathao-style fare shown before booking, patient pays by bKash, donor never pays.
- Updated ERD, DBMS slides, outline, SD slides and backlog; made the `BloodRide_2026-11-21` folder with a changes log; moved to two-week sprints.

**22 November: decisions, research and Sprint 1 build**
- Slip-as-key idea discussed: verification options researched (BMDC, volunteers, donation confirmation, hospital staff, e-prescriptions) and parked. Slip is only uploaded for now.
- Decided the Tk 10 contact unlock with four safety rules, and donor location asked when the site is opened. Wrote `WORKFLOW.md`, updated the backlog (63 tasks).
- Installed PostGIS 3.7 on PostgreSQL 18 (kept PostgreSQL's own DLLs), no Docker needed.
- **Built the Sprint 1 prototype** (`bloodride/`):
  - database: 16 tables, triggers, procedures, views and sample data;
  - API: FastAPI, live board over server-sent events, web push, Telegram, OCR;
  - website: Next.js;
  - 19 tests, including the race test.
- **Cross-checked the whole project** and fixed 8 faults. The main one: alerts were waiting for slip verification, against the decision that they go out on upload.
- Rewrote `summary.md` as the single project summary.
- Added the **one-command launcher** (`run.cmd`), and fixed a database crash after a closed terminal.
- **Website redesign in several rounds:**
  - off-white and red, real blood-drop logo;
  - patients never sign in;
  - minimal layout, built with the impeccable and ui-ux-pro-max skills;
  - landing page holds the real request form with live donor counts;
  - donor home page rebuilt;
  - Figtree font;
  - no full stops in the interface.
- Every run now starts from a fresh database for testing.

**23 November: donor dashboard and reveal**
- Moved Telegram (Sprint 4) and Tesseract (Sprint 3) out of Sprint 1; phone testing became a Sprint 2 task.
- Built **Show all donor numbers** for verified patients and the **donor dashboard** (see decisions 25 and 26). 9 new tests (28 in total) and a 20-step end-to-end check through the running site.
- Fixed the live board in real browsers: the website's gzip was holding the stream back (`Cache-Control: no-transform`).

**Still to do (from section 11 and the Sprint 1 table)**
- Push the code to GitHub.
- Create the Telegram bot.
- Install Tesseract.
- Try web push on a real phone.
- Each owner reads and runs their part before the 8 Dec review.
- Settle the team and teacher questions in section 11.
