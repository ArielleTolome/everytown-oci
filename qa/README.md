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
| `tests/mobile/intake-start-errors.e2e.ts` | Phone bug bash: one edit (paste, autofill) clears a start-page field's red error bar; the time estimate never says 0 minutes. v1.8.2: job title and name are required, never folded on a phone, and shown as missing on `/?check=1`. |
| `tests/mobile/intake-cards-above-bar.e2e.ts` | #10 (phone target): every One at a time card in Planning shows its question and first answer above the bottom bar. |
| `tests/mobile/intake-link-box-resize.e2e.ts` | #15: the save link box re-fits the whole link when the window turns (390 -> 700 -> 390). |
| `tests/mobile/report-plan-rotate-order.e2e.ts` | #15, #38: the chosen week opens under its timeline row on phones and under the whole timeline from 600 px, and "Why this matters" follows the width. |
| `tests/regressions/intake-spanish-controls.e2e.ts` | #14: with Español, the questionnaire's bar, area navigation and save tools are in Spanish. |
| `tests/regressions/spanish-answer-controls.e2e.ts` | #19: with Español, the Yes / No and Checklist answer controls are in Spanish. |
| `tests/regressions/resume-error-alert.e2e.ts` | #20: a wrong resume link sent with Enter is announced (the error is an alert). |
| `tests/regressions/login-empty-field-error.e2e.ts` | #17: sign-in names the empty field and marks only that field invalid. |
| `tests/regressions/peer-groups-left-out.e2e.ts` | #16: staff Peers says how many organizations are in no group and why. |
| `tests/regressions/peers-card-link-target.e2e.ts` | #18: report links in "Asked to be connected" cards meet the 24 px target size. |
| `tests/regressions/quick-previous-history.e2e.ts` | #24, #27: an answered card says Next; Previous retraces the cards seen in Planning (including multiple-choice questions) and Next walks them again; the first card's Previous is present but unavailable. |
| `tests/regressions/quick-progress-position.e2e.ts` | #26: "Question N of M" and its bar follow the card on screen (a multiple-choice question is one card; Previous lowers both); on phones the bar takes most of the row. |
| `tests/regressions/language-switch.e2e.ts` | #25: Español in the top-right switch gives Spanish questions with nothing else to do; the questionnaire switch sets the draft (report) language; a submit carries `language: "es"` (the POST is intercepted, no report is made). |
| `tests/regressions/start-several-states.e2e.ts` | #23, #31: two states or territories added on the start page show as chips on one row, one can be removed, and they come back, in order, from the draft. |
| `tests/regressions/answer-style-chooser.e2e.ts` | #28: before the first question, one sample statement in all three answer styles; the choice sticks and "Change how I answer" switches later. |
| `tests/regressions/quick-ladder-filled-in.e2e.ts` | #29: after a multiple-choice question, "Your choice filled in these answers" shows selected Yes / No pairs that flip with one tap. |
| `tests/regressions/quick-nav-every-card.e2e.ts` | #30: every One at a time card has Previous and Next in the same place; an unavailable one stays and says why. |
| `tests/regressions/report-plan-layout.e2e.ts` | #32 to #37: Your plan reads Summary about your organization, the roadmap, then Start here, and Start here shows only the steps of open weeks. |
| `tests/regressions/roadmap-timeline-badge.e2e.ts` | #38: the roadmap opens on a 12-week timeline with points and badges first and no step count; picking a week shows it (a locked week says when it opens); finishing a week pops up a badge dialog once (Escape returns focus); the report's roadmap card names this week without a count. Ticks are answered in the page. |
| `tests/mobile/intake-resume-link.e2e.ts` | Phone bug bash (phone target): the save and teammate links show in full in their box (an iPhone SE showed about 10 characters). Makes one "QA Phone" draft. |
| `tests/mobile/report-coach-answer.e2e.ts` | Phone bug bash, #37: Chat about your report opens as a dialog and the new answer is on screen. v1.10.1: a question asked while the earlier conversation is still loading still shows its answer (it showed "We could not answer right now"). The ask requests are stubbed in the page. |
| `tests/mobile/report-larger-text-bar.e2e.ts` | Phone bug bash: with Larger text, the report's sticky "On this page" bar stays on one line. |
| `tests/mobile/report-week-done-cheer.e2e.ts` | Phone bug bash: finishing a roadmap week shows "Week N done!" where focus lands (it was off screen). The POST is answered in the page, so Riverbend is unchanged. |
| `tests/demo/demo-path.e2e.ts` | Tag `demo`: the demo script's on-stage path. Leader: one-click Southside sample to "Your report is ready", Start here, one chat question (a real coach call), PDF. Staff: Training needs, Ask the data preset, Peers, the Southside drawer's CloudWatch trace link. |

## Changing it safely

- Regression tests use exact locators and no model steps, so they cost nothing to run. A confirmed bug bash
  finding gets a repro test that fails first, then moves into `tests/regressions/` once fixed.
- Organizations created by tests use names starting with `QA `. No test submits a questionnaire: each new report
  costs Bedrock tokens and counts against the hourly cap (`OCI_MAX_REPORTS_PER_HOUR`).
