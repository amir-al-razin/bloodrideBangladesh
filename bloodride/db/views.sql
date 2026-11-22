-- BloodRide views (Sprint 1).

-- Live request board: counts per request, read by the tracking page.
CREATE OR REPLACE VIEW v_request_progress AS
SELECT r.request_id,
       r.tracking_token,
       r.status,
       r.blood_group,
       r.bags_needed,
       r.urgency,
       r.needed_by,
       r.created_at,
       h.name                                                  AS hospital,
       s.check_status                                          AS slip_status,
       count(a.donor_id)                                       AS alerted,
       count(a.donor_id) FILTER (WHERE a.seen_at IS NOT NULL)  AS seen,
       count(a.donor_id) FILTER (WHERE a.response = 'declined') AS declined,
       count(a.donor_id) FILTER (WHERE a.response = 'accepted') AS accepted,
       count(a.donor_id) FILTER (WHERE a.response = 'backup')   AS backup,
       coalesce(max(a.round_no), 0)                            AS rounds
  FROM blood_request r
  JOIN hospital h USING (hospital_id)
  JOIN requisition_slip s USING (slip_id)
  LEFT JOIN donor_alert a USING (request_id)
 GROUP BY r.request_id, h.name, s.check_status;

-- Slips waiting for an admin, oldest first (used by the demo admin page).
CREATE OR REPLACE VIEW v_slip_review_queue AS
SELECT s.slip_id, s.image_path, r.request_id, r.blood_group, r.bags_needed, r.urgency,
       h.name AS hospital, u.full_name AS requester, u.phone, r.created_at
  FROM requisition_slip s
  JOIN blood_request r USING (slip_id)
  JOIN hospital h USING (hospital_id)
  JOIN app_user u ON u.user_id = r.requester_id
 WHERE s.check_status = 'needs_review' AND r.status <> 'cancelled'
 ORDER BY r.created_at;
