-- "Does this feel right?" (v1.7): the organization (or staff) says whether each report section helped.
-- One row per assessment and section; a repeat replaces it. Nothing here changes scores or the report.
CREATE TABLE IF NOT EXISTS report_feedback (
  assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  section text NOT NULL,
  helpful boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, section)
);

-- Staff review queue (v1.7): one review per assessment, "reviewed" or "flagged" with an issue from a fixed list.
CREATE TABLE IF NOT EXISTS report_reviews (
  assessment_id uuid PRIMARY KEY REFERENCES assessments (id) ON DELETE CASCADE,
  status text NOT NULL,
  issue text,
  note text,
  reviewer text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
