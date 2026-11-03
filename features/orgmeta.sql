-- Optional organization details from the start page (v0.9), for grouping grantees on the staff dashboard.
-- Values come from fixed lists in features/orgmeta.py. The latest assessment that gives them wins.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS program_models jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS staff_size text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state text;
