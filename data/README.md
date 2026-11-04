# data/

The fixed OCI content: the 143 statements and how they are weighted, area descriptions, and the three synthetic sample organizations. Read at startup by `app.py` (and `utils/data_loader.py`).

## Files

| File | What it does |
|---|---|
| `questions.json` | `domains` (8 areas, each `id`, `name`, `weight`, `questions`; each statement has `id`, `text`, `stage`, `trigger_on`, `next_steps`), `stage_names`, `stage_weights`. Input to the scoring engine. |
| `domain_info.json` | `stage_descriptions` (one per stage, Seeding to Transformational) and `domains` keyed by area id, each with `about` and `connects` text. Also read by `scripts/gen_content.py`. |
| `samples.json` | Sample organizations `A`, `B`, `C`: `file` (answer key in `../benchmark/`), `name`, `summary`, `profile`, `org_meta`, `respondent`. |

## Changing it safely

- Never edit statement texts, stage names or weights: they come from Everytown's questionnaires and the benchmark depends on them. Run `python3 verify_benchmark.py` after any change here.
- `frontend/public/content/questions_es.json` is a reviewed Spanish copy of the statements; keep ids in step.
