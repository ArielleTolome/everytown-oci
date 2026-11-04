# Next steps after the CSF director walkthrough (2026-11-04)

Source: a 21-minute recorded walkthrough of the app with the Community Safety Fund director, transcribed with Amazon Transcribe. Her overall read: "for what this is, it's absolutely on the right track." Below, each thing she raised, what v1.7 builds, and what is left. Tasks marked **Later** are sized for one person or agent each and own separate files, so several can run in parallel terminals.

## What she said, and what we do about it

| # | She said | v1.7 | Later |
|---|---|---|---|
| 1 | Quality and human in the loop: "how is our staff getting involved here to check the quality... now that we've done 5 or 10 of these, I'm seeing that it's consistently making this kind of mistake." | "Does this feel right?" feedback on every report; staff Quality tab with a review queue, Flag / Mark reviewed, issue counts, recent comments. | L1, L2 |
| 2 | Common sense: "I'm only a five-person organization. You can't ask me to set up an accounting system." | The report prompt sizes the plan to the organization's staff and budget (small team assumed when unknown); staff can flag "Too big for their size". | L3 |
| 3 | Follow-through: "I can actually prove that action was taken as a result of my recommendations." Quarterly check-ins, "a little human in the loop". | Follow-through section: on track, stalled 14+ days, not started; a check-in list with a copyable note. | L4 |
| 4 | "Sign me up for training... it should be optional... I don't want to spam them." The tool will be open to any CVI organization. | "Stay connected" opt-in on the report (trainings, updates; withdraw any time); staff Opted-in list with CSV. | L5 |
| 5 | Checklist: "Where does it tell me that that's how it works?" and "Is infinite choice too much?" | Instruction line right above the statements; one calm "How would you like to answer?" control with "your answers stay the same if you switch". | L6 |
| 6 | Where people leave the assessment (raised by our team). | "Where people stop" section from saved drafts. | L7 |
| 7 | Realistic roadmap durations: "is that a week? Is it 6 months?... there will be some work for our team." | | L8 |
| 8 | A full copy of each report for staff. | Already there: staff open and download any report. | |
| 9 | A BI dashboard. | Assessed: keep the in-app dashboard; see [quicksight-assessment.md](quicksight-assessment.md). | L9 |
| 10 | Bug found by our team: clicking an answer jumped the page to the bottom. | Fixed (questionnaire focus handler), regression test `qa/tests/regressions/answer-click-no-scroll-jump.e2e.ts`. | |

## Later tasks (one terminal each)

- **L1 Feedback into the evals.** Turn "Not quite" comments and staff flags into new eval cases (`evals/build_datasets.py`), so every release is tested against what real organizations said. Owner files: `evals/`.
- **L2 Staff corrections on a report.** Let staff add a visible "Note from CSF" to a report and hide a specific recommendation, with an audit trail. Owner files: new `features/corrections.py`, results page section.
- **L3 Size check in code.** A code check (not only the prompt) that flags plan steps that assume roles a small team lacks (finance department, HR manager), recorded as a CloudWatch quality metric and an eval gate. Owner files: `evals/checks.py`, `pipeline.py` validation.
- **L4 Reminder emails.** Quarterly check-in and stalled-roadmap reminders with Amazon SES, staff approve each batch (human in the loop), unsubscribe link. Needs SES production access and the opt-in list. Owner files: new `features/reminders.py`, EventBridge schedule in `infra/template.yaml`.
- **L5 Open intake for new organizations.** Real sign-in (Amazon Cognito) so any CVI organization can create an account; mark grantee vs new group; opt-in flows into the CSF CRM export. Owner files: `infra/`, `app.py` auth, login page.
- **L6 Choice study.** Log which answer view people pick and finish with (no personal data); after the pilot, keep the default the data supports. Owner files: questionnaire, `features/drafts.py`.
- **L7 Drop-off events.** Record per-area start and finish events server-side (today only saved drafts are counted). Owner files: new `features/events.py`, questionnaire.
- **L8 Staff-editable roadmap timing.** A staff page to set how many weeks each kind of step gets, by organization size, feeding `features/milestones.py`. Needs CSF's input first.
- **L9 QuickSight, if a trigger in the assessment is met.** Nightly S3 snapshot + Athena + one dashboard.
- **L10 Pilot readiness.** Everytown's AWS account, real sign-in, CloudWatch Logs data protection on traces, retention policy, CSF review of the field guides (from the deck's roadmap appendix).
