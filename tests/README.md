# tests/

Python unit tests for the API, the AI pipeline's validation and the feature modules. They use fake Bedrock
clients and Flask's test client, so most run with no network and no AWS credentials.

Run from the repo root:

```bash
python3 -m unittest discover -s tests
```

Tests that need Aurora are marked `skipUnless(OCI_DB_CLUSTER_ARN)`: they are skipped without the Data API
environment (`OCI_DB_CLUSTER_ARN`, `OCI_DB_SECRET_ARN`) and run against the shared dev database with it.

## Files

| File | What it does |
|---|---|
| `test_bi.py` | Staff BI (`features/bi.py`, `features/peers.py`): training-needs matrix, change over time, peer similarity and benchmarks, "Ask the data" router rejects unknown analyses and its answer may only use numbers from the table, every staff endpoint refuses organizations and anonymous users. |
| `test_checks.py` | The eval package (`evals/checks.py`, `build_datasets.py`, `run.py`): every code check passes a good output and fails a bad one, the committed datasets match the builder, `run.pick` covers every case type, CloudWatch metric shape, CLI flags. Base report comes from `evals/datasets/coach_bases.json`. |
| `test_coach.py` | "Ask about your report" (`features/coach.py`): only the submitting session or staff may ask, length and rate limits, answers keep only real gap ids and catalog links, crisis questions get the fixed answer with no model call, guardrail blocks and plain-text declines get fixed answers. Also Polly text chunking (`features/tts.py`). |
| `test_drafts.py` | Save and resume, teammate area links, organization details (`features/drafts.py`, `features/orgmeta.py`) and the staff training brief (`features/staff_ai.py`). Draft storage tests need Aurora. |
| `test_guard.py` | `pipeline.py` guardrail use: only untrusted text is sent as `guardContent`, a blocked website profile is dropped and the report is still written, a block without a profile still fails. |
| `test_intake.py` | v1.0 intake: respondent role and social link validation, non-object JSON bodies are a 4xx, the org name never reaches the report prompt, public research never fetches private addresses, teammate answer attribution (needs Aurora). |
| `test_ladders.py` | `frontend/public/content/ladders.json` maps to real statements by the cumulative rule, no statement is in two groups, demo sample answers cover every statement. |
| `test_milestones.py` | 12-week roadmap (`features/milestones.py`): deterministic build, week unlock rules (finish or 7 days, never relock), points, badges, streaks, owner/staff-only API, locked weeks hide tasks. Storage test needs Aurora. |
| `test_observability.py` | `observability.py`: tracing is a silent no-op without `OCI_TRACES=xray`; with it, one `run_job` is one trace with the agreed span tree and attributes, the staff-only trace link, online-check metrics. |
| `test_progress.py` | `app.compare`: re-assessment progress counts closed and new gaps and stage moves only over areas both assessments covered. |
| `test_report_layers.py` | `report.py` PDF: the letter comes before the detailed results, Spanish frame, a roadmap failure only skips the weeks, the research line counts used sources. Peer requests (`features/peers_request.py`) are owner-only. |
| `test_validate_report.py` | `pipeline.py` report validation: only grounded actions and catalog links survive, Start here follows `choose_focus`, reading-level rewrite keeps ids, truncated, refused or guardrail-blocked model answers raise readable errors. |

## Changing it safely

- New code check in `evals/checks.py` needs a pass and a fail test in `test_checks.py` (see [evals/README.md](../evals/README.md#adding-a-case)).
- `test_checks.py` fails while a committed eval dataset is stale: run `python3 -m evals.build_datasets`.
- Playwright and browser tests are not here: see [qa/](../qa/README.md).
