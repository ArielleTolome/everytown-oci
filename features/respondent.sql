-- Who filled out the assessment, and the organization's budget band (v1.0). Values come from fixed lists in
-- features/orgmeta.py. The respondent's name and title stay in the document only (never in analytics columns).
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS respondent_role text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS budget text;
-- "Send this area to a teammate": the teammate's role, for "Answered by" on the report.
ALTER TABLE draft_shares ADD COLUMN IF NOT EXISTS role text;
