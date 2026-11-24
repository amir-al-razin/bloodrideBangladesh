-- BloodRide sample data (Sprint 1). Owner: Saa'd.
-- 3 hospitals (each with a staff login), 3 campuses, 1 admin, 300 student donors around Dhaka, past donations,
-- 3 volunteer riders and the first fare_rate row. setseed() makes it the same on every machine.
-- Coordinates are approximate.

SELECT setseed(0.42);

INSERT INTO hospital (name, address, location) VALUES
  ('Dhaka Medical College Hospital', 'Bakshibazar, Dhaka',  ST_MakePoint(90.3976, 23.7256)::geography),
  ('Bangladesh Medical University Hospital', 'Shahbagh, Dhaka',   -- formerly BSMMU (renamed 2025)
   ST_MakePoint(90.3949, 23.7389)::geography),
  ('Square Hospital', 'Panthapath, Dhaka', ST_MakePoint(90.3816, 23.7527)::geography);

INSERT INTO campus (name, location) VALUES
  ('Islamic University of Technology', ST_MakePoint(90.3792, 23.9480)::geography),
  ('University of Dhaka',              ST_MakePoint(90.3929, 23.7337)::geography),
  ('BUET',                             ST_MakePoint(90.3925, 23.7265)::geography);

-- admin. Demo accounts all use the password  bloodride123  (change before any real use)
INSERT INTO app_user (full_name, phone, password_hash, account_type)
VALUES ('BloodRide Admin', '01700000000', crypt('bloodride123', gen_salt('bf')), 'admin');

-- one blood-bank staff login per hospital: they approve requests before donors are alerted
WITH u AS (
    INSERT INTO app_user (full_name, phone, password_hash, account_type) VALUES
      ('DMCH Blood Bank',   '01500000001', crypt('bloodride123', gen_salt('bf')), 'staff'),
      ('BMU Blood Bank',    '01500000002', crypt('bloodride123', gen_salt('bf')), 'staff'),
      ('Square Blood Bank', '01500000003', crypt('bloodride123', gen_salt('bf')), 'staff')
    RETURNING user_id, phone
)
INSERT INTO hospital_staff (user_id, hospital_id)
SELECT user_id, right(phone, 1)::int FROM u;

-- 300 donors. Blood groups follow a rough Bangladesh mix (B+ and O+ most common, negatives rare).
-- Each donor lives within about 2-14 km of their campus.
WITH g AS (
    SELECT i,
           1 + (i % 3) AS campus_id,
           random() AS r_group, random() AS r_ang, random() AS r_dist
      FROM generate_series(1, 300) AS i
), u AS (
    INSERT INTO app_user (campus_id, full_name, phone, password_hash, account_type)
    SELECT campus_id, 'Donor ' || i, '0171' || lpad(i::text, 7, '0'), 'sprint2-login', 'member'
      FROM g ORDER BY i
    RETURNING user_id, campus_id, phone
)
INSERT INTO donor (user_id, blood_group, home_location)
SELECT u.user_id,
       CASE WHEN g.r_group < 0.30 THEN 'B+'  WHEN g.r_group < 0.58 THEN 'O+'
            WHEN g.r_group < 0.82 THEN 'A+'  WHEN g.r_group < 0.92 THEN 'AB+'
            WHEN g.r_group < 0.945 THEN 'B-' WHEN g.r_group < 0.97 THEN 'O-'
            WHEN g.r_group < 0.988 THEN 'A-' ELSE 'AB-' END,
       ST_Project(c.location::geography, 2000 + g.r_dist * 12000, radians(g.r_ang * 360))::geography
  FROM u
  JOIN g ON u.phone = '0171' || lpad(g.i::text, 7, '0')
  JOIN campus c ON c.campus_id = u.campus_id;

-- two named demo donors with AB- near Dhaka Medical College (for the two-phone demo)
WITH u AS (
    INSERT INTO app_user (campus_id, full_name, phone, password_hash, account_type) VALUES
      (3, 'Demo Donor One', '01800000001', crypt('bloodride123', gen_salt('bf')), 'member'),
      (2, 'Demo Donor Two', '01800000002', crypt('bloodride123', gen_salt('bf')), 'member')
    RETURNING user_id, phone
)
INSERT INTO donor (user_id, blood_group, home_location)
SELECT user_id, 'AB-',
       CASE WHEN phone = '01800000001' THEN ST_MakePoint(90.3890, 23.7320)::geography
            ELSE ST_MakePoint(90.4060, 23.7400)::geography END
  FROM u;

-- about half the donors opt in to "show my number to verified patients" (off by default; on for the demo donors)
UPDATE donor SET listed_for_reveal = (random() < 0.5);
UPDATE donor SET listed_for_reveal = true
 WHERE user_id IN (SELECT user_id FROM app_user WHERE phone IN ('01800000001', '01800000002'));

-- past donations for about 60% of donors, 10 to 400 days ago.
-- The trigger trg_set_next_eligible fills donor.next_eligible_date from these rows,
-- so roughly 1 in 5 of them is still inside the 90-day wait.
INSERT INTO donation (donor_id, donated_on, source)
SELECT d.user_id, current_date - (10 + floor(random() * 390))::int, 'self_reported'
  FROM donor d
  JOIN app_user u USING (user_id)
 WHERE u.phone LIKE '0171%' AND random() < 0.6;

-- three student volunteer riders
WITH u AS (
    INSERT INTO app_user (campus_id, full_name, phone, password_hash, account_type) VALUES
      (1, 'Rider IUT',  '01900000001', 'sprint2-login', 'member'),
      (2, 'Rider DU',   '01900000002', 'sprint2-login', 'member'),
      (3, 'Rider BUET', '01900000003', 'sprint2-login', 'member')
    RETURNING user_id, phone
)
INSERT INTO rider (user_id, rider_type, licence_no, plate_no, on_duty)
SELECT user_id, 'volunteer', 'DL-' || right(phone, 4), 'DHAKA-METRO-HA-' || right(phone, 4), true FROM u;

-- first fare rate: Pathao's last published bike rates (2022)
INSERT INTO fare_rate (base_bdt, per_km_bdt, per_min_bdt, min_fare_bdt, effective_from)
VALUES (25, 15, 0.50, 50, '2026-11-01');
