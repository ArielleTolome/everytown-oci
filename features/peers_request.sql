-- "Connect me with similar groups" (v1.0): an organization asks CSF staff for an introduction to peers.
-- One row per assessment; CSF staff make the match and share names only with consent.
CREATE TABLE IF NOT EXISTS peer_requests (
  assessment_id uuid PRIMARY KEY REFERENCES assessments (id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);
