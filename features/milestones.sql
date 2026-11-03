-- 12-week roadmap (v1.0): one row per task of an assessment's roadmap. The tasks themselves are rebuilt by code
-- from the checked report (features/milestones.py); only progress is stored. Points and badges are computed from it.
CREATE TABLE IF NOT EXISTS roadmap_tasks (
  assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  task_id text NOT NULL,
  week int NOT NULL,
  done_at timestamptz,
  PRIMARY KEY (assessment_id, task_id)
);
