-- BloodRide schema: 19 tables. The 16 of Team15_ERD.pdf (21 Nov 2026), plus contact_reveal (23 Nov),
-- and hospital_staff + user_session (24 Nov, Stage 1: staff approve requests before donors are alerted).
-- Owner: Saa'd. Run through db/build.sql.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt() for password hashes

-- ---------- people
CREATE TABLE campus (
    campus_id   serial PRIMARY KEY,
    name        text NOT NULL UNIQUE,
    location    geography(Point, 4326)
);

CREATE TABLE app_user (
    user_id       serial PRIMARY KEY,
    campus_id     int REFERENCES campus,                       -- null if not a student
    full_name     text NOT NULL,
    phone         text NOT NULL UNIQUE CHECK (phone ~ '^01[3-9][0-9]{8}$'),
    password_hash text,                                        -- null for guests
    account_type  text NOT NULL DEFAULT 'member'
                  CHECK (account_type IN ('guest', 'member', 'staff', 'admin')),
    is_blocked    boolean NOT NULL DEFAULT false,              -- admin blocked this number (fake requests)
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT guest_has_no_password CHECK ((account_type = 'guest') = (password_hash IS NULL))
);

CREATE TABLE donor (
    user_id            int PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
    blood_group        text NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    home_location      geography(Point, 4326) NOT NULL,
    is_available       boolean NOT NULL DEFAULT true,
    next_eligible_date date,                                   -- derived: set only by trg_set_next_eligible
    listed_for_reveal  boolean NOT NULL DEFAULT false          -- opt-in: verified patients may see this number
);

CREATE TABLE rider (
    user_id     int PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
    rider_type  text NOT NULL DEFAULT 'volunteer' CHECK (rider_type IN ('volunteer', 'assigned')),
    licence_no  text NOT NULL UNIQUE,
    plate_no    text NOT NULL UNIQUE,
    on_duty     boolean NOT NULL DEFAULT false
);

CREATE TABLE notification_channel (
    channel_id   serial PRIMARY KEY,
    user_id      int NOT NULL REFERENCES app_user ON DELETE CASCADE,
    channel_type text NOT NULL CHECK (channel_type IN ('web_push', 'telegram')),
    address      text NOT NULL,                                -- push subscription JSON or Telegram chat id
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, channel_type, address)
);

-- a signed-in browser: the cookie holds the token
CREATE TABLE user_session (
    token      text PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
    user_id    int NOT NULL REFERENCES app_user ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

-- ---------- requests
CREATE TABLE hospital (
    hospital_id serial PRIMARY KEY,
    name        text NOT NULL,
    address     text,
    location    geography(Point, 4326) NOT NULL
);

-- blood-bank or ward staff who approve requests for their hospital
CREATE TABLE hospital_staff (
    user_id     int PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
    hospital_id int NOT NULL REFERENCES hospital,
    desk        text NOT NULL DEFAULT 'blood bank'
);

CREATE TABLE requisition_slip (
    slip_id       serial PRIMARY KEY,
    image_path    text NOT NULL,
    image_hash    text NOT NULL UNIQUE,                        -- the same slip cannot be used twice
    doctor_name   text,                                        -- read by OCR
    doctor_reg_no text,                                        -- read by OCR
    issued_on     date,                                        -- read by OCR
    check_status  text NOT NULL DEFAULT 'needs_review'
                  CHECK (check_status IN ('auto_verified', 'needs_review', 'verified', 'rejected')),
    reviewed_by   int REFERENCES app_user,                     -- admin; null if auto
    reviewed_at   timestamptz,
    CONSTRAINT review_pair CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);

CREATE TABLE blood_request (
    request_id     serial PRIMARY KEY,
    slip_id        int NOT NULL UNIQUE REFERENCES requisition_slip,   -- one slip, one request
    hospital_id    int NOT NULL REFERENCES hospital,
    requester_id   int NOT NULL REFERENCES app_user,                  -- member or guest
    blood_group    text NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    bags_needed    int NOT NULL CHECK (bags_needed BETWEEN 1 AND 10),
    urgency        text NOT NULL CHECK (urgency IN ('emergency', 'urgent', 'scheduled')),
    needed_by      timestamptz NOT NULL,
    tracking_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
    status         text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'searching', 'filled', 'closed', 'cancelled')),
    contacts_unlocked_at timestamptz,                          -- "show donor numbers" pressed (free)
    search_round   int NOT NULL DEFAULT 0,                     -- alert rounds sent so far (each one wider)
    last_wave_at   timestamptz,                                -- when the last round went out
    escalated_at   timestamptz,                                -- staff didn't decide in time: BloodRide team alerted
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE donor_alert (
    request_id   int NOT NULL REFERENCES blood_request ON DELETE CASCADE,
    donor_id     int NOT NULL REFERENCES donor,
    round_no     int NOT NULL CHECK (round_no >= 1),
    distance_km  numeric(6, 2) NOT NULL,
    sent_at      timestamptz NOT NULL DEFAULT now(),
    seen_at      timestamptz,
    response     text NOT NULL DEFAULT 'pending'
                 CHECK (response IN ('pending', 'accepted', 'declined', 'backup')),
    responded_at timestamptz,
    PRIMARY KEY (request_id, donor_id)
);

-- every donor number shown to a patient through "reveal all numbers": the log behind the donor's notice
CREATE TABLE contact_reveal (
    request_id  int NOT NULL REFERENCES blood_request ON DELETE CASCADE,
    donor_id    int NOT NULL REFERENCES donor ON DELETE CASCADE,
    revealed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, donor_id)
);

-- ---------- missions and rides
CREATE TABLE fare_rate (
    rate_id        serial PRIMARY KEY,
    base_bdt       numeric(8, 2) NOT NULL CHECK (base_bdt >= 0),
    per_km_bdt     numeric(8, 2) NOT NULL CHECK (per_km_bdt >= 0),
    per_min_bdt    numeric(8, 2) NOT NULL CHECK (per_min_bdt >= 0),
    min_fare_bdt   int NOT NULL CHECK (min_fare_bdt >= 0),
    effective_from timestamptz NOT NULL UNIQUE
);

CREATE TABLE mission (
    mission_id   serial PRIMARY KEY,
    request_id   int NOT NULL,
    donor_id     int NOT NULL,
    rider_id     int REFERENCES rider,                         -- escort both ways; null if the donor goes alone
    status       text NOT NULL DEFAULT 'reserved'
                 CHECK (status IN ('reserved', 'en_route', 'at_hospital', 'donated', 'resting',
                                   'returning', 'completed', 'failed_screening', 'cancelled')),
    travel_mode  text NOT NULL DEFAULT 'self' CHECK (travel_mode IN ('self', 'escorted')),
    phone_shared boolean NOT NULL DEFAULT false,               -- the donor's choice on accepting
    pickup_code  char(4),                                      -- escorted only
    dropoff_code char(4),                                      -- escorted only
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (request_id, donor_id),
    FOREIGN KEY (request_id, donor_id) REFERENCES donor_alert,
    CONSTRAINT codes_only_when_escorted CHECK (travel_mode = 'escorted' OR (pickup_code IS NULL AND dropoff_code IS NULL))
);

CREATE TABLE trip (                                            -- weak entity: leg 1 to the hospital, leg 2 home
    mission_id      int NOT NULL REFERENCES mission ON DELETE CASCADE,
    leg_no          smallint NOT NULL CHECK (leg_no IN (1, 2)),
    rate_id         int NOT NULL REFERENCES fare_rate,
    direction       text NOT NULL CHECK (direction IN ('to_hospital', 'return')),
    est_km          numeric(6, 2) NOT NULL CHECK (est_km > 0),
    est_min         int NOT NULL CHECK (est_min > 0),
    quoted_fare_bdt int NOT NULL CHECK (quoted_fare_bdt > 0),
    actual_km       numeric(6, 2),
    final_fare_bdt  int,
    started_at      timestamptz,
    ended_at        timestamptz,
    PRIMARY KEY (mission_id, leg_no),
    CONSTRAINT leg_direction CHECK ((leg_no = 1) = (direction = 'to_hospital'))
);

CREATE TABLE mission_event (                                   -- weak entity, audit trail
    mission_id  int NOT NULL REFERENCES mission ON DELETE CASCADE,
    seq         int NOT NULL,
    from_status text,
    to_status   text NOT NULL,
    changed_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (mission_id, seq)
);

CREATE TABLE donation (
    donation_id serial PRIMARY KEY,
    donor_id    int NOT NULL REFERENCES donor,
    mission_id  int UNIQUE REFERENCES mission,                 -- null = self-reported
    donated_on  date NOT NULL CHECK (donated_on <= current_date),
    source      text NOT NULL CHECK (source IN ('bloodride', 'self_reported')),
    CONSTRAINT source_matches_mission CHECK ((source = 'bloodride') = (mission_id IS NOT NULL))
);

CREATE TABLE payment (
    payment_id   serial PRIMARY KEY,
    request_id   int NOT NULL REFERENCES blood_request,
    payer        text NOT NULL DEFAULT 'patient' CHECK (payer IN ('patient')),
    amount_bdt   int NOT NULL CHECK (amount_bdt > 0),
    method       text NOT NULL DEFAULT 'bkash' CHECK (method IN ('bkash')),
    bkash_txn_id text UNIQUE,
    status       text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'confirmed', 'refunded')),
    paid_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payout_entry (                                    -- append-only (trg_payout_immutable, Sprint 4)
    entry_id   serial PRIMARY KEY,
    mission_id int NOT NULL,
    leg_no     smallint NOT NULL,
    kind       text NOT NULL CHECK (kind IN ('fare', 'adjustment')),
    amount_bdt int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (mission_id, leg_no) REFERENCES trip
);

-- ---------- indexes
CREATE INDEX donor_home_gix          ON donor USING gist (home_location);
CREATE INDEX hospital_loc_gix        ON hospital USING gist (location);
CREATE INDEX donor_alert_donor_idx   ON donor_alert (donor_id, response);
CREATE INDEX blood_request_state_idx ON blood_request (status, created_at);
CREATE INDEX donation_donor_idx      ON donation (donor_id, donated_on);
CREATE INDEX contact_reveal_donor_idx ON contact_reveal (donor_id, revealed_at);
