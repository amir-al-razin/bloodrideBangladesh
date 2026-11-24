# BloodRide: what we're building and where we are

*Last updated 24 November 2026. If another document disagrees with this one, this one wins.*

## The idea in one line

Donors in Dhaka are willing, but they don't hear about requests in time and getting to the hospital is a hassle. **BloodRide alerts the right donors near the hospital, and later gets them there and back.**

## Three stages

| Stage | What it does | Status |
|---|---|---|
| **1. Find a donor** | Request → hospital approves → nearby donors alerted → a donor says yes | **Built and working** |
| 2. Get them there | Donor chooses: come alone, or a student volunteer rider picks them up | Not started |
| 3. Get them home | After the 20-minute rest, the rider takes them home | Not started |

We don't touch Stage 2 until Stage 1 works with real people.

## Stage 1, step by step

1. **The family asks.** They scan the QR poster at the hospital (or open the website). They pick the blood group and number of bags, and upload a photo of the doctor's slip. No account needed.
2. **The hospital approves.** The blood-bank staff member sees the request with the slip photo and taps **Approve** or **Reject**. Nothing goes to donors before this. Staff can only see their own hospital's requests.
   - **If staff are late:** after 5 minutes (emergency), 15 (urgent) or 60 (scheduled), staff get a reminder and the **BloodRide on-duty team** is alerted. The request goes to the top of their list, marked overdue. A team member calls the blood bank, confirms the slip, and approves it. The family's page explains the delay. Nothing is ever approved automatically.
3. **Donors are alerted.** Donors with that blood group, near the hospital, available, and past their 90-day rest get a notification. Round 1 looks within 5 km. If nobody says yes, every 5 minutes the search goes wider: 10 km, 20 km, 35 km.
4. **A donor says yes.** The first donor to tap "I can donate" is reserved. Anyone after that goes on the backup list. If the donor agreed to share their number, the family can call them.
5. **The family watches it live.** A private link shows each step: sent, approved, how many alerted, seen, said no, said yes.

Extra: once a request is approved, the family can also see the numbers of donors who agreed to be called, and call them directly. **Free. We never sell numbers.**

## Money

- Blood is always free.
- BloodRide charges nothing in Stage 1.
- Later, in Stage 2, the patient pays the rider's fare. That money goes to the rider.

## Decisions that are final

| Decision | Why |
|---|---|
| Hospital staff approve every request before any donor is alerted | Stops fake requests and brokers |
| If staff are late, our team is alerted; never auto-approve | A family is never stuck, and fake slips still can't get through |
| The family calls donors, not our team | Scales: 100 requests don't need 100 volunteers on the phone |
| Donor numbers are never sold | Donors would leave if they were |
| 90-day rest after every donation | Medical rule; the database enforces it |
| Patients never need an account | They're in a hurry |
| Donors and staff sign in with phone + password | Real accounts, not demo pickers |

## Not doing now

Rides, fares, bKash payments, the live rider map (and Kafka), the automatic slip reader (OCR), Telegram alerts, reports, a phone app. All of these are parked until Stage 1 is in real use.

## Open questions for the team

1. **Women donors.** We said earlier "women out" because of anaemia. It's **not built** into the sign-up. Decide: leave everyone in and rely on the hospital's screening, or ask during sign-up?
2. **Phone app.** Donors get browser notifications today. That's fine for the demo, but a real phone app gives more reliable alerts. When?
3. **Help numbers.** When no donor says yes, the page tells the family to contact Sandhani or Badhan. We need their real, checked hotline numbers before going live.
4. **Who is on duty?** Overdue approvals alert the BloodRide team. We need a rota (for example, each of the 6 members takes a day) and the blood banks' desk phone numbers.
5. **Going online.** It only runs on a laptop today. It needs a server and a web address before real people can use it.

## Where things are

| You want | Look at |
|---|---|
| How to run it | [`bloodride/README.md`](bloodride/README.md) |
| The code | [`bloodride/`](bloodride/): `db/` database, `backend/` API, `frontend/` website |
| The backlog (tasks per sprint) | [`BloodRide_2026-11-21/Product Backlog_BloodRide.xlsx`](BloodRide_2026-11-21/) |
| Older plans and proposal PDFs | [`BloodRide_2026-11-21/`](BloodRide_2026-11-21/), older than this page |
