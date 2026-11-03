# Changelog

Each section below is published verbatim as the GitHub release of the same tag.

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
