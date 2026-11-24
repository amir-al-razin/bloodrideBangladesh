-- BloodRide procedures and functions (Sprint 1).
-- Owners: Mostafa (search, alert wave, submit_request), Farhan (accept_request), Ayman (auto_check_slip).
-- Named errors (SQLSTATE class BR):
--   BR003 request_not_found   BR004 alert_not_found   BR006 request_closed   BR007 already_responded

-- ---------------------------------------------------------------
-- submit_request: save the slip and the request together.
-- A phone number that is not registered yet becomes a guest account.
-- A reused slip image fails on requisition_slip.image_hash (unique).
-- ---------------------------------------------------------------
CREATE OR REPLACE PROCEDURE submit_request(
    p_hospital_id int, p_full_name text, p_phone text,
    p_blood_group text, p_bags int, p_urgency text, p_needed_by timestamptz,
    p_image_path text, p_image_hash text,
    INOUT p_request_id int DEFAULT NULL, INOUT p_token text DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_user int;
    v_slip int;
BEGIN
    IF EXISTS (SELECT 1 FROM app_user WHERE phone = p_phone AND is_blocked) THEN
        RAISE EXCEPTION 'phone_blocked: % may not send requests', p_phone USING ERRCODE = 'BR015';
    END IF;
    SELECT user_id INTO v_user FROM app_user WHERE phone = p_phone;
    IF NOT FOUND THEN
        INSERT INTO app_user (full_name, phone, account_type)
        VALUES (p_full_name, p_phone, 'guest')
        RETURNING user_id INTO v_user;
    END IF;

    INSERT INTO requisition_slip (image_path, image_hash)
    VALUES (p_image_path, p_image_hash)
    RETURNING slip_id INTO v_slip;

    INSERT INTO blood_request (slip_id, hospital_id, requester_id, blood_group,
                               bags_needed, urgency, needed_by)
    VALUES (v_slip, p_hospital_id, v_user, p_blood_group, p_bags, p_urgency, p_needed_by)
    RETURNING request_id, tracking_token INTO p_request_id, p_token;
END $$;

-- ---------------------------------------------------------------
-- auto_check_slip: decides auto_verified or needs_review from the OCR text.
-- Checks: hospital name, blood group, a date in the last 7 days, a doctor's
-- registration number. Reuse is already blocked by image_hash UNIQUE.
-- Never overrides an admin decision.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_check_slip(p_slip_id int, p_ocr_text text)
RETURNS TABLE (check_status text, failed_checks text[])
LANGUAGE plpgsql AS $$
DECLARE
    v_req    blood_request%ROWTYPE;
    v_hosp   text;
    v_txt    text;
    v_failed text[] := '{}';
    v_words  int;
    v_found  int;
    v_date   date;
    v_reg    text;
    m        text[];
BEGIN
    SELECT * INTO v_req FROM blood_request WHERE slip_id = p_slip_id;
    SELECT name INTO v_hosp FROM hospital WHERE hospital_id = v_req.hospital_id;

    -- normalise: upper case, one space, "AB -ve" / "AB negative" / "AB−" -> "AB-"
    v_txt := upper(coalesce(p_ocr_text, ''));
    v_txt := replace(replace(v_txt, '−', '-'), '–', '-');
    v_txt := regexp_replace(v_txt, '\s+', ' ', 'g');
    v_txt := regexp_replace(v_txt, '\(?\s*(POSITIVE|POS|\+\s*VE)\s*\)?', '+', 'g');
    v_txt := regexp_replace(v_txt, '\(?\s*(NEGATIVE|NEG|-\s*VE)\s*\)?', '-', 'g');
    v_txt := regexp_replace(v_txt, '(^|[^A-Z])(AB|A|B|O)\s*([+-])', '\1\2\3', 'g');

    -- 1. hospital: most of the name's longer words appear
    SELECT count(*), count(*) FILTER (WHERE position(w IN v_txt) > 0)
      INTO v_words, v_found
      FROM regexp_split_to_table(upper(v_hosp), '[^A-Z]+') AS w
     WHERE length(w) > 3;
    IF v_words = 0 OR v_found::numeric / v_words < 0.6 THEN
        v_failed := array_append(v_failed, 'hospital');
    END IF;

    -- 2. blood group, with a boundary so "AB+" does not count as "B+"
    IF v_txt !~ ('(^|[^A-Z])' || regexp_replace(v_req.blood_group, '([+])', '\\\1') || '([^A-Z0-9]|$)') THEN
        v_failed := array_append(v_failed, 'blood_group');
    END IF;

    -- 3. a date (dd/mm/yyyy, dd-mm-yyyy or dd.mm.yyyy) within the last 7 days
    FOR m IN SELECT regexp_matches(v_txt, '([0-3]?[0-9])[/.-]([01]?[0-9])[/.-](20[0-9]{2})', 'g') LOOP
        BEGIN
            v_date := make_date(m[3]::int, m[2]::int, m[1]::int);
        EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
            CONTINUE;   -- not a real date, try the next match
        END;
        EXIT WHEN v_date BETWEEN current_date - 7 AND current_date;
        v_date := NULL;
    END LOOP;
    IF v_date IS NULL THEN
        v_failed := array_append(v_failed, 'date');
    END IF;

    -- 4. a doctor's registration number (e.g. "BMDC Reg No: A-12345")
    v_reg := substring(v_txt FROM '(?:BMDC|REG(?:ISTRATION)?)[^0-9A-Z]{0,12}(?:NO\.?)?[^0-9A-Z]{0,4}((?:[A-Z]-?)?[0-9]{3,6})');
    IF v_reg IS NULL THEN
        v_failed := array_append(v_failed, 'doctor_reg_no');
    END IF;

    UPDATE requisition_slip s
       SET check_status  = CASE WHEN cardinality(v_failed) = 0 THEN 'auto_verified' ELSE 'needs_review' END,
           issued_on     = coalesce(v_date, s.issued_on),
           doctor_reg_no = coalesce(v_reg, s.doctor_reg_no)
     WHERE s.slip_id = p_slip_id
       AND s.check_status = 'needs_review';            -- never override an admin decision

    RETURN QUERY SELECT s.check_status, v_failed FROM requisition_slip s WHERE s.slip_id = p_slip_id;
END $$;

-- ---------------------------------------------------------------
-- review_slip: a staff member of the request's hospital (or a BloodRide admin)
-- approves the slip, which lets alerts go out, or rejects a fake one, which
-- cancels the request. A slip can only be decided once.
-- Named errors: BR008 not_allowed   BR012 already_reviewed
-- ---------------------------------------------------------------
CREATE OR REPLACE PROCEDURE review_slip(p_slip_id int, p_user_id int, p_approve boolean)
LANGUAGE plpgsql AS $$
DECLARE
    v_hospital int;
    v_check    text;
BEGIN
    SELECT r.hospital_id, s.check_status INTO v_hospital, v_check
      FROM requisition_slip s JOIN blood_request r USING (slip_id)
     WHERE s.slip_id = p_slip_id
       FOR UPDATE OF s;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found: slip %', p_slip_id USING ERRCODE = 'BR003';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app_user WHERE user_id = p_user_id AND account_type = 'admin')
       AND NOT EXISTS (SELECT 1 FROM hospital_staff WHERE user_id = p_user_id AND hospital_id = v_hospital) THEN
        RAISE EXCEPTION 'not_allowed: user % cannot review requests of hospital %', p_user_id, v_hospital
              USING ERRCODE = 'BR008';
    END IF;
    IF v_check NOT IN ('needs_review', 'auto_verified') THEN
        RAISE EXCEPTION 'already_reviewed: slip % is already %', p_slip_id, v_check USING ERRCODE = 'BR012';
    END IF;

    UPDATE requisition_slip
       SET check_status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
           reviewed_by = p_user_id, reviewed_at = now()
     WHERE slip_id = p_slip_id;
    IF NOT p_approve THEN
        UPDATE blood_request SET status = 'cancelled' WHERE slip_id = p_slip_id;
    END IF;
    -- tell the patient's open tracking page
    PERFORM pg_notify('live_board', request_id::text) FROM blood_request WHERE slip_id = p_slip_id;
END $$;

-- ---------------------------------------------------------------
-- donors_in_ring: eligible donors of the request's blood group within
-- p_max_km of the hospital, nearest first, not alerted for this request yet.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION donors_in_ring(p_request_id int, p_max_km numeric)
RETURNS TABLE (donor_id int, distance_km numeric)
LANGUAGE sql STABLE AS $$
    SELECT d.user_id,
           round((ST_Distance(d.home_location, h.location) / 1000)::numeric, 2)
      FROM blood_request r
      JOIN hospital h USING (hospital_id)
      JOIN donor d ON d.blood_group = r.blood_group
     WHERE r.request_id = p_request_id
       AND d.is_available
       AND (d.next_eligible_date IS NULL OR d.next_eligible_date <= current_date)
       AND d.user_id <> r.requester_id
       AND ST_DWithin(d.home_location, h.location, p_max_km * 1000)
       AND NOT EXISTS (SELECT 1 FROM donor_alert a
                        WHERE a.request_id = r.request_id AND a.donor_id = d.user_id)
     ORDER BY ST_Distance(d.home_location, h.location)
$$;

-- ---------------------------------------------------------------
-- send_alert_wave: one round of alerts. Walks donors_in_ring with an
-- explicit cursor and alerts up to p_batch donors. The API calls it once on
-- approval and then again on a timer with a wider radius, until a donor
-- accepts or the last round has gone out. Needs an approved slip.
-- ---------------------------------------------------------------
CREATE OR REPLACE PROCEDURE send_alert_wave(
    p_request_id int, p_radius_km numeric, p_batch int,
    INOUT p_round int DEFAULT NULL, INOUT p_alerted int DEFAULT 0)
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_check  text;
    rec      record;
    cur CURSOR FOR SELECT * FROM donors_in_ring(p_request_id, p_radius_km);
BEGIN
    SELECT r.status, s.check_status, r.search_round + 1 INTO v_status, v_check, p_round
      FROM blood_request r JOIN requisition_slip s USING (slip_id)
     WHERE r.request_id = p_request_id
       FOR UPDATE OF r;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found: %', p_request_id USING ERRCODE = 'BR003';
    END IF;
    IF v_status NOT IN ('open', 'searching') THEN
        RAISE EXCEPTION 'request_closed: request % is %', p_request_id, v_status USING ERRCODE = 'BR006';
    END IF;
    IF v_check <> 'verified' THEN
        RAISE EXCEPTION 'slip_not_approved: request % slip is %', p_request_id, v_check USING ERRCODE = 'BR002';
    END IF;

    p_alerted := 0;
    OPEN cur;
    LOOP
        EXIT WHEN p_alerted >= p_batch;
        FETCH cur INTO rec;
        EXIT WHEN NOT FOUND;
        INSERT INTO donor_alert (request_id, donor_id, round_no, distance_km)
        VALUES (p_request_id, rec.donor_id, p_round, rec.distance_km);
        p_alerted := p_alerted + 1;
    END LOOP;
    CLOSE cur;

    UPDATE blood_request
       SET search_round = p_round, last_wave_at = now(),
           status = CASE WHEN status = 'open' THEN 'searching' ELSE status END
     WHERE request_id = p_request_id;
END $$;

-- ---------------------------------------------------------------
-- accept_request: the first donors to accept fill the bags; later ones
-- become backups. The request row is locked (FOR UPDATE), so two donors
-- pressing Accept at the same moment are handled one after the other.
-- p_result: 'accepted' or 'backup'.
-- ---------------------------------------------------------------
CREATE OR REPLACE PROCEDURE accept_request(
    p_request_id int, p_donor_id int, p_share_phone boolean,
    INOUT p_result text DEFAULT NULL, INOUT p_mission_id int DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_bags   int;
    v_resp   text;
    v_active int;
BEGIN
    SELECT status, bags_needed INTO v_status, v_bags
      FROM blood_request WHERE request_id = p_request_id
       FOR UPDATE;                                   -- the lock: one acceptance at a time per request
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found: %', p_request_id USING ERRCODE = 'BR003';
    END IF;

    SELECT response INTO v_resp FROM donor_alert
     WHERE request_id = p_request_id AND donor_id = p_donor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'alert_not_found: donor % was not alerted for request %', p_donor_id, p_request_id
              USING ERRCODE = 'BR004';
    END IF;
    IF v_resp <> 'pending' THEN
        RAISE EXCEPTION 'already_responded: donor % already answered %', p_donor_id, v_resp
              USING ERRCODE = 'BR007';
    END IF;
    IF v_status IN ('closed', 'cancelled') THEN
        RAISE EXCEPTION 'request_closed: request % is %', p_request_id, v_status USING ERRCODE = 'BR006';
    END IF;

    SELECT count(*) INTO v_active FROM mission
     WHERE request_id = p_request_id AND status NOT IN ('failed_screening', 'cancelled');

    IF v_active < v_bags THEN
        INSERT INTO mission (request_id, donor_id, phone_shared)
        VALUES (p_request_id, p_donor_id, p_share_phone)
        RETURNING mission_id INTO p_mission_id;
        UPDATE donor_alert SET response = 'accepted', responded_at = now(), seen_at = coalesce(seen_at, now())
         WHERE request_id = p_request_id AND donor_id = p_donor_id;
        IF v_active + 1 >= v_bags THEN
            UPDATE blood_request SET status = 'filled' WHERE request_id = p_request_id;
        END IF;
        p_result := 'accepted';
    ELSE
        UPDATE donor_alert SET response = 'backup', responded_at = now(), seen_at = coalesce(seen_at, now())
         WHERE request_id = p_request_id AND donor_id = p_donor_id;
        p_result := 'backup';
    END IF;
END $$;

-- ---------------------------------------------------------------
-- Show donor numbers (23 Nov). Free: numbers are never sold (decided 24 Nov).
-- Named errors: BR009 slip_not_verified   BR010 contacts_locked   BR011 contacts_expired
-- ---------------------------------------------------------------

-- unlock_contacts: a patient with a VERIFIED slip turns on "reveal all numbers" for their request.
-- Pressing it again changes nothing (the first unlock time is kept, so the 48 hours do not restart).
CREATE OR REPLACE PROCEDURE unlock_contacts(
    p_token text, INOUT p_request_id int DEFAULT NULL, INOUT p_unlocked_at timestamptz DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_check  text;
BEGIN
    SELECT r.request_id, r.status, s.check_status, r.contacts_unlocked_at
      INTO p_request_id, v_status, v_check, p_unlocked_at
      FROM blood_request r JOIN requisition_slip s USING (slip_id)
     WHERE r.tracking_token = p_token
       FOR UPDATE OF r;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found: no request with this link' USING ERRCODE = 'BR003';
    END IF;
    IF v_status IN ('closed', 'cancelled') THEN
        RAISE EXCEPTION 'request_closed: request % is %', p_request_id, v_status USING ERRCODE = 'BR006';
    END IF;
    IF v_check <> 'verified' THEN
        RAISE EXCEPTION 'slip_not_verified: request % slip is %', p_request_id, v_check USING ERRCODE = 'BR009';
    END IF;
    IF p_unlocked_at IS NULL THEN
        UPDATE blood_request SET contacts_unlocked_at = now()
         WHERE request_id = p_request_id
        RETURNING contacts_unlocked_at INTO p_unlocked_at;
    END IF;
END $$;

-- unlocked_donors: the current list for an unlocked request. Re-evaluated on every call, so it
-- updates by itself: donors who opt in, become eligible or come back from a pause appear; donors who
-- opt out, pause or donate (90-day wait) disappear. Every donor shown is logged in contact_reveal.
CREATE OR REPLACE FUNCTION unlocked_donors(p_token text)
RETURNS TABLE (donor_id int, full_name text, phone text, campus text, distance_km numeric, first_shown_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE
    r blood_request%ROWTYPE;
BEGIN
    SELECT * INTO r FROM blood_request WHERE tracking_token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found: no request with this link' USING ERRCODE = 'BR003';
    END IF;
    IF r.contacts_unlocked_at IS NULL THEN
        RAISE EXCEPTION 'contacts_locked: request % has not unlocked donor numbers', r.request_id USING ERRCODE = 'BR010';
    END IF;
    IF r.status IN ('closed', 'cancelled') OR now() > r.contacts_unlocked_at + interval '48 hours' THEN
        RAISE EXCEPTION 'contacts_expired: request % can no longer see donor numbers', r.request_id USING ERRCODE = 'BR011';
    END IF;

    -- log the donors shown for the first time
    INSERT INTO contact_reveal (request_id, donor_id)
    SELECT r.request_id, d.user_id
      FROM donor d
     WHERE d.blood_group = r.blood_group AND d.listed_for_reveal AND d.is_available
       AND (d.next_eligible_date IS NULL OR d.next_eligible_date <= current_date)
       AND d.user_id <> r.requester_id
    ON CONFLICT DO NOTHING;

    RETURN QUERY
    SELECT d.user_id, u.full_name, u.phone, c.name,
           round((ST_Distance(d.home_location, h.location) / 1000)::numeric, 1),
           cr.revealed_at
      FROM donor d
      JOIN app_user u ON u.user_id = d.user_id
      LEFT JOIN campus c ON c.campus_id = u.campus_id
      JOIN hospital h ON h.hospital_id = r.hospital_id
      JOIN contact_reveal cr ON cr.request_id = r.request_id AND cr.donor_id = d.user_id
     WHERE d.blood_group = r.blood_group AND d.listed_for_reveal AND d.is_available
       AND (d.next_eligible_date IS NULL OR d.next_eligible_date <= current_date)
       AND d.user_id <> r.requester_id
     ORDER BY ST_Distance(d.home_location, h.location);
END $$;

-- ---------------------------------------------------------------
-- Accounts (24 Nov). Passwords are stored as bcrypt hashes (pgcrypto).
-- Named errors: BR013 bad_login   BR014 phone_taken
-- ---------------------------------------------------------------

-- start_session: checks the phone and password and opens a 30-day session.
CREATE OR REPLACE FUNCTION start_session(p_phone text, p_password text)
RETURNS TABLE (token text, user_id int, account_type text)
LANGUAGE plpgsql AS $$
DECLARE
    v_user app_user%ROWTYPE;
BEGIN
    SELECT * INTO v_user FROM app_user u WHERE u.phone = p_phone;
    IF NOT FOUND OR v_user.password_hash IS NULL
       OR v_user.password_hash <> crypt(p_password, v_user.password_hash) THEN
        RAISE EXCEPTION 'bad_login: wrong phone number or password' USING ERRCODE = 'BR013';
    END IF;
    DELETE FROM user_session s WHERE s.user_id = v_user.user_id AND s.expires_at < now();
    RETURN QUERY
    INSERT INTO user_session (user_id) VALUES (v_user.user_id)
    RETURNING user_session.token, user_session.user_id, v_user.account_type;
END $$;

-- register_donor: a new donor account. A phone number that was only used as a guest
-- (someone who once requested blood) becomes a full account; a registered one is refused.
CREATE OR REPLACE PROCEDURE register_donor(
    p_full_name text, p_phone text, p_password text, p_blood_group text,
    p_lat double precision, p_lng double precision, p_campus_id int, p_listed boolean,
    INOUT p_user_id int DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_type text;
BEGIN
    SELECT user_id, account_type INTO p_user_id, v_type FROM app_user WHERE phone = p_phone FOR UPDATE;
    IF FOUND AND v_type <> 'guest' THEN
        RAISE EXCEPTION 'phone_taken: % already has an account', p_phone USING ERRCODE = 'BR014';
    END IF;
    IF FOUND THEN
        UPDATE app_user
           SET full_name = p_full_name, campus_id = p_campus_id, account_type = 'member',
               password_hash = crypt(p_password, gen_salt('bf'))
         WHERE user_id = p_user_id;
    ELSE
        INSERT INTO app_user (full_name, phone, campus_id, password_hash, account_type)
        VALUES (p_full_name, p_phone, p_campus_id, crypt(p_password, gen_salt('bf')), 'member')
        RETURNING user_id INTO p_user_id;
    END IF;
    INSERT INTO donor (user_id, blood_group, home_location, listed_for_reveal)
    VALUES (p_user_id, p_blood_group,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_listed);
END $$;

-- ---------------------------------------------------------------
-- escalate_overdue_approvals (24 Nov): requests the hospital has not approved or rejected in time
-- (minutes allowed depend on urgency). Each is marked once with escalated_at, so the BloodRide team
-- is alerted and the request goes to the top of their list. Returns the requests escalated now.
-- Nothing is ever approved automatically.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION escalate_overdue_approvals(
    p_emergency_min int, p_urgent_min int, p_scheduled_min int)
RETURNS TABLE (request_id int)
LANGUAGE sql AS $$
    UPDATE blood_request r
       SET escalated_at = now()
      FROM requisition_slip s
     WHERE s.slip_id = r.slip_id
       AND r.status = 'open'
       AND r.escalated_at IS NULL
       AND s.check_status IN ('needs_review', 'auto_verified')
       AND r.created_at < now() - make_interval(mins => CASE r.urgency
                                                        WHEN 'emergency' THEN p_emergency_min
                                                        WHEN 'urgent'    THEN p_urgent_min
                                                        ELSE p_scheduled_min END)
    RETURNING r.request_id
$$;

-- ---------------------------------------------------------------
-- Admin (24 Nov): staff accounts and blocking.
-- ---------------------------------------------------------------

-- create_staff: a blood-bank login for one hospital. A phone that already has an account is refused.
CREATE OR REPLACE PROCEDURE create_staff(
    p_full_name text, p_phone text, p_password text, p_hospital_id int, INOUT p_user_id int DEFAULT NULL)
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM app_user WHERE phone = p_phone) THEN
        RAISE EXCEPTION 'phone_taken: % already has an account', p_phone USING ERRCODE = 'BR014';
    END IF;
    INSERT INTO app_user (full_name, phone, password_hash, account_type)
    VALUES (p_full_name, p_phone, crypt(p_password, gen_salt('bf')), 'staff')
    RETURNING user_id INTO p_user_id;
    INSERT INTO hospital_staff (user_id, hospital_id) VALUES (p_user_id, p_hospital_id);
END $$;

-- remove_staff: the person can no longer sign in. The account stays, because their past approvals
-- (requisition_slip.reviewed_by) must keep pointing at who approved.
CREATE OR REPLACE PROCEDURE remove_staff(p_user_id int)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM hospital_staff WHERE user_id = p_user_id;
    DELETE FROM user_session WHERE user_id = p_user_id;
    UPDATE app_user SET account_type = 'guest', password_hash = NULL
     WHERE user_id = p_user_id AND account_type = 'staff';
END $$;
