# engine/

The reference OCI scoring engine, kept unchanged from Everytown. It turns Yes/No answers into gaps, priority scores and a stage per area. No AI is involved. See [Scoring](../README.md#scoring).

## Files

| File | What it does |
|---|---|
| `__init__.py` | Empty package marker. |
| `scoring.py` | `calculate_recommendations(answers, domains, stage_weights, stage_names)`: input is `{question_id: "yes"/"no"}` plus the data from `utils/data_loader.py`; output is a list of `ScoredRecommendation` (gaps with score and High/Medium/Low band) and a list of `DomainSummary` (gap count, `score_pct`, `estimated_stage`) per area. |
| `recommendations.py` | `format_for_display(all_recs, domain_summaries)`: shapes the results into overall stats plus per-domain dicts. Not called by the app today. |

## Changing it safely

- Do not edit this folder. Its output must match the answer keys in `../benchmark/`.
- Run `python3 verify_benchmark.py` from the repo root: expect three PASS lines.
