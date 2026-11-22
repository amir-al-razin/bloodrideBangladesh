-- Walks the Sprint 1 flow in SQL and rolls everything back.
--   psql -p 5433 -U postgres -d bloodride -f db/smoke_test.sql
\set ON_ERROR_STOP on
BEGIN;

\echo '--- blood groups'
SELECT blood_group, count(*) FROM donor GROUP BY 1 ORDER BY 2 DESC;

\echo '--- 1. submit a request as a guest (AB-, 1 bag, Dhaka Medical College)'
CALL submit_request(1, 'Rahim Uddin', '01611111111', 'AB-', 1, 'emergency',
                    now() + interval '3 hours', '/tmp/slip.jpg', 'smoke-test-hash', NULL, NULL);
SELECT request_id, status, requester_id, (SELECT account_type FROM app_user WHERE user_id = requester_id)
  FROM blood_request ORDER BY request_id DESC LIMIT 1;

\echo '--- 2. first alert round, straight after upload (no verification needed)'
CALL send_alert_wave(currval('blood_request_request_id_seq')::int, 10, 10, NULL, 0);

\echo '--- 3. slip check from OCR text (recorded for the admin)'
SELECT * FROM auto_check_slip(currval('requisition_slip_slip_id_seq')::int,
  E'DHAKA MEDICAL COLLEGE HOSPITAL\nPatient: Rahim Uddin\nBlood group: AB (-ve)  1 bag\nDate: '
  || to_char(current_date, 'DD/MM/YYYY') || E'\nDr. Karim, BMDC Reg No: A-12345');

\echo '--- 4. who was alerted'
SELECT donor_id, distance_km, round_no FROM donor_alert
 WHERE request_id = currval('blood_request_request_id_seq') ORDER BY distance_km;

\echo '--- 5. two donors accept; the first wins, the second becomes a backup'
SELECT donor_id AS first_id  FROM donor_alert WHERE request_id = currval('blood_request_request_id_seq') ORDER BY distance_km LIMIT 1 \gset
SELECT donor_id AS second_id FROM donor_alert WHERE request_id = currval('blood_request_request_id_seq') ORDER BY distance_km OFFSET 1 LIMIT 1 \gset
CALL accept_request(currval('blood_request_request_id_seq')::int, :first_id, true, NULL, NULL);
CALL accept_request(currval('blood_request_request_id_seq')::int, :second_id, false, NULL, NULL);

\echo '--- 6. live board view and audit trail'
SELECT alerted, seen, declined, accepted, backup, status FROM v_request_progress
 WHERE request_id = currval('blood_request_request_id_seq');
SELECT e.* FROM mission_event e JOIN mission m USING (mission_id)
 WHERE m.request_id = currval('blood_request_request_id_seq');

\echo '--- 7. a donation sets next_eligible_date to +90 days (trigger)'
INSERT INTO donation (donor_id, mission_id, donated_on, source)
SELECT donor_id, mission_id, current_date, 'bloodride' FROM mission
 WHERE request_id = currval('blood_request_request_id_seq');
SELECT user_id, next_eligible_date, next_eligible_date - current_date AS days FROM donor WHERE user_id = :first_id;

\echo '--- 8. that donor can no longer be alerted (trigger, BR001)'
SAVEPOINT s2;
\set ON_ERROR_STOP off
INSERT INTO donor_alert (request_id, donor_id, round_no, distance_km)
VALUES (currval('blood_request_request_id_seq')::int, :first_id, 9, 1);
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT s2;

ROLLBACK;
\echo 'smoke test done (rolled back)'
