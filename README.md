# Everytown OCI Platform

Organizational Capacity Index (OCI) for community violence intervention (CVI) nonprofits. An organization signs in, answers a Yes/No questionnaire, and gets a downloadable PDF of personalized recommendations.

- Deterministic Python code computes every score.
- Claude on Amazon Bedrock writes the recommendations around those fixed scores.

This is the AWS Breaking Barriers 2026 hackathon build. See [`docs/vision.md`](docs/vision.md) and [`docs/tech.md`](docs/tech.md) for the full brief.

**Current release:** v0.2.0. See [CHANGELOG.md](CHANGELOG.md) and the GitHub Releases page.

## Quick start

Requires Python 3.9+ and AWS credentials for an account with Bedrock Claude access (us-west-2 sandbox).

```
pip install -r requirements.txt
export AWS_DEFAULT_REGION=us-west-2 AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...
python3 app.py
```

Open http://127.0.0.1:8000 and sign in with `demo` / `demo`.

To check that the scoring engine still matches the answer key (standard library only):

```
python3 verify_benchmark.py      # expect three PASS lines
```

## User journey

1. Sign in with the mocked credentials.
2. Enter the organization name and website URL.
3. Answer all statements in the four priority domains. The form rejects partial submissions.
4. The results page shows the scores immediately, then live progress through these steps: reading answers, researching the website, consulting the CVI resource library, and writing recommendations.
5. Download the PDF report.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OCI_DOMAINS` | `PL,FR,FM,ML` | Domain IDs included in the questionnaire. Choose from PL, FR, GV, HR, FM, ML, CE, TI. |
| `OCI_MODEL_ID` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model or inference profile. |
| `OCI_SECRET_KEY` | random per start | Flask session key. Set it to keep users signed in across restarts. |
| `PORT` | `8000` | HTTP port. |

## Layout

| Path | Purpose |
|---|---|
| `app.py` | Flask routes, validation, local JSON store, and the background pipeline runner. |
| `pipeline.py` | Bedrock calls. Step 1 profiles the org from its website. Step 2 writes recommendations. |
| `report.py` | PDF rendering (fpdf2). |
| `templates/` | HTML pages. |
| `resources/cvi_resources.md` | CVI resource library injected into the recommendation prompt. |
| `engine/scoring.py` | The scoring model. `calculate_recommendations()` returns ranked gaps and per-domain summaries. |
| `engine/recommendations.py` | Reshapes engine output for display. Computes nothing. |
| `utils/data_loader.py` | Loads `data/questions.json`. |
| `data/questions.json` | 143 statements across 8 domains, plus stage and domain weights. |
| `benchmark/`, `verify_benchmark.py` | Synthetic answer sets with expected scores, and the checker. |
| `instance/submissions/` | Runtime store, one JSON file per submission. Git-ignored. |

## Scoring

A statement is a gap when `answer == trigger_on`.

```
gap_density_bonus = 1 + gaps_in_domain / statements_in_domain     # 1.0 .. 2.0
priority_score    = stage_weight * domain_weight * gap_density_bonus
```

- Stage weight runs from 5 (Seeding) down to 1 (Transformational). Domain weight runs from 0.7 to 1.0.
- Priority bands (High, Medium, Low) are percentile thirds of all gaps in *this* submission. They are relative, so scoring 4 domains instead of 8 can move a gap into a different band. Capacity percentages and stages are per domain and do not change.
- An unanswered statement would count as favourable, so the app requires every statement to be answered.
- `PL1` is reverse-coded (`trigger_on: "yes"`).

## Security notes

- Login is mocked. Do not expose this build to the public internet.
- The website fetch accepts only http(s) URLs that resolve to public IPs. Redirects are not re-checked yet; see the `shortcut:` comment in `pipeline.py`.
- All responses in this repository are synthetic. Never commit real organization data or credentials. `api.md` and `.env` are git-ignored.

## Release process

Every update ships with:

1. This README, updated to match the new behaviour.
2. A new section in `CHANGELOG.md`.
3. A git tag `vX.Y.Z` and a GitHub release whose notes are that changelog section.
