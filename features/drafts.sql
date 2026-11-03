-- Save and resume (v0.9): an in-progress assessment, reachable only through its unguessable token.
-- `data` holds org name, url, language, areas, optional org details and the yes/no answers given so far.
CREATE TABLE IF NOT EXISTS drafts (
  id uuid PRIMARY KEY,
  token text NOT NULL UNIQUE,
  owner text,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- "Send this area to a teammate": a second token that can read and answer only one area of one draft.
CREATE TABLE IF NOT EXISTS draft_shares (
  token text PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES drafts (id) ON DELETE CASCADE,
  domain_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_id, domain_id)
);
