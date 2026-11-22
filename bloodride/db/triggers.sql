-- BloodRide triggers (Sprint 1). Owner: Razin.
-- Named errors use SQLSTATE class BR so the API can turn them into clear messages:
--   BR001 donor_not_eligible   BR002 slip_rejected   BR005 status_backwards

-- ---------------------------------------------------------------
-- 1. trg_set_next_eligible
--    AFTER INSERT on donation, statement-level with a transition table.
--    next_eligible_date = the donor's latest donation + 90 days.
--    This is the only place that column is written (declared derived column).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_next_eligible() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE donor d
       SET next_eligible_date = latest.last_donated + 90
      FROM (SELECT dn.donor_id, max(dn.donated_on) AS last_donated
              FROM donation dn
             WHERE dn.donor_id IN (SELECT DISTINCT donor_id FROM new_rows)
             GROUP BY dn.donor_id) AS latest
     WHERE d.user_id = latest.donor_id;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_set_next_eligible
    AFTER INSERT ON donation
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION set_next_eligible();

-- ---------------------------------------------------------------
-- 2. trg_check_donor_eligibility
--    BEFORE INSERT on donor_alert and on mission:
--    blocks donors still inside their 90-day wait, or marked unavailable.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_donor_eligibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_next  date;
    v_avail boolean;
BEGIN
    SELECT next_eligible_date, is_available INTO v_next, v_avail
      FROM donor WHERE user_id = NEW.donor_id;

    IF v_next IS NOT NULL AND v_next > current_date THEN
        RAISE EXCEPTION 'donor_not_eligible: donor % can donate again on %', NEW.donor_id, v_next
              USING ERRCODE = 'BR001';
    END IF;
    IF NOT v_avail THEN
        RAISE EXCEPTION 'donor_not_eligible: donor % is marked unavailable', NEW.donor_id
              USING ERRCODE = 'BR001';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_check_donor_eligibility
    BEFORE INSERT ON donor_alert
    FOR EACH ROW EXECUTE FUNCTION check_donor_eligibility();

CREATE TRIGGER trg_check_donor_eligibility
    BEFORE INSERT ON mission
    FOR EACH ROW EXECUTE FUNCTION check_donor_eligibility();

-- ---------------------------------------------------------------
-- 3. trg_block_rejected_slip
--    BEFORE INSERT on donor_alert: alerts go out as soon as the slip is
--    uploaded (decision of 22 Nov); only a slip an admin REJECTED stops them.
--    (Replaces trg_require_verified_slip from the DBMS proposal.)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_rejected_slip() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
BEGIN
    SELECT s.check_status INTO v_status
      FROM blood_request r JOIN requisition_slip s USING (slip_id)
     WHERE r.request_id = NEW.request_id;

    IF v_status = 'rejected' THEN
        RAISE EXCEPTION 'slip_rejected: request % has a rejected slip', NEW.request_id
              USING ERRCODE = 'BR002';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_block_rejected_slip
    BEFORE INSERT ON donor_alert
    FOR EACH ROW EXECUTE FUNCTION block_rejected_slip();

-- ---------------------------------------------------------------
-- 4. trg_log_status_change
--    On mission: the status may only move forward; every change
--    (and the first status) is written to mission_event.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION mission_status_rank(p_status text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
    SELECT array_position(ARRAY['reserved', 'en_route', 'at_hospital', 'donated',
                                'resting', 'returning', 'completed'], p_status)
$$;

CREATE OR REPLACE FUNCTION log_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.status = OLD.status THEN
            RETURN NULL;
        END IF;
        IF OLD.status IN ('completed', 'failed_screening', 'cancelled') THEN
            RAISE EXCEPTION 'status_backwards: mission % is already %', OLD.mission_id, OLD.status
                  USING ERRCODE = 'BR005';
        END IF;
        -- failed_screening and cancelled may end a mission at any point; otherwise forward only
        IF NEW.status NOT IN ('failed_screening', 'cancelled')
           AND mission_status_rank(NEW.status) <= mission_status_rank(OLD.status) THEN
            RAISE EXCEPTION 'status_backwards: mission % cannot go from % to %',
                  OLD.mission_id, OLD.status, NEW.status
                  USING ERRCODE = 'BR005';
        END IF;
    END IF;

    INSERT INTO mission_event (mission_id, seq, from_status, to_status)
    SELECT NEW.mission_id,
           coalesce(max(seq), 0) + 1,
           CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
           NEW.status
      FROM mission_event WHERE mission_id = NEW.mission_id;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_log_status_change
    AFTER INSERT OR UPDATE OF status ON mission
    FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- ---------------------------------------------------------------
-- 5. trg_notify_live_board
--    AFTER INSERT / UPDATE on donor_alert (statement-level): one NOTIFY
--    per request touched, so open tracking pages refresh their counts.
--    Also fires when a request's status changes (e.g. filled).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_live_board() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_id int;
BEGIN
    FOR v_id IN SELECT DISTINCT request_id FROM changed_rows LOOP
        PERFORM pg_notify('live_board', v_id::text);
    END LOOP;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_notify_live_board_ins
    AFTER INSERT ON donor_alert
    REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION notify_live_board();

CREATE TRIGGER trg_notify_live_board_upd
    AFTER UPDATE ON donor_alert
    REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION notify_live_board();

CREATE TRIGGER trg_notify_live_board_req   -- transition tables cannot be combined with "UPDATE OF column"
    AFTER UPDATE ON blood_request
    REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION notify_live_board();
