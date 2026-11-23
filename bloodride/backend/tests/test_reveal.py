"""'Reveal all numbers' rules and the donor self-report (23 Nov). Each test is rolled back."""
from datetime import date, timedelta

import psycopg
import pytest

def new_request(conn, group="AB-", tag="reveal-hash"):
    conn.execute("CALL submit_request(1, 'Test Patient', '01699999999', %s, 1, 'urgent', now() + interval '1 day',"
                 " 'reveal.png', %s)", (group, tag))
    return conn.execute(
        """SELECT r.tracking_token, r.slip_id, r.request_id
             FROM blood_request r JOIN requisition_slip s USING (slip_id)
            WHERE s.image_hash = %s""", (tag,)).fetchone()


def verify(conn, slip_id):
    conn.execute("CALL review_slip(%s, 1, true)", (slip_id,))


def should_show(conn, group, requester_phone="01699999999"):
    return {r["user_id"] for r in conn.execute(
        """SELECT d.user_id FROM donor d JOIN app_user u USING (user_id)
            WHERE d.blood_group = %s AND d.listed_for_reveal AND d.is_available
              AND (d.next_eligible_date IS NULL OR d.next_eligible_date <= current_date)
              AND u.phone <> %s""", (group, requester_phone))}


def test_unlock_needs_a_verified_slip(conn):
    req = new_request(conn)
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],))
    assert exc.value.sqlstate == "BR009"


def test_list_is_locked_until_unlocked(conn):
    req = new_request(conn)
    verify(conn, req["slip_id"])
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("SELECT * FROM unlocked_donors(%s)", (req["tracking_token"],))
    assert exc.value.sqlstate == "BR010"


def test_shows_every_opted_in_eligible_donor_of_the_group_nearest_first(conn):
    req = new_request(conn)
    verify(conn, req["slip_id"])
    conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],))
    rows = conn.execute("SELECT * FROM unlocked_donors(%s)", (req["tracking_token"],)).fetchall()
    assert {r["donor_id"] for r in rows} == should_show(conn, "AB-")
    distances = [r["distance_km"] for r in rows]
    assert distances == sorted(distances)
    assert all(r["phone"] for r in rows)


def test_opted_out_paused_or_resting_donors_drop_off_the_list(conn):
    req = new_request(conn)
    verify(conn, req["slip_id"])
    conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],))
    first = [r["donor_id"] for r in conn.execute("SELECT * FROM unlocked_donors(%s)", (req["tracking_token"],))]
    a, b, c = first[:3]
    conn.execute("UPDATE donor SET listed_for_reveal = false WHERE user_id = %s", (a,))
    conn.execute("UPDATE donor SET is_available = false WHERE user_id = %s", (b,))
    conn.execute("INSERT INTO donation (donor_id, donated_on, source) VALUES (%s, current_date, 'self_reported')", (c,))
    now = {r["donor_id"] for r in conn.execute("SELECT * FROM unlocked_donors(%s)", (req["tracking_token"],))}
    assert not {a, b, c} & now
    logged = conn.execute("SELECT count(*) AS n FROM contact_reveal WHERE request_id = %s", (req["request_id"],)).fetchone()["n"]
    assert logged == len(first)                     # the log keeps everyone who was ever shown


def test_newly_opted_in_donor_appears(conn):
    req = new_request(conn)
    verify(conn, req["slip_id"])
    conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],))
    hidden = conn.execute(
        """SELECT user_id FROM donor WHERE blood_group = 'AB-' AND NOT listed_for_reveal AND is_available
            AND (next_eligible_date IS NULL OR next_eligible_date <= current_date) LIMIT 1""").fetchone()
    if not hidden:
        pytest.skip("every eligible AB- donor already opted in")
    conn.execute("UPDATE donor SET listed_for_reveal = true WHERE user_id = %s", (hidden["user_id"],))
    ids = {r["donor_id"] for r in conn.execute("SELECT * FROM unlocked_donors(%s)", (req["tracking_token"],))}
    assert hidden["user_id"] in ids


def test_unlocking_twice_keeps_the_first_time(conn):
    req = new_request(conn)
    verify(conn, req["slip_id"])
    first = conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],)).fetchone()["p_unlocked_at"]
    again = conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],)).fetchone()["p_unlocked_at"]
    assert first == again


def test_closes_when_the_request_ends_or_after_48_hours(conn):
    req = new_request(conn)
    verify(conn, req["slip_id"])
    conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],))
    conn.execute("UPDATE blood_request SET contacts_unlocked_at = now() - interval '49 hours' WHERE request_id = %s",
                 (req["request_id"],))
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("SELECT * FROM unlocked_donors(%s)", (req["tracking_token"],))
    assert exc.value.sqlstate == "BR011"


def test_rejected_slip_cannot_unlock(conn):
    req = new_request(conn)
    conn.execute("CALL review_slip(%s, 1, false)", (req["slip_id"],))      # rejected -> request cancelled
    with pytest.raises(psycopg.Error) as exc:
        conn.execute("CALL unlock_contacts(%s)", (req["tracking_token"],))
    assert exc.value.sqlstate == "BR006"


def test_self_reported_donation_starts_the_90_day_wait(conn):
    donor = conn.execute("SELECT user_id FROM app_user WHERE phone = '01800000002'").fetchone()["user_id"]
    day = date.today() - timedelta(days=20)
    conn.execute("INSERT INTO donation (donor_id, donated_on, source) VALUES (%s, %s, 'self_reported')", (donor, day))
    nxt = conn.execute("SELECT next_eligible_date FROM donor WHERE user_id = %s", (donor,)).fetchone()["next_eligible_date"]
    assert nxt == day + timedelta(days=90)
