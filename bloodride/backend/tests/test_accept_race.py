"""Two donors press Accept at the same moment: exactly one wins, the other becomes a backup.
Owner: Farhan."""
import threading

import psycopg

from conftest import connect


def test_two_donors_accept_at_the_same_moment(verified_request):
    rid, donors = verified_request
    assert len(donors) >= 2, "need at least two alerted donors"
    first, second = donors[:2]

    start = threading.Barrier(2)
    results, errors = {}, []

    def accept(donor_id):
        try:
            with connect() as c:
                start.wait()                                   # both threads call at the same instant
                row = c.execute("CALL accept_request(%s, %s, false)", (rid, donor_id)).fetchone()
                results[donor_id] = row["p_result"]
        except Exception as exc:                               # noqa: BLE001 - reported below
            errors.append(exc)

    threads = [threading.Thread(target=accept, args=(d,)) for d in (first, second)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=20)

    assert not errors, errors
    assert sorted(results.values()) == ["accepted", "backup"]
    with connect() as c:
        missions = c.execute("SELECT count(*) AS n FROM mission WHERE request_id = %s", (rid,)).fetchone()["n"]
        status = c.execute("SELECT status FROM blood_request WHERE request_id = %s", (rid,)).fetchone()["status"]
    assert missions == 1
    assert status == "filled"


def test_many_donors_race_for_one_bag(verified_request):
    """Every alerted donor accepts at once; still exactly one mission."""
    rid, donors = verified_request
    start = threading.Barrier(len(donors))
    results = []

    def accept(donor_id):
        with connect() as c:
            start.wait()
            results.append(c.execute("CALL accept_request(%s, %s, false)", (rid, donor_id)).fetchone()["p_result"])

    threads = [threading.Thread(target=accept, args=(d,)) for d in donors]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert results.count("accepted") == 1
    assert results.count("backup") == len(donors) - 1


def test_accepting_twice_is_refused(verified_request):
    rid, donors = verified_request
    with connect() as c:
        c.execute("CALL accept_request(%s, %s, true)", (rid, donors[0]))
        try:
            c.execute("CALL accept_request(%s, %s, true)", (rid, donors[0]))
            raise AssertionError("second accept should fail")
        except psycopg.Error as err:
            assert err.sqlstate == "BR007"                     # already_responded
