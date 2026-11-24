"""Database rules: 90-day triggers, hospital approval, accounts, the slip check, the audit trail, the live-board NOTIFY.
Each test runs in a transaction that is rolled back (except the NOTIFY test, which cleans up)."""
from datetime import date, timedelta

import psycopg
import pytest

from conftest import connect

def demo_donor(conn):
    """An AB- donor near Dhaka Medical College with no donation on record (so the 90-day tests start clean),
    whatever has been done in the app since the last reset."""
    row = conn.execute(
        """SELECT d.user_id FROM donor d JOIN hospital h ON h.hospital_id = 1
            WHERE d.blood_group = 'AB-' AND d.is_available
              AND NOT EXISTS (SELECT 1 FROM donation dn WHERE dn.donor_id = d.user_id)
              AND ST_DWithin(d.home_location, h.location, 10000)
            ORDER BY ST_Distance(d.home_location, h.location) LIMIT 1""").fetchone()
    if not row:
        pytest.skip("no AB- donor without donations near hospital 1 (reset the database)")
    return row["user_id"]


def new_request(conn, tag="t-" + "x" * 8, group="AB-", approve=True):
    """A request at hospital 1. approve=True: the admin (user 1) approves the slip, so alerts may go out."""
    row = conn.execute(
        "CALL submit_request(1, 'Test Patient', '01699999999', %s, 1, 'urgent', now() + interval '1 day',"
        " 'test.png', %s)", (group, tag)).fetchone()
    rid = row["p_request_id"]
    if approve:
        conn.execute("CALL review_slip(%s, 1, true)", (slip_of(conn, rid),))
    return rid


def slip_of(conn, rid):
    return conn.execute("SELECT slip_id FROM blood_request WHERE request_id = %s", (rid,)).fetchone()["slip_id"]


def staff_of(conn, hospital_id):
    return conn.execute("SELECT user_id FROM hospital_staff WHERE hospital_id = %s", (hospital_id,)).fetchone()["user_id"]


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
def test_no_alerts_before_the_hospital_approves(conn):
    rid = new_request(conn, approve=False)                    # slip still waiting for staff
    with pytest.raises(psycopg.Error) as exc, conn.transaction():
        conn.execute("CALL send_alert_wave(%s, 10, 10)", (rid,))
    assert exc.value.sqlstate == "BR002"
    with pytest.raises(psycopg.Error) as exc, conn.transaction():   # the trigger blocks a direct insert too
        conn.execute("INSERT INTO donor_alert (request_id, donor_id, round_no, distance_km) "
                     "SELECT %s, user_id, 1, 1 FROM donor WHERE blood_group = 'AB-' "
                     "AND (next_eligible_date IS NULL OR next_eligible_date <= current_date) LIMIT 1", (rid,))
    assert exc.value.sqlstate == "BR002"


def test_staff_of_the_hospital_approves_and_alerts_go_out(conn):
    rid = new_request(conn, approve=False)
    conn.execute("CALL review_slip(%s, %s, true)", (slip_of(conn, rid), staff_of(conn, 1)))
    row = conn.execute("CALL send_alert_wave(%s, 10, 10)", (rid,)).fetchone()
    assert row["p_alerted"] > 0


def test_staff_of_another_hospital_cannot_approve(conn):
    rid = new_request(conn, approve=False)
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("CALL review_slip(%s, %s, true)", (slip_of(conn, rid), staff_of(conn, 2)))
    assert exc.value.sqlstate == "BR008"


def test_a_slip_is_decided_only_once(conn):
    rid = new_request(conn)                                   # approved already
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("CALL review_slip(%s, 1, false)", (slip_of(conn, rid),))
    assert exc.value.sqlstate == "BR012"


def test_each_round_counts_up_and_finds_new_donors(conn):
    rid = new_request(conn)
    first = conn.execute("CALL send_alert_wave(%s, 5, 50)", (rid,)).fetchone()
    second = conn.execute("CALL send_alert_wave(%s, 35, 50)", (rid,)).fetchone()
    assert (first["p_round"], second["p_round"]) == (1, 2)
    assert second["p_alerted"] > 0                            # further donors, never the same ones twice
    dupes = conn.execute("SELECT count(*) - count(DISTINCT donor_id) AS d FROM donor_alert WHERE request_id = %s",
                         (rid,)).fetchone()["d"]
    assert dupes == 0
    assert conn.execute("SELECT search_round FROM blood_request WHERE request_id = %s", (rid,)).fetchone()["search_round"] == 2


def test_rejected_slip_stops_the_request(conn):
    rid = new_request(conn, approve=False)
    conn.execute("CALL review_slip(%s, %s, false)", (slip_of(conn, rid), staff_of(conn, 1)))
    assert conn.execute("SELECT status FROM blood_request WHERE request_id = %s", (rid,)).fetchone()["status"] == "cancelled"
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("CALL send_alert_wave(%s, 10, 10)", (rid,))
    assert exc.value.sqlstate == "BR006"


def test_overdue_approval_is_escalated_once_and_never_auto_approved(conn):
    rid = new_request(conn, approve=False)                    # 'urgent', 15 minutes allowed
    assert conn.execute("SELECT * FROM escalate_overdue_approvals(5, 15, 60)").fetchall() == []
    conn.execute("UPDATE blood_request SET created_at = now() - interval '16 minutes' WHERE request_id = %s", (rid,))
    assert [r["request_id"] for r in conn.execute("SELECT * FROM escalate_overdue_approvals(5, 15, 60)")] == [rid]
    assert conn.execute("SELECT * FROM escalate_overdue_approvals(5, 15, 60)").fetchall() == []   # only once
    row = conn.execute("""SELECT s.check_status, r.status FROM blood_request r JOIN requisition_slip s USING (slip_id)
                           WHERE r.request_id = %s""", (rid,)).fetchone()
    assert (row["check_status"], row["status"]) == ("needs_review", "open")                          # still waiting
    queue = conn.execute("SELECT request_id FROM v_slip_review_queue").fetchone()
    assert queue["request_id"] == rid                                                                # top of the list


# ---------- admin (24 Nov)
def test_blocked_phone_cannot_send_requests(conn):
    conn.execute("INSERT INTO app_user (full_name, phone, account_type, is_blocked) VALUES ('X', '01699999999', 'guest', true)")
    with pytest.raises(psycopg.Error) as exc:
        new_request(conn, approve=False)
    assert exc.value.sqlstate == "BR015"


def test_admin_adds_and_removes_staff(conn):
    uid = conn.execute("CALL create_staff('New Desk', '01577777777', 'secret1', 2)").fetchone()["p_user_id"]
    assert conn.execute("SELECT * FROM start_session('01577777777', 'secret1')").fetchone()["account_type"] == "staff"
    conn.execute("CALL remove_staff(%s)", (uid,))
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("SELECT * FROM start_session('01577777777', 'secret1')")
    assert exc.value.sqlstate == "BR013"


# ---------- accounts (24 Nov)
def test_sign_in_checks_the_password(conn):
    row = conn.execute("SELECT * FROM start_session('01500000001', 'bloodride123')").fetchone()
    assert row["account_type"] == "staff" and len(row["token"]) == 64
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("SELECT * FROM start_session('01500000001', 'wrong')")
    assert exc.value.sqlstate == "BR013"


def test_donor_sign_up_and_a_guest_becomes_a_member(conn):
    new_request(conn, approve=False)                          # 01699999999 is now a guest (a patient)
    uid = conn.execute("CALL register_donor('Test Donor', '01699999999', 'secret1', 'O+', 23.73, 90.39, NULL, true)"
                       ).fetchone()["p_user_id"]
    row = conn.execute("SELECT account_type FROM app_user WHERE user_id = %s", (uid,)).fetchone()
    assert row["account_type"] == "member"
    assert conn.execute("SELECT * FROM start_session('01699999999', 'secret1')").fetchone()["user_id"] == uid
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("CALL register_donor('Again', '01699999999', 'secret1', 'O+', 23.73, 90.39, NULL, false)")
    assert exc.value.sqlstate == "BR014"


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
    rid = new_request(conn, approve=False)
    text = text.replace("{d}", date.today().strftime("%d/%m/%Y"))
    row = conn.execute("SELECT c.* FROM blood_request r, auto_check_slip(r.slip_id, %s) c WHERE r.request_id = %s",
                       (text, rid)).fetchone()
    assert row["check_status"] == status
    assert row["failed_checks"] == failed


def test_ab_positive_text_does_not_pass_a_b_positive_request(conn):
    rid = new_request(conn, group="B+", approve=False)
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
