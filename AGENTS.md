# Working on the OCI Capacity Coach

Start here if you are new to the repo, human or AI assistant. What the product is and who it serves: [PRODUCT.md](PRODUCT.md). How to run, deploy and configure it: [README.md](README.md). Every folder has its own `README.md` listing each file and what it does.

## The project in one minute

Community violence intervention (CVI) nonprofits in Everytown's Community Safety Fund (CSF) network answer 143 Yes / No statements across 8 areas, the Organizational Capacity Index (OCI). Python code scores the answers into stages (Seeding, Emerging, Developing, Strengthening, Transformational). Then a fixed pipeline on Amazon Bedrock (Claude) researches the organization, retrieves CVI field guides and writes a plain-language report, and code validates every line. CSF staff see the whole network on a dashboard.

| Where | What |
|---|---|
| `app.py` | Flask JSON API (sign-in, answers, scoring, job dispatch, staff analytics). Runs on AWS Lambda through `lambda_handler.py`. |
| `pipeline.py` | The AI steps: research, Knowledge Base retrieval, report writing, validation, reading level. |
| `features/` | Feature Blueprints (coach, read-aloud, drafts, roadmap, staff BI, peers), auto-registered by `app.py`. |
| `engine/`, `data/`, `benchmark/` | Everytown's reference scoring engine, the 143 statements, and the answer keys that prove the engine is unchanged. |
| `frontend/` | Astro 5 static site: start page, questionnaire, results, roadmap, staff dashboard. |
| `infra/`, `scripts/` | CloudFormation stacks and the deploy, teardown and build scripts. |
| `tests/`, `qa/`, `evals/` | Unit tests, end-to-end tests (e2e.com), and AI quality evals with release gates. |
| `docs/`, `resources/` | Vision and tech docs, pitch deck and demo script; the vetted resource catalog and field guides. |

## Rules that never bend

- **Code computes every score.** The AI never scores, never picks the Start here priorities, and never writes SQL. Don't change `engine/` without `python3 verify_benchmark.py` passing all three answer keys.
- **Never change the 143 statement texts or the stage names** (`data/questions.json`, `data/domain_info.json`).
- **Grounded or dropped.** Every recommended action must cite the organization's own answers; links come only from `resources/catalog.json`.
- **AWS only, Claude on Bedrock only, fixed steps (not agents), synthetic data only.** No real organization data anywhere, including tests and screenshots.
- **Plain language and accessibility:** reading grade 8.5 or below (measured in code), WCAG 2.2 AA (axe-core 0 violations at 1280 and 375 px), English and Spanish.
- **House style in UI and copy:** no em dashes, no emojis, strength-first words ("room to grow", never "weak"). The Everytown CSF look (navy #001C60, royal blue #0D3DD9, red stripe). UI work follows the design system in `/workshop/design-system/everytown-oci/` (outside this repo): `MASTER.md`, then `pages/<page>.md`.

## Before you push

| Check | Command |
|---|---|
| Scoring engine unchanged | `python3 verify_benchmark.py` (three PASS lines) |
| Unit tests | `python3 -m unittest discover -s tests` |
| Frontend types and build | `cd frontend && npx astro check && npm run build` |
| End-to-end | see [qa/README.md](qa/README.md) |
| AI quality (after prompt or pipeline changes) | `python3 -m evals.run --suite reports` (costs about $3; Gate must PASS), see [evals/README.md](evals/README.md) |

Every release: README updated, a `CHANGELOG.md` section, a `vX.Y.Z` tag and a GitHub release with that section as notes (see [Release process](README.md#release-process)). The tag push publishes the container image to GitHub Packages.

## Working alongside others

- Several people and AI sessions work in this repo at once. **Stage only the files you changed** (`git add <paths>`), never `git add -A` or `git commit -a`, or you will ship someone else's unfinished work.
- Never commit secrets or credentials: `infra/.secret`, `infra/.phoenix*`, `/workshop/api.md`, AWS keys. They are git-ignored; keep it that way.
- The live demo is shared. New AI reports cost money and count against an hourly cap; name any test organization you create starting with `QA `, and delete QA data when done.
