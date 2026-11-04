-- "Sign me up" (v1.7): an organization opts in to CSF trainings and/or occasional updates. Optional; one row per
-- assessment; withdrawing deletes the row. Shown only to CSF staff.
CREATE TABLE IF NOT EXISTS optins (
  assessment_id uuid PRIMARY KEY REFERENCES assessments (id) ON DELETE CASCADE,
  training boolean NOT NULL,
  updates boolean NOT NULL,
  name text,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
