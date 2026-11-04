# scripts/

Build, deploy and one-off content scripts. Run them from anywhere; each shell script `cd`s to the repo root. The shell scripts expect AWS credentials in the environment and default to `AWS_REGION` `us-west-2`. Templates are in [`../infra/`](../infra/README.md).

## Files

| File | What it does |
|---|---|
| `build.sh` | Builds the Lambda package `build/oci.zip` (python3.12, x86_64): downloads Linux wheels from `requirements.txt`, copies the Python app, `features/`, `engine/`, `utils/`, `data/`, `benchmark/`, `resources/`, `evals/checks.py` and the PDF fonts, and zips with fixed mtimes so identical builds give the same hash. Usage: `scripts/build.sh`. |
| `deploy.sh` | Deploys everything: database stack, Astro site build, Lambda package, app stack, CloudWatch Transaction Search and Bedrock invocation logging, S3 site upload (cache headers per file type), `python3 -m db migrate` and `seed`, then syncs `resources/library/*.md` (and `EXTRA_DOCS`) to the docs bucket and runs a Knowledge Base ingestion job. Optional env: `STACK`, `DB_STACK`, `AWS_REGION`, `DB_MIN_CAPACITY`, `EXTRA_DOCS`, `RESERVED_CONCURRENCY`, `MONTHLY_BUDGET_USD`; unset values keep the stack's previous setting. Reads `PHOENIX_URL` and `PHOENIX_API_KEY` from `infra/.phoenix.env` when it exists. Usage: `scripts/deploy.sh`. |
| `deploy_observability.sh` | Deploys the Phoenix stack (`infra/observability.yaml`). Generates secrets once into `infra/.phoenix.env` (mode 600, never printed), waits for Phoenix through CloudFront, then creates the app's API key and the Phoenix projects. Optional env: `OBS_STACK`, `AWS_REGION`, `PHOENIX_INSTANCE_TYPE`, `PHOENIX_SNAPSHOT_ID` (first deploy only). Run it before `deploy.sh` if you want Phoenix traces. |
| `teardown.sh` | Removes the deployment: turns off Bedrock invocation logging, empties the app buckets, deletes the app, database and Phoenix stacks (final snapshots kept), then the artifact bucket. Asks you to type `delete` unless given `--yes`. Optional env: `STACK`, `DB_STACK`, `OBS_STACK`, `AWS_REGION`. Usage: `scripts/teardown.sh [--yes]`. |
| `gen_content.py` | Offline content step: asks Claude (through `pipeline._converse`) for a plain-language glossary and a Spanish questionnaire, written to `frontend/public/content/glossary.json` and `questions_es.json`. Answers stay keyed by statement id, so scoring is untouched. Usage: `python3 scripts/gen_content.py` with AWS credentials. |
| `build_pitch_pdf.py` | Renders `docs/pitch/index.html` to `docs/pitch/OCI-Capacity-Coach-pitch.pdf`, one 1920x1080 page per slide, with Playwright Chromium. Usage: `python3 scripts/build_pitch_pdf.py`. |
| `build_guide_pdf.py` | Renders `docs/technical-guide.md` (Markdown and Mermaid, through marked and mermaid from the jsDelivr CDN) to `docs/OCI-Capacity-Coach-technical-guide.pdf`, A4 with the app's fonts and page numbers, with Playwright Chromium. Needs network. Usage: `python3 scripts/build_guide_pdf.py`. |

## Changing it safely

- The generated content files were reviewed and fixed by hand: re-running `gen_content.py` overwrites those fixes.
- `build.sh` decides what ships to Lambda. A new top-level module or folder the API imports must be added to its copy list.
- Never print or commit `infra/.secret` or `infra/.phoenix.env`.
- `teardown.sh` deletes all assessments and traces (only snapshots remain).
