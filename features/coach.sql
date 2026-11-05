-- "Ask about your report" (v0.9): each question and its validated answer, per assessment.
-- The coach only explains the report; nothing here feeds scores or analytics.
CREATE TABLE IF NOT EXISTS coach_messages (
  id uuid PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  question text NOT NULL,
  answer jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_messages_assessment ON coach_messages (assessment_id, created_at);

-- "New chat" (v1.10.11): earlier turns are hidden and no longer sent to the model, but kept and still counted toward
-- the per-report question limit, so starting over never lifts the spend guard.
ALTER TABLE coach_messages ADD COLUMN IF NOT EXISTS cleared boolean NOT NULL DEFAULT false;
