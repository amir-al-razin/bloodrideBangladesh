-- Builds the whole BloodRide database. Run against an EMPTY database:
--   psql -d bloodride -v ON_ERROR_STOP=1 -f db/build.sql
\set ON_ERROR_STOP on
\ir schema.sql
\ir triggers.sql
\ir routines.sql
\ir views.sql
\ir seed.sql
SELECT 'built: ' || (SELECT count(*) FROM donor) || ' donors, '
                 || (SELECT count(*) FROM hospital) || ' hospitals, '
                 || (SELECT count(*) FROM donor WHERE next_eligible_date > current_date) || ' inside the 90-day wait'
       AS result;
