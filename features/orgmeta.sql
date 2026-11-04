-- Optional organization details from the start page (v0.9), for grouping grantees on the staff dashboard.
-- Values come from fixed lists in features/orgmeta.py. The latest assessment that gives them wins.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS program_models jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS staff_size text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state text;
-- v1.9 (issue #23): an organization can work in several states or territories. `states` (a list of codes) replaces
-- `state`, which stays in place but is no longer read or written. Backfill is idempotent: only rows not yet copied.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS states jsonb;
UPDATE organizations SET states = jsonb_build_array(state) WHERE states IS NULL AND state IS NOT NULL
