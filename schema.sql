-- Everytown OCI relational store (Aurora PostgreSQL). Idempotent: `python3 -m db migrate` runs it statement by statement.
-- `assessments.doc` is the full rendered document; the normalized tables hold the deterministic scores for analytics.
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  name_key text NOT NULL UNIQUE,
  website text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('web', 'demo', 'seed')),
  language text NOT NULL,
  status text NOT NULL,
  doc jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS assessments_org_created ON assessments (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS answers (
  assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  question_id text NOT NULL,
  domain_id text NOT NULL,
  answer text NOT NULL CHECK (answer IN ('yes', 'no')),
  PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS domain_results (
  assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  domain_id text NOT NULL,
  total_questions int NOT NULL,
  favorable_count int NOT NULL,
  gap_count int NOT NULL,
  score_pct numeric(5, 1) NOT NULL,
  estimated_stage text NOT NULL,
  high_count int NOT NULL,
  PRIMARY KEY (assessment_id, domain_id)
);

CREATE TABLE IF NOT EXISTS gaps (
  assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  question_id text NOT NULL,
  domain_id text NOT NULL,
  stage int NOT NULL,
  score numeric(6, 2) NOT NULL,
  priority text NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
  rank int NOT NULL,
  PRIMARY KEY (assessment_id, question_id)
);

CREATE INDEX IF NOT EXISTS gaps_question ON gaps (question_id, priority);

-- Each organization's most recent assessment: the unit for network analytics.
CREATE OR REPLACE VIEW latest_assessments AS
SELECT DISTINCT ON (org_id) id, org_id, created_at, source
FROM assessments
ORDER BY org_id, created_at DESC;

-- Peer benchmarking (staff only, future capability): rank of each organization within a domain.
CREATE OR REPLACE VIEW domain_benchmarks AS
SELECT la.org_id, dr.assessment_id, dr.domain_id, dr.score_pct, dr.estimated_stage,
       round((percent_rank() OVER (PARTITION BY dr.domain_id ORDER BY dr.score_pct) * 100)::numeric, 0) AS percentile
FROM domain_results dr
JOIN latest_assessments la ON la.id = dr.assessment_id;
