"""Database rules: 90-day triggers, the slip trigger, the slip check, the audit trail, the live-board NOTIFY.
Each test runs in a transaction that is rolled back (except the NOTIFY test, which cleans up)."""
from datetime import date, timedelta

import psycopg
import pytest

from conftest import connect

DEMO_ONE = "01800000001"


def demo_donor(conn):
    return conn.execute("SELECT user_id FROM app_user WHERE phone = %s", (DEMO_ONE,)).fetchone()["user_id"]


def new_request(conn, tag="t-" + "x" * 8, group="AB-"):
    row = conn.execute(
        "CALL submit_request(1, 'Test Patient', '01699999999', %s, 1, 'urgent', now() + interval '1 day',"
        " 'test.png', %s)", (group, tag)).fetchone()
    return row["p_request_id"]


# ---------- 90-day rule (Razin)
def test_donation_sets_next_eligible_date(conn):
    d = demo_donor(conn)
    conn.execute("INSERT INTO donation (donor_id, donated_on, source) VALUES (%s, current_date - 10, 'self_reported')", (d,))
    nxt = conn.execute("SELECT next_eligible_date FROM donor WHERE user_id = %s", (d,)).fetchone()["next_eligible_date"]
    assert nxt == date.today() - timedelta(days=10) + timedelta(days=90)


def test_latest_donation_wins_when_several_are_inserted_together(conn):
    d = demo_donor(conn)
    conn.execute("""INSERT INTO donation (donor_id, donated_on, source) VALUES
                    (%s, current_date - 200, 'self_reported'), (%s, current_date - 5, 'self_reported')""", (d, d))
    nxt = conn.execute("SELECT next_eligible_date FROM donor WHERE user_id = %s", (d,)).fetchone()["next_eligible_date"]
    assert nxt == date.today() + timedelta(days=85)


def test_donor_inside_90_days_cannot_be_alerted(conn):
    d = demo_donor(conn)
    rid = new_request(conn)
    conn.execute("INSERT INTO donation (donor_id, donated_on, source) VALUES (%s, current_date, 'self_reported')", (d,))
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("INSERT INTO donor_alert (request_id, donor_id, round_no, distance_km) VALUES (%s, %s, 1, 1)", (rid, d))
    assert exc.value.sqlstate == "BR001"


def test_search_skips_donors_inside_90_days(conn):
    d = demo_donor(conn)
    rid = new_request(conn)
    before = {r["donor_id"] for r in conn.execute("SELECT donor_id FROM donors_in_ring(%s, 10)", (rid,))}
    conn.execute("INSERT INTO donation (donor_id, donated_on, source) VALUES (%s, current_date, 'self_reported')", (d,))
    after = {r["donor_id"] for r in conn.execute("SELECT donor_id FROM donors_in_ring(%s, 10)", (rid,))}
    assert d in before and d not in after


# ---------- slip (Razin, Ayman)
def test_alerts_go_out_before_any_slip_check(conn):
    rid = new_request(conn)                                   # slip still needs_review
    row = conn.execute("CALL send_alert_wave(%s, 10, 10)", (rid,)).fetchone()
    assert row["p_alerted"] > 0


def test_rejected_slip_stops_the_request(conn):
    rid = new_request(conn)
    conn.execute("CALL send_alert_wave(%s, 10, 10)", (rid,))
    slip = conn.execute("SELECT slip_id FROM blood_request WHERE request_id = %s", (rid,)).fetchone()["slip_id"]
    conn.execute("CALL review_slip(%s, 1, false)", (slip,))
    assert conn.execute("SELECT status FROM blood_request WHERE request_id = %s", (rid,)).fetchone()["status"] == "cancelled"
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("INSERT INTO donor_alert (request_id, donor_id, round_no, distance_km) "
                     "SELECT %s, user_id, 9, 1 FROM donor WHERE blood_group = 'AB-' "
                     "AND user_id NOT IN (SELECT donor_id FROM donor_alert WHERE request_id = %s) "
                     "AND (next_eligible_date IS NULL OR next_eligible_date <= current_date) LIMIT 1", (rid, rid))
    assert exc.value.sqlstate == "BR002"


def test_reused_slip_image_is_refused(conn):
    new_request(conn, tag="same-photo")
    with pytest.raises(psycopg.errors.UniqueViolation):
        new_request(conn, tag="same-photo")


GOOD_SLIP = ("DHAKA MEDICAL COLLEGE HOSPITAL\nDate: {d}\nBlood group: AB (-ve)\n"
             "Dr. Abdul Karim  BMDC Reg No: A-12345")


@pytest.mark.parametrize("text, status, failed", [
    (GOOD_SLIP, "auto_verified", []),
    (GOOD_SLIP.replace("AB (-ve)", "B (+ve)"), "needs_review", ["blood_group"]),
    (GOOD_SLIP.replace("DHAKA MEDICAL COLLEGE", "SQUARE"), "needs_review", ["hospital"]),
    (GOOD_SLIP.replace("{d}", "01/01/2020"), "needs_review", ["date"]),
    (GOOD_SLIP.replace("BMDC Reg No: A-12345", ""), "needs_review", ["doctor_reg_no"]),
    ("", "needs_review", ["hospital", "blood_group", "date", "doctor_reg_no"]),
])
def test_auto_check_slip(conn, text, status, failed):
    rid = new_request(conn)
    text = text.replace("{d}", date.today().strftime("%d/%m/%Y"))
    row = conn.execute("SELECT c.* FROM blood_request r, auto_check_slip(r.slip_id, %s) c WHERE r.request_id = %s",
                       (text, rid)).fetchone()
    assert row["check_status"] == status
    assert row["failed_checks"] == failed


def test_ab_positive_text_does_not_pass_a_b_positive_request(conn):
    rid = new_request(conn, group="B+")
    text = GOOD_SLIP.replace("AB (-ve)", "AB+").replace("{d}", date.today().strftime("%d/%m/%Y"))
    row = conn.execute("SELECT c.* FROM blood_request r, auto_check_slip(r.slip_id, %s) c WHERE r.request_id = %s",
                       (text, rid)).fetchone()
    assert "blood_group" in row["failed_checks"]


# ---------- audit trail (Razin)
def test_mission_status_is_logged_and_only_moves_forward(verified_request):
    rid, donors = verified_request
    with connect() as c:
        mid = c.execute("CALL accept_request(%s, %s, false)", (rid, donors[0])).fetchone()["p_mission_id"]
        c.execute("UPDATE mission SET status = 'en_route' WHERE mission_id = %s", (mid,))
        events = c.execute("SELECT from_status, to_status FROM mission_event WHERE mission_id = %s ORDER BY seq",
                           (mid,)).fetchall()
        assert [(e["from_status"], e["to_status"]) for e in events] == [(None, "reserved"), ("reserved", "en_route")]
        with pytest.raises(psycopg.Error) as exc:
            c.execute("UPDATE mission SET status = 'reserved' WHERE mission_id = %s", (mid,))
        assert exc.value.sqlstate == "BR005"


# ---------- live board (Abir)
def test_alert_change_sends_notify(verified_request):
    rid, donors = verified_request
    with connect() as listener, connect() as writer:
        listener.execute("LISTEN live_board")
        writer.execute("UPDATE donor_alert SET seen_at = now() WHERE request_id = %s AND donor_id = %s", (rid, donors[0]))
        payloads = [n.payload for n in listener.notifies(timeout=3, stop_after=1)]
    assert payloads == [str(rid)]
