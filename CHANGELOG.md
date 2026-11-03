# Changelog

Each section below is published verbatim as the GitHub release of the same tag.

## v1.0.0 — What Everytown asked for: roles, program models, a 12-week roadmap, staff BI, peer matching

Built from three Nov 3 conversations: the Community Safety Fund director and program lead, an Everytown representative reviewing the sample report, and the AWS tech lead. Five Herdr-orchestrated worker agents built it in parallel.

**Intake and personalization**
- **Who is filling this out?** Role is required (Executive director, Finance lead or bookkeeper, Board chair or member, Program director, Other leadership role); job title and name are optional, and the name is never sent to the AI. The director's guidance is shown: someone in a leadership role should complete it. Teammates who answer a shared area are asked their role, recorded as per-area "Answered by".
- **Program model and size:** a clear "What does your organization do?" question, plus staff size and yearly budget (size can mean either, per the director). The AI tailors advice to program model, size and budget, and writes the summary in a coach's voice ("Here's what I've learned about you ... If I were you, I would start with ...").
- **Website, social media and news:** the research step reads the website (homepage plus up to 2 about or program pages), up to 5 social media links (title and description only) and Google News headlines that name the organization, with the SSRF guard on every fetch. Code rates the research as rich, some, limited or none; with nothing found, the report relies on answers only. Research never affects scores.

**Questionnaire: quick, easy and fun**
- **One at a time** is the new default view: one statement per card with big Yes / No buttons, auto-advance, Y / N / Left-arrow keys, area progress, code-written encouragement and an "<Area> complete" badge card.
- **Merged ladder questions:** the 5 laddered groups from the team brief (funding horizon, largest grant, planning, audits, fundraising staff) are asked as one multiple-choice question; a fixed cumulative rule records an explicit yes or no for each statement, and a "Based on your choice, we recorded" card lets people change any of them. Scoring is unchanged.
- Time-left estimate, area streak chip, a finish screen before submit, and a demo-only "fill this area with sample answers" button for presentations.

**A report in layers**
- The results page opens on **Your plan**: what's true about you, what we learned about you online (with sources), Start here, your 12-week roadmap, Ask about your report, support and peer connect. **Explore any area** lets a leader deep dive into any assessed area. **Your results in detail** keeps every number. No spider chart.
- **The PDF starts with a letter:** what we learned, strengths, "If I were you, I would start with", the first weeks of the roadmap and how CSF can help; then "Behind the plan: your detailed results".
- **Connect me with similar groups** (`POST /api/assessments/<id>/peer-request`): CSF introduces organizations with consent; organizations never see other organizations' data.

**12-week roadmap with progress tracking and gamification** (`/plan/?id=`)
- Fixed code turns the checked report into 12 weekly milestones: weeks 1 to 4 are the Start here priorities, then the 30 / 60 / 90 day plan, ending with "Retake the OCI". Weeks open one at a time, when the last one is finished or after 7 days. Leaders tick steps (`roadmap_tasks` table), download a one-page PDF for each week, and see a progress bar, points (10 per step, 25 per week), a weekly streak, a level and 7 badges. All of it rewards follow-through, never answers or scores, and there is no cross-organization leaderboard.

**CSF staff BI dashboard** (tabs in the director's priority order)
- **Training needs:** which organizations need which training (organizations × areas: High priority growth priorities or a support request), with "Draft a training brief" per area and CSV. Then **Gaps by area** (group by program model, staff size, budget or who answered), **Most common gaps**, **Change over time** (including "Did support help? Early signal"), **Ask the data** and **Peers**. An organization drawer shows stages, top growth priorities, support request, roadmap progress and similar grantees.
- **Ask the data:** staff ask in plain words (`POST /api/staff/ask`). Claude only picks one of 8 pre-built analyses and filters from fixed lists (never SQL); code computes the table; a second short call summarizes it, and any number not in the table falls back to a code-written sentence.
- **Peer matching** in code: program model 40%, size by staff or budget 30%, shared growth priorities 30%, with plain reasons. Peer groups by program model and size; peer benchmarking only within the same program model, as the director asked.
- **Network report PDF** (`GET /api/staff/network-report.pdf`): a year-end summary; organization names only in a staff-only appendix.

## v0.9.0 — Modern AI features and a smoother questionnaire (from the team brief)

Built in parallel by four Herdr-orchestrated worker agents on new feature modules (`features/*.py` blueprints auto-registered by `app.py`, `features/*.sql` applied by `python3 -m db migrate`).

**AI, still as fixed steps (Claude never scores, re-ranks or sets answers)**
- **Code picks "Start here".** The one or two first priorities are chosen by fixed code: the engine's top growth priority, then the highest-ranked one from a different area. Claude only explains them. The server keeps exactly those, in that order, and fills in any the AI skipped from the engine's own next steps.
- **Reading-level check.** A fixed Flesch-Kincaid formula measures each English report. Above grade 8.5, one rewrite step asks Claude for plainer words with the same structure, priorities and links; the rewrite is rejected if any id or link moves, and the plainer version is kept. New progress step "Checking it reads clearly"; the report and PDF show "Reading level: about grade N".
- **Amazon Bedrock Guardrails** on every Claude call: hate, insults and sexual content filters; a violence filter on output only (CVI field guides discuss violence); prompt-attack blocking on input (covers website text and coach questions); emails, phone numbers, SSNs and card numbers masked. Blocked answers show a plain message and the scores stay saved. New `OCI_GUARDRAIL_ID` / `OCI_GUARDRAIL_VERSION`.
- **Ask about your report.** A new section after "Start here" lets a leader (or Everytown staff) ask questions in their own words. Each question is one fixed Claude call (`POST /api/assessments/<id>/ask`) with the scored facts, the checked report, the prompt-cached CVI library and the last 6 turns. Answers are validated like reports (only this assessment's growth priorities and catalog links), show "Based on your answers to" chips, and never change scores. Questions about immediate danger get a fixed 911 / 988 answer without calling the model. 15 questions per report, 500 characters each, stored in `coach_messages`.
- **Read-aloud with Amazon Polly.** Listen buttons play natural generative voices (Ruth in English, Lupe in Spanish) from `GET /api/assessments/<id>/audio/<section>`, with a shared player: play/pause, 1x / 1.25x / 0.85x speed and Stop.
- **Staff AI training briefs.** "Draft a training brief" on each cohort and top growth priority writes a Community Training Institute session plan (why it matters, who it is for, 3 to 5 outline steps, pre-work, catalog-only resources, follow-up) in one fixed Claude call that sees only the statement, the engine's next steps and code-computed counts, never organization names. Labelled as an AI draft to review; printable.

**Questionnaire and flow**
- **Checklist view:** answer each area as "Yes / No for each" or "Checklist: tick what's true". A required "Done: everything I didn't tick is a No" button turns unticked statements into explicit No answers, because the engine treats a missing answer as favorable.
- **Plain-language help:** jargon such as "logic model" or "restricted funding" gets a "What does it mean?" disclosure with a plain definition and example (37-term glossary written once offline by `scripts/gen_content.py`, then reviewed).
- **Spanish questionnaire:** "Questions in: English / Español", defaulting to the report language. All 143 statements and area descriptions are machine-translated and reviewed, with the English original one click away. Answers are keyed by statement id, so scores are identical in both languages. Everytown should review the translation before real use.
- **Save and resume, and send an area to a teammate.** "Save and finish later" gives a resume link and a short check code; the new "Continue an assessment you started" page (`/resume/`) picks it up on any device. "Send this area to a teammate" (for example Financial Management for the bookkeeper) gives a separate link that can see and answer only that area; answers merge into the same assessment. New `drafts` and `draft_shares` tables.
- Y and N keys answer the focused statement; each finished area gets a short encouraging line written by us, not by AI.
- **About your organization (optional):** program model, staff size and state from fixed lists, stored on the assessment and the organization, never scored. Staff can filter Grantees to connect, Support requests and Organizations by them.
- `scripts/build.sh` now packages `features/` into the Lambda zip.

## v0.8.0 — Community Safety Fund alignment and support requests

Modeled on the [Everytown Community Safety Fund](https://everytownsupportfund.org/everytown-community-safety-fund/) site and its Grantee Portal, where grantees "sign up for future training opportunities and complete surveys, which inform our program development".

- **Ask the Community Safety Fund for support.** From the report, a grantee picks the capacity areas where they want training or coaching; the areas behind their "Start here" priorities are pre-checked. `POST /api/assessments/<id>/support` (only from the sign-in session that submitted it) stores the request in the new `support_requests` table and on the report. No free text, so no personal data.
- **Staff dashboard: Support requests** by area, counting each organization's latest request, with links to the reports. This feeds Community Training Institute planning. Seed data includes synthetic requests.
- **CSF look:** Source Serif 4 headlines (a free stand-in for CSF's GT Super), navy pill buttons, a pale-blue title band on every page, an "Everytown Community Safety Fund" header lockup with an orange three-bar mark (our own SVG), a "Use accessible colors" option, and footer links to the CSF page and the CSF Grantee Portal. Red is now only the header stripe and error text.
- **"On this page" navigation** on the long report: a sticky left column on wide screens and a collapsible panel on phones, with the current section marked `aria-current`.
- **CloudFront:** the distribution-wide 403-to-404 page mapping is gone, because it also replaced the API's own error responses on `/api/*`. Unknown site paths now get the 404 page from the viewer-request function.
- axe-core: no WCAG 2.2 A/AA violations on any page at 1280 and 375 px.

## v0.7.0 — Hardening from the AWS review

- **API locked behind CloudFront.** The Lambda Function URL now uses `AWS_IAM` auth with CloudFront Origin Access Control, so it can't be called directly; the `FunctionUrl` output is removed. The frontend signs request bodies with `x-amz-content-sha256`, as OAC requires for Lambda.
- **Spend guards.** Reserved concurrency of 5 on the Lambda, and at most 30 new reports per hour across the demo (`OCI_MAX_REPORTS_PER_HOUR`, answers 429 beyond it). An optional monthly AWS Budget (`MONTHLY_BUDGET_USD`; this sandbox denies budget creation, so deploy here with `MONTHLY_BUDGET_USD=0`). New `scripts/teardown.sh` removes both stacks and empties the buckets after judging.
- **Re-assessment progress is scoped to the sign-in session.** Each sign-in gets an owner id; progress only compares with earlier assessments from that session, so one user can no longer see or overwrite another's baseline. Staff analytics are unchanged.
- **Truncated or refused model answers.** Both Bedrock calls check `stopReason` and show a clear message for `max_tokens` or refusals instead of a bare error. The report budget is now 16,000 tokens, and the website step has a 4,000-token budget.
- **Website research never fails the report.** Any fetch or Bedrock error falls back to "no profile". The research prompt now treats website text as data, not instructions.
- **Library:** the full field-guide library is always in the prompt. Knowledge Base passages are added for the organization's top growth priorities. Prompt caching (`cachePoint`) covers the system prompt, catalog and library: about 15k input tokens are read from the cache on later reports.
- `validate_report` ignores non-string and malformed fields from the model instead of crashing. `deploy.sh` falls back to `shasum -a 256` on macOS.
- The UI now says the questions are in English when a Spanish report is chosen, and that progress is per sign-in session.
- The PDF size was already computed once by the worker (since v0.5), not on every results page load.

## v0.6.0 — UI/UX refresh from Mobbin references and Google Stitch designs

Researched with the Mobbin MCP (real product screens) and designed with Google Stitch (project "Everytown OCI Capacity Coach", Everytown design system: navy #001C60, royal blue #0D3DD9, red #E3012B, Atkinson Hyperlegible). Stitch's layouts were rebuilt in our Astro components; none of its placeholder text is used.

- **Questionnaire:** area stepper with "Completed / In progress / Upcoming" status cards and "Area 2 of 4 · Next: Financial Management" (after [Turo](https://mobbin.com/screens/d1f5a3aa-ffb1-4886-abb8-75ea4ce3130f) and [OKX](https://mobbin.com/screens/6672effd-4ebb-4c68-8cbd-bf88239ef93f)); statements grouped under stage headings with the stage description; large Yes/No cards with a visible "Selected" label; sticky Back / "Saved on this device" / "Next: <area>" bar that never hides the focused control (WCAG 2.4.11).
- **Results reordered** to lead with what the Everytown rep asked for: "What's true about you", then "Start here: your top priorities", then stages and the plan.
- **Start here cards** with a "What to do" checklist saved on the device and a "Not started · 4 steps" / "2 of 4 steps done" status (after [Monarch](https://mobbin.com/screens/53631102-dc15-414f-92b8-e6802620d214)).
- **Compact stage tracks** (5 segments plus a "Current stage" label) replace the large circle ladders; the data table stays.
- **30 / 60 / 90 plan** as one card per horizon with owner role chips (after [HubSpot](https://mobbin.com/screens/bc1ba2a3-126e-4a46-974f-bdde0ee48ec5)).
- **Reassess in 90 days** callout with an "Add a 90-day reminder to my calendar" `.ics` download generated in the browser (after [Codecademy](https://mobbin.com/screens/fc2dd380-28af-4459-95ba-a21396c65286)).
- **Start page:** "How it works" strip; area cards with a "Recommended" tag and time estimates (after [Airwallex](https://mobbin.com/screens/d6b9163b-e257-40f3-ae2c-4ea98a4ac3ca)).
- **Staff dashboard:** KPI cards (after [Unity](https://mobbin.com/screens/5c30ec20-80bf-4246-9ac8-ea4a01a6b65d)) and a "How these numbers work" explainer (after [Google Workspace](https://mobbin.com/screens/69b435be-3b4f-4645-b69a-bc5ad3881435)).
- axe-core: no WCAG 2.2 A/AA violations on any page at 1280 and 375 px.

## v0.5.1 — Pitch deck for v0.5

- Pitch deck (`docs/pitch/index.html`) in Everytown colors, with new slides "What Everytown told us" (interview quotes mapped to features) and staff network analytics, the Aurora architecture, updated costs, and fresh screenshots. Fonts load from `frontend/public/fonts`.
- Demo script adds a 25-second staff dashboard beat (still 3:00). Backup PDF regenerated from v0.5.

## v0.5.0 — Astro frontend in Everytown colors, Aurora PostgreSQL, staff network analytics

Driven by an onsite interview with an Everytown representative.

- **Aurora PostgreSQL Serverless v2** (new `everytown-oci-db` stack, `infra/database.yaml`) replaces the S3 JSON store. The Lambda reaches it through the RDS Data API, so it still needs no VPC or NAT. `schema.sql` holds organizations, assessments (full document as `jsonb`), and normalized answers, domain results and growth priorities for analytics. `python3 -m db migrate` and `python3 -m db seed` (20 synthetic organizations) run on every deploy.
- **Everytown staff dashboard** (`/staff/`, sign in as `staff` / `staff`): network totals, stage distribution per area (bars plus an equivalent table), the most common growth priorities across the network (training and service needs), "Grantees to connect" cohorts that share a High priority growth priority, and an organizations table. Filter by area, download CSV.
- **Benchmarking groundwork**: a `domain_benchmarks` SQL view ranks each organization within each domain. It appears only on the staff dashboard, labelled as a preview; grantees never see peer comparisons.
- **"Start here: your top priorities"**: the report now leads with "What's true about you" and at most two grounded first priorities, each explained and tied to the statements behind it, before the 30 / 60 / 90 day plan. Prompt rewritten for leaders of small groups with lived experience, at an 8th grade reading level. Also in the PDF.
- **Astro 5 frontend** (`frontend/`, static, TypeScript, no UI framework) in Everytown's palette (navy #001C60, royal blue #0D3DD9, red #E3012B), every text pair at WCAG AA contrast. Same accessibility features as before; axe-core reports no WCAG 2.2 A/AA violations on any page, including the staff dashboard.
- **JSON API**: Flask now serves only `/api/*`. POSTs must be JSON (blocks cross-site form posts). Mocked roles: `demo` (organization) and `staff`.
- **Hosting**: CloudFront serves the Astro site from a private S3 bucket (origin access control) and routes `/api/*` to the Lambda Function URL. The old `templates/`, `static/` and S3 submissions bucket are removed.
- Cost: about $45 a month with Aurora kept warm at 0.5 ACU; `DB_MIN_CAPACITY=0 scripts/deploy.sh` switches to auto-pause (about $1 to $3 a month).

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
