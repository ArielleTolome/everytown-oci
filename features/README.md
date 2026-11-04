# features/

Optional feature modules for the Flask API. Each `<name>.py` defines a Flask Blueprint named `bp`, which `app.py` registers at startup through `features.blueprints()`. A matching `<name>.sql` holds idempotent schema, applied by `python3 -m db migrate` after `schema.sql`.

## Files

| File | What it does |
|---|---|
| `__init__.py` | `blueprints()`: imports every module in this folder (sorted by name) and yields its `bp`. |
| `bi.py` | Staff BI from stored engine results: training needs, gaps by domain, common gaps, change over time. `GET /api/staff/bi`, `POST /api/staff/ask` ("Ask the data": one Claude call picks a pre-built analysis from fixed lists, code runs it, a second call words the answer), `GET /api/staff/network-report.pdf`. |
| `coach.py` | "Ask about your report": one fixed Claude call per question, answer ids checked against the report's priorities and the resource catalog. `GET, POST /api/assessments/<sid>/ask`. |
| `coach.sql` | Table `coach_messages` (questions and answers per assessment). |
| `drafts.py` | Save and resume, and "send this area to a teammate" via random capability tokens. Answers only merge. `POST /api/drafts`, `GET /api/drafts/<token>`, `POST /api/drafts/<token>`, `POST /api/drafts/<token>/share`. |
| `drafts.sql` | Tables `drafts` and `draft_shares`. |
| `milestones.py` | 12-week roadmap built in code from the report (no model call), with progress, points and badges. `GET /api/assessments/<sid>/roadmap`, `POST /api/assessments/<sid>/roadmap/tasks/<task_id>`, `GET /api/assessments/<sid>/roadmap/week/<n>.pdf`, `GET /api/staff/roadmaps`. |
| `milestones.sql` | Table `roadmap_tasks` (progress only; the roadmap itself is rebuilt each time). |
| `orgmeta.py` | Fixed lists for organization details (program model, staff size, budget, state), respondent role and public links, plus the `clean_*` validators `app.py` uses. `GET /api/org-meta`. |
| `orgmeta.sql` | Adds `program_models`, `staff_size`, `state` columns to `organizations`. |
| `peers.py` | Staff-only peer matching: similarity = 0.4 program model overlap + 0.3 size match + 0.3 shared priorities; percentile within the primary program model. `GET /api/staff/peers/<org_id>`. |
| `peers_request.py` | "Connect me with similar groups": stores the request for staff. `POST /api/assessments/<sid>/peer-request`. |
| `peers_request.sql` | Table `peer_requests` (one row per assessment). |
| `respondent.sql` | Adds `assessments.respondent_role`, `organizations.budget`, `draft_shares.role`. |
| `staff_ai.py` | Training brief for one network-wide growth priority: code counts, one Converse call writes the session, resources kept only from the catalog. `POST /api/staff/briefs`. |
| `tts.py` | Read-aloud with Amazon Polly: one report section as MP3, text built in code from the validated report. `GET /api/assessments/<sid>/audio/<section>`. |

## How it connects

- Modules import `app` helpers lazily inside functions (`app.py` also imports from `orgmeta` and `drafts`).
- Data goes through `db.py` (Aurora Data API). Model calls go through `pipeline.py`.
- Staff routes (`/api/staff/...`) are for CSF staff only; organizations never see other organizations' data.

## Changing it safely

- New feature: add `<name>.py` with a `bp` and, if needed, `<name>.sql` using `IF NOT EXISTS`. No registration code needed.
- `scripts/build.sh` copies this folder into the Lambda zip.
- Tests in `../tests/` cover coach validation and drafts merge rules.
