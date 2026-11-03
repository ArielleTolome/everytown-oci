# Changelog

Each section below is published verbatim as the GitHub release of the same tag.

## v0.4.0 — Re-assessment progress, sample organizations, pitch deck

- **Progress since your last assessment.** Submitting again under the same organization name compares the new answers with the previous assessment over the areas both covered: growth priorities closed, new ones, and stage moves per area. The comparison is deterministic (`app.compare`), shown on the results page and in the PDF, and passed to Claude so the summary celebrates progress first.
- **Try a synthetic sample organization.** One-click submission of the three fictional organizations from the builder package (grassroots, mid-size, mature), with their profiles, in the chosen language and areas. For demos and CSF staff training.
- Stage-move arrows use an SVG icon, since Atkinson Hyperlegible has no arrow glyph.
- Store refactor: one `_get`/`_put` path for S3 and local JSON; organization pointers live under `submissions/by-org/`.
- Pitch deck (`docs/pitch/index.html`) and a 3-minute demo script mapped to the judging criteria.
- Unit test for the progress comparison.

## v0.3.0 — OCI Capacity Coach: grounded 30/60/90 plans, accessible UI, AWS deployment

- **Hosted on AWS** with plain CloudFormation (`infra/template.yaml`): CloudFront → Lambda Function URL → one Python 3.12 Lambda (Flask via apig-wsgi). The AI pipeline runs as an async self-invoke; submissions are stored in S3. No VPC, NAT, load balancer or database; about $0 to $1 a month at demo traffic. `scripts/deploy.sh` builds, deploys and ingests the library in one command.
- **Bedrock Knowledge Base on S3 Vectors** (Titan Text Embeddings v2) over a new CVI field-guide library (`resources/library/`, 9 guides distilled from the BJA checklist, HVIP brief, Dr. Roman and Dr. Tillmon decks). Retrieval runs once per assessed area with its top growth priorities. Without a KB, the library is injected into the prompt.
- **Structured, validated recommendations.** Claude writes the report through Converse tool use with a JSON schema: summary, strengths, a 30 / 60 / 90 day action plan with role owners and steps, and a team conversation guide. `validate_report` keeps only actions that cite real growth priorities from the submission, and only links from the vetted 19-entry `resources/catalog.json`. Website profiles use Claude Haiku; reports use Claude Sonnet.
- **Strength-based framing** from the OCI handoff deck: results lead with a stage ladder (Seeding to Transformational), gaps are "growth priorities", no em dashes in copy.
- **Accessible UI rebuilt** to the project design system: one area per screen, Atkinson Hyperlegible, Display menu (larger text, high contrast), focusable error summaries, live processing status, read-aloud buttons, `lang`-tagged AI text, print stylesheet. axe-core reports no WCAG 2.2 A/AA violations on any page.
- **Choose what to assess**: the four priority areas are pre-selected and any of the eight can be added. Website is optional. Reports in English or Spanish.
- **PDF report** mirrors the sample reports (cover, executive summary, overview, domain results, priority action plan, recommendations by domain, full response record) and adds the AI plan, conversation guide and sources. Unicode fonts, bookmarks, document language.
- Website fetch now re-checks every redirect hop against the public-IP guard. "Try again" reruns only the AI steps after a failure.
- `resources/cvi_resources.md` is replaced by `resources/catalog.json`.

## v0.2.0 — End-to-end MVP web app

- Flask web app (`app.py`) with a mocked login (`demo` / `demo`), organization form, and a questionnaire for the four priority domains: Planning, Fundraising, Financial Management, and ML&E (72 statements). The domain list can be changed with `OCI_DOMAINS`.
- Every statement must be answered before scoring, because an unanswered statement would otherwise count as favourable.
- Deterministic scoring through the unchanged `engine/scoring.py`. Scores are shown immediately.
- Two-step Amazon Bedrock (Claude) pipeline (`pipeline.py`). Step 1 reads the organization's website and writes a profile. Step 2 writes recommendations from the fixed scores, the ranked gaps with their next steps, and the CVI resource library (`resources/cvi_resources.md`). The model never computes scores.
- Processing indicators on the results page, updated live as the pipeline runs.
- Downloadable PDF report with a scores table and the recommendations (`report.py`).
- Website fetch accepts only public http(s) addresses, which blocks private and metadata IPs.
- Submissions are stored as local JSON in `instance/submissions/`, which is git-ignored.

## v0.1.0 — Repository bootstrap

- Deterministic OCI scoring engine (`engine/scoring.py`), copied unchanged from the reference implementation.
- Question bank `data/questions.json`: 143 statements across 8 domains, with stage and domain weights.
- Three synthetic benchmark response sets (`benchmark/`) and `verify_benchmark.py`; all three PASS.
- Project vision and technical briefs in `docs/`.
