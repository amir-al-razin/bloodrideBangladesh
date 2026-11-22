"""Shared fixtures. Tests run against the database in DATABASE_URL (the local dev database by default)
and remove everything they create."""
import os
import sys
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import DATABASE_URL  # noqa: E402

DB = os.getenv("TEST_DATABASE_URL", DATABASE_URL)


def connect(autocommit=True):
    return psycopg.connect(DB, autocommit=autocommit, row_factory=dict_row)


@pytest.fixture
def conn():
    """A connection inside a transaction that is rolled back after the test."""
    c = connect(autocommit=False)
    yield c
    c.rollback()
    c.close()


@pytest.fixture
def verified_request():
    """A committed AB- request (1 bag) at hospital 1, with round 1 sent (alerts go out on upload).
    Yields (request_id, [alerted donor ids, nearest first]). Cleaned up afterwards."""
    tag = uuid.uuid4().hex
    phone = "0161" + str(uuid.uuid4().int)[:7]
    with connect() as c:
        row = c.execute(
            "CALL submit_request(1, 'Test Patient', %s, 'AB-', 1, 'emergency', now() + interval '2 hours',"
            " 'test.png', %s)", (phone, tag)).fetchone()
        rid = row["p_request_id"]
        c.execute("CALL send_alert_wave(%s, 10, 10)", (rid,))
        donors = [r["donor_id"] for r in c.execute(
            "SELECT donor_id FROM donor_alert WHERE request_id = %s ORDER BY distance_km", (rid,))]
    yield rid, donors
    with connect() as c:
        c.execute("DELETE FROM donation WHERE mission_id IN (SELECT mission_id FROM mission WHERE request_id = %s)", (rid,))
        c.execute("DELETE FROM mission WHERE request_id = %s", (rid,))
        c.execute("DELETE FROM blood_request WHERE request_id = %s", (rid,))
        c.execute("DELETE FROM requisition_slip WHERE image_hash = %s", (tag,))
        c.execute("DELETE FROM app_user WHERE phone = %s AND account_type = 'guest'", (phone,))
