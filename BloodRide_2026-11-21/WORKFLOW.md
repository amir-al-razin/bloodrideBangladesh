# BloodRide workflow

Agreed 22 November 2026. Builds on `summary.md`. Changes since the 21 November plan:
- **The slip is only uploaded for now.** Detailed verification is left for later (options kept in section 7).
- **Paid contact unlock** (Tk 10), with four safety rules.
- **Donor location** is asked when the donor opens the site.

---

## 1. Patient side

1. **Scan** the hospital's QR poster. The form opens with the hospital filled in.
2. **No sign-up or sign-in.** The patient gives a name and a phone number; the system keeps a hidden guest record (no password).
3. **Fill the form:** blood group, bags, urgency, needed by. **Upload the doctor's slip.**
   - The slip is stored. The only check is that **the same slip photo cannot be used twice** (image hash, already built).
4. **Everything opens at once:**
   - The **alert wave** starts: eligible donors nearby get web push and Telegram alerts.
   - The **private link** shows live progress: alerted, seen, declined, accepted.
   - A donor who accepts can share their number with this patient (free, as before).
5. **Optional: unlock donor numbers for Tk 10** (section 3).
6. A donor accepts or is called. They travel alone, or with a volunteer rider (fare shown before booking).
7. Donation, rest, ride home. The request closes and access ends.

## 2. Donor side

- **At sign-up:**
  - Drop a **home-area pin** on a map.
  - Choose the alert channels (web push, Telegram).
  - Choose whether to **list my number for paid unlock**. It is off by default.
- **Each time the donor opens the site**, the browser asks for their location (section 4).
- **On an alert:** accept or decline, and choose whether to share their number with that patient.
- **When their number is shown through an unlock**, they get a notice with a **Report misuse** button.

## 3. Paid contact unlock (option a: with safety rules)

The patient pays **Tk 10** to see donor numbers for **their own request**.

| Rule | Detail |
|---|---|
| **1. Opt-in only** | Only donors who ticked "list my number for paid unlock" appear. Off by default; donors can turn it off any time |
| **2. This request only** | The request's blood group; eligible donors only (90-day rule, available); nearest first; at most **20 numbers** shown at a time |
| **3. Logged, and donors are told** | Every donor shown is written to `contact_reveal`, and gets a notice: *"Your number was shown for an AB− request at Dhaka Medical College Hospital."* The notice has **Report misuse**. Two reports block the requester's phone |
| **4. One unlock per slip image** | One request per slip photo (already enforced), and one unlock per request |

**The list stays up to date.** While the unlock is valid, the list refreshes as donors become eligible, opt in or come closer. Newly shown donors are logged and notified the same way.

**Access ends** when the request is filled, closed or cancelled, or **48 hours after payment**, whichever comes first.

**Payment:** recorded only for now, so in the prototype "Pay Tk 10" is a confirm step. The bKash test system comes in Sprint 4 (6–19 Jan).

## 4. Donor location from the browser

**What the browser allows:**
- Location is available only while the site is open, after the donor allows it, and only on HTTPS (localhost is fine).
- There is no background tracking in a web app.

**The plan:**

| Location | Set when | Used for |
|---|---|---|
| **Home area** (pin) | At sign-up; editable | Search, when there is no fresh location |
| **Current location** | **Each time the donor opens the site** (one location request); again when they open an alert | Search, if it is less than **6 hours** old |
| **Exact position at the alert** | When the alert page opens | Exact distance → travel alone or a ride, and the fare quote |

- If the donor refuses permission, the home pin is used and nothing breaks.
- **Privacy:**
  - Stored positions are rounded to about 200 m.
  - Patients never see a donor's location, only the distance ("3.2 km away").
  - The donor can turn "use my current location" off.
- **Optional, later:** Telegram live location (the donor shares it with our bot for 15 min to 8 h). It is the only way to get updates while the site is closed.

## 5. Database changes

| Change | Purpose |
|---|---|
| `donor` + `current_location` (geography), `location_updated_at`, `listed_for_unlock` (bool, default false) | Location on open; opt-in |
| `donors_in_ring` uses `current_location` if under 6 h old, otherwise `home_location` | Search uses the freshest position |
| `payment` + `purpose` ('ride_fare' / 'contact_unlock') | One payment table for fares and unlocks |
| New **`contact_reveal`** (request_id, donor_id, revealed_at), PK (request_id, donor_id) | Log of who was shown; drives the donor notice |
| New **`misuse_report`** (report_id, request_id, donor_id, reason, created_at) + `app_user.is_blocked` | Reports and blocking |
| Procedure **`unlock_contacts`** | Checks payment, request open, one unlock per request |
| Function **`unlocked_donors`** | Returns the current list (≤ 20: opt-in, eligible, group, nearest first) and logs newly shown donors |
| Triggers: `trg_one_unlock_per_request`, `trg_block_after_reports` (2 reports → blocked), `trg_unlock_expiry` (no reveals after close or 48 h) | Rules kept in the database |

16 → 18 tables. Team15_ERD and the DBMS deck need one more update once the team agrees. No new PDFs for now.

## 6. Feasibility

- **Location on open:** a few lines of frontend, one API endpoint and two columns. Small; fits Sprint 2.
- **Unlock:**
  - One procedure, one function, two small tables and three triggers. Fits the DBMS lab well (locks, triggers, logging).
  - Payment is recorded now; bKash comes later.
- **Main risk:** an unverified slip plus Tk 10 is still cheap for a broker. The opt-in, the 20-number cap, the log and the donor notice limit the damage. Proper slip verification (section 7) is the real fix when the team gets to it.

## 7. Later: slip verification options (parked)

Kept for when verification comes back. Details are in the chat of 22 Nov.
1. In-app camera capture, plus a check that the phone is near the hospital.
2. A self-building list of known doctors per hospital.
3. A manual check on BMDC's public doctor search.
4. A volunteer phone check by campus blood-club members.
5. Confirmation at the donation, which builds trust over time.
6. Approval by hospital staff (optional).
7. Government digital prescriptions with QR codes (expected by about 2028).
