# qa/

Browser end-to-end tests and the bug bash setup, written with [e2e](https://e2e.com) (Playwright underneath, agent
steps on Claude Sonnet via Amazon Bedrock). It is a separate Node package that drives a running copy of the app.
Background and the bug bash procedure: [root README](../README.md#end-to-end-tests-and-bug-bash-e2e).

## How to run

```bash
cd qa && npm ci
APP_URL=<url> AWS_REGION=us-west-2 npx e2e run --exclude-tag live --exclude-tag demo --action-timeout 8000 --reporter list
npx e2e run --tag live          # read-only checks against the deployed site (LIVE_URL)
APP_URL=<url> npm run test:demo # the on-stage demo path; makes one report (tag demo)
```

Every test runs on two targets: `web` (1280x720) and `phone` (390x664, the visible size of an iPhone 13, with an iPhone
Safari user agent); add `--target web` or `--target phone` to run one. `APP_URL` defaults to `http://127.0.0.1:8092`
(the container). Tests tagged `live` hit the deployed CloudFront site
(`LIVE_URL`, default the demo URL) and are excluded from normal runs; tests tagged `demo` create a report and run only
with `npm run test:demo`. `npm run test:e2e` and `npm run test:live` are the first two commands without the extra
flags. Needs Node 24.8 or newer and AWS credentials for Bedrock in the environment: the Bedrock provider does not read
an instance role, so on EC2 run `eval "$(aws configure export-credentials --format env)"` first.

## Files

| File | What it does |
|---|---|
| `package.json`, `package-lock.json` | Package `oci-qa`: `e2e`, `@e2e-dev/web`, `@ai-sdk/amazon-bedrock`; scripts `test:e2e` and `test:live`. |
| `e2e.config.ts` | Main config: the `default` agent (`us.anthropic.claude-sonnet-5-5` on Bedrock, app context and cost rules such as "start org names with `QA `"), and two targets at `APP_URL`: `web` and `phone`. |
| `e2e.bugbash.config.ts` | Extends the main config for bug bashes: all `tests/**/*.e2e.ts`, no retries, and two extra personas, `skeptic` (cross-checks every number) and `fuzzer` (input matrix first). |
| `bugbash-charters.txt` | One `e2e explore` charter per line, `area\|persona\|session\|goal`: intake, questionnaire, report, coach, roadmap, staffdash, staffask, auth. |
| `bugbash-phone-charters.txt` | The same format for phone bug bashes (run with `--target phone`): start page, One at a time, Yes / No and Checklist, save and resume, report, roadmap, sign-in and the Display menu. |
| `.mcp.json` | Registers `npx e2e mcp` as an MCP server for coding agents. |
| `.gitignore` | Ignores `node_modules/`, e2e run output under `.e2e/` and local agent folders. |
| `tests/auth.setup.e2e.ts` | Setup: signs in through `/login/` as `demo` (lands on `/`) and `staff` (lands on `/staff/`) and saves each as a session. |
| `tests/smoke.e2e.ts` | `demo` sees "Tell us about your organization"; `staff` sees "Network capacity dashboard". |
| `tests/regressions/open-redirect.e2e.ts` | #1: `/login/?next=/\example.com/` stays on this origin after sign-in. |
| `tests/regressions/start-here-roadmap-sync.e2e.ts` | #3: Start here checkboxes on a report show steps ticked on the roadmap (report from `OCI_REPORT_ID`, default the shared Riverbend sample). |
| `tests/regressions/area-nav-done-label.e2e.ts` | #4: a finished area reads Completed, not In progress, in the area nav after a reload. |
| `tests/regressions/planning-time-estimate.e2e.ts` | #5: the Planning time estimate on the intake card matches the questionnaire's "minutes left". |
| `tests/regressions/common-gaps-model-overlap.e2e.ts` | #6: staff "Most common gaps" explains that an org with two program models counts in both. |
| `tests/regressions/unknown-path-404-page.e2e.ts` | #8: the container serves the app's not-found page for an unknown path. |
| `tests/regressions/cloudfront-404-status.e2e.ts` | #9 (tag `live`): the deployed site answers an unknown path with HTTP 404. |
| `tests/regressions/bugbash-v15.e2e.ts` | v1.5 bug bash: One at a time controls in Spanish, a roadmap for an unknown report links to the start page, the 404 page shows who is signed in. |
| `tests/regressions/answer-click-no-scroll-jump.e2e.ts` | Focus landing on `<main>` (what clicking an answer label does) never scrolls the questionnaire; it jumped to the page bottom before v1.7. |
| `tests/quality.e2e.ts` | v1.7: staff see the four Quality and follow-through sections and a report's feedback card (read-only); organizations get 403 from the staff quality, opt-in and funnel APIs. |
| `tests/mobile/phone-flow.e2e.ts` | v1.8 phone promises (phone-only checks skip on `web`): no sideways scroll and 16 px fields on sign-in, start, resume, all questionnaire views, report and roadmap; Start questionnaire on the first phone screen with only optional groups folded; One at a time Yes / No above the sticky bar; the bar never covers a focused answer; 44 px answer targets; Start here rows as one target; the report's Start here pill lands below its sticky bar. |
| `tests/mobile/intake-start-errors.e2e.ts` | Phone bug bash: one edit (paste, autofill) clears a start-page field's red error bar; the time estimate never says 0 minutes. |
| `tests/mobile/intake-resume-link.e2e.ts` | Phone bug bash (phone target): the save and teammate links show in full in their box (an iPhone SE showed about 10 characters). Makes one "QA Phone" draft. |
| `tests/mobile/report-coach-answer.e2e.ts` | Phone bug bash: after Ask about your report, the new answer is on screen (it landed above it). The POST is stubbed in the page. |
| `tests/mobile/report-larger-text-bar.e2e.ts` | Phone bug bash: with Larger text, the report's sticky "On this page" bar stays on one line. |
| `tests/mobile/report-scores-caption.e2e.ts` | Phone bug bash: the scores table caption stays inside its scroll frame, also after swiping the table. |
| `tests/mobile/report-week-done-cheer.e2e.ts` | Phone bug bash: finishing a roadmap week shows "Week N done!" where focus lands (it was off screen). The POST is answered in the page, so Riverbend is unchanged. |
| `tests/demo/demo-path.e2e.ts` | Tag `demo`: the demo script's on-stage path. Leader: one-click Southside sample to "Your report is ready", Start here, PDF. Staff: Training needs, Ask the data preset, Peers, the Southside drawer's CloudWatch trace link. |

## Changing it safely

- Regression tests use exact locators and no model steps, so they cost nothing to run. A confirmed bug bash
  finding gets a repro test that fails first, then moves into `tests/regressions/` once fixed.
- Organizations created by tests use names starting with `QA `. No test submits a questionnaire: each new report
  costs Bedrock tokens and counts against the hourly cap (`OCI_MAX_REPORTS_PER_HOUR`).
