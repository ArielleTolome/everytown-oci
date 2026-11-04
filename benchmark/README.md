# benchmark/

Synthetic answer keys for three sample organizations (A, B, C) and the results the scoring engine must produce for them. They prove `engine/` still scores exactly as Everytown's reference, and they feed the demo's sample organizations.

## Files

| File | What it does |
|---|---|
| `sample_*_answers.json` | Input: `sample`, `organization`, `note`, and `answers` (`{question_id: "yes"/"no"}` for all 143 statements). |
| `sample_*_expected.json` | Expected output: `sample`, `organization`, `scope`, `totals` (statements, gaps, high/medium/low), `domains` (`capacity_pct`, `estimated_stage`, `gap_count` per area) and `gaps` (`priority_score`, `priority` per statement). |

## How it connects

- `verify_benchmark.py` (repo root) scores each `answers` file with `calculate_recommendations` and compares every domain's percent, stage and gap count, and every gap's score (to 1e-9) and band. It prints PASS or FAIL per sample and exits 1 on any failure.
- It first looks for `../../03_Sample_Responses/benchmark`, then this folder.
- `data/samples.json` points at the answer files for the demo samples.
