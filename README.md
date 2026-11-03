# Everytown OCI Platform

Organizational Capacity Index (OCI) for community violence intervention (CVI) nonprofits. An organization answers a Yes/No questionnaire; deterministic Python code scores the answers per capacity domain and ranks every gap. This is the AWS Breaking Barriers 2026 hackathon build. See [`docs/vision.md`](docs/vision.md) and [`docs/tech.md`](docs/tech.md) for the full brief.

**Current release:** v0.1.0. See [CHANGELOG.md](CHANGELOG.md) and the GitHub Releases page.

## Quick start

Python 3.8+, standard library only.

```
python3 verify_benchmark.py
```

Expected: three `PASS` lines (samples A, B, C) and exit status 0.

## Layout

| Path | Purpose |
|---|---|
| `engine/scoring.py` | The scoring model. `calculate_recommendations()` returns ranked gaps and per-domain summaries. |
| `engine/recommendations.py` | Reshapes engine output for display. Computes nothing. |
| `utils/data_loader.py` | Loads `data/questions.json`. |
| `data/questions.json` | 143 statements across 8 domains, plus stage and domain weights. |
| `benchmark/` | Synthetic answer sets with expected scores (the answer key). |
| `verify_benchmark.py` | Scores the benchmarks and checks them against the expected results. |
| `docs/` | Vision and technical briefs. |

## Scoring

A statement is a gap when `answer == trigger_on`.

```
gap_density_bonus = 1 + gaps_in_domain / statements_in_domain     # 1.0 .. 2.0
priority_score    = stage_weight * domain_weight * gap_density_bonus
```

- Stage weight runs from 5 (Seeding) down to 1 (Transformational). Domain weight runs from 0.7 to 1.0.
- Priority bands are percentile thirds of all gaps in *this* submission. They are relative, so the same gap can land in a different band when fewer domains are scored.
- An unanswered statement is not counted as a gap. Validate that every statement has an answer before scoring.
- `PL1` is reverse-coded (`trigger_on: "yes"`).

## Release process

Every update ships with:

1. This README, updated to match the new behaviour.
2. A new section in `CHANGELOG.md`.
3. A git tag `vX.Y.Z` and a GitHub release whose notes are that changelog section.

## Data handling

All responses in this repository are synthetic. Do not commit real organization data or credentials.
