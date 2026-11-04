# OCI Capacity Coach: 8-minute pitch and live demo

Deck: [`OCI-Capacity-Coach-pitch.pdf`](OCI-Capacity-Coach-pitch.pdf) (16 pages), or present [`index.html`](index.html) in a browser: arrows or space to move, `N` for speaker notes (timed per slide). Rebuild the PDF after editing the deck: `python3 scripts/build_pitch_pdf.py`.

Live app: https://d2mi2h3eu8y69s.cloudfront.net. Sign in as `demo` / `demo` (organization) or `staff` / `staff` (Everytown staff). AI observability: the CloudWatch dashboard `everytown-oci` (stack output `DashboardUrl`) and Transaction Search, in the AWS console.

Judging criteria (official weights): **[INNOV]** Technical innovation 25%, **[IMPACT]** Social impact potential 25%, **[FEAS]** Feasibility and sustainability 20%, **[SCALE]** Scalability 15%, **[PRES]** Presentation quality 15%. Every slide's top-right tag names the criterion it serves. Presentation quality is the whole talk: stay on time, demo live, land one line per slide.

## Run of show (7:45, then 2:00 of questions)

| Time | Slide | Point to land | Criterion |
|---|---|---|---|
| 0:00 to 0:20 | 1 Title | CVI organizations stop shootings in their neighborhoods; CSF helps them get stronger. The AI never scores. Synthetic data, mocked login, URL torn down after judging. | [IMPACT] |
| 0:20 to 1:00 | 2 The need | 45 pilot organizations, 2 staff writing every report by hand, 140+ in the network. Impact path: stronger organizations keep violence intervention running; every grantee gets a plan in minutes, training aims at real gaps, staff time goes to coaching. | [IMPACT] |
| 1:00 to 1:30 | 3 What Everytown told us | Four quotes from the CSF interview, four things we built. | [IMPACT] |
| 1:30 to 4:00 | 4 Live demo | Switch to the browser (below). Slides 4 and 5 are the backup if the network fails. | [PRES] all |
| 4:00 to 4:45 | 6 How it works | Code scores, AI writes, code checks. Six fixed steps, not an agent. | [INNOV] |
| 4:45 to 5:30 | 7 Traced and tested | Every report is a trace in Amazon CloudWatch; 52 synthetic test cases; the evals caught 3 real bugs. | [INNOV] |
| 5:30 to 5:55 | 8 Accessible | Impact only counts if the readers can use it: coach's letter, reading grade measured in code, Listen, Spanish, WCAG 2.2 AA. | [IMPACT] |
| 5:55 to 6:35 | 9 Feasibility and sustainability | Live today; $0.11 a report, under $50 a year of tokens, $1 to $3 a month hosting, 0 servers; Apache-2.0 CloudFormation Everytown owns; gates on every release. | [FEAS] |
| 6:35 to 7:10 | 10 Scalability | 100+ reports a minute within the Bedrock quotas; Lambda 1,000 concurrent (5 is a spend guard); cost grows linearly; better peer matches as it grows. | [SCALE] |
| 7:10 to 7:45 | 11 Our ask | Pilot with 3 to 4 CSF grantees this quarter. Leave this slide up for questions. | [FEAS] |

Slide 5 (staff screenshots) is skipped when the live demo covers the staff view. The appendix (A1 to A5) answers likely questions: responsible AI, security and privacy, eval results, cost, roadmap.

## Before you go on stage (10 minutes)

1. Open https://d2mi2h3eu8y69s.cloudfront.net/api/healthz and confirm `ok`.
2. **Tab B (prepared report).** Sign in as `demo` / `demo`. Open **Try a made-up sample organization** and click **Riverbend Violence Interruption Network (synthetic sample)**. Wait for **Your report is ready**. Keep this tab at the top of the report. Do not sign out: the roadmap belongs to this sign-in session.
3. **Tab A (live run).** In the same window, a new tab on the start page. Optional: choose **Español** under **Report language**.
4. **Tab C (staff).** A private window, sign in as `staff` / `staff`, stay on **Training needs**.
5. **Tab D (AWS console).** In the private window, sign in to the AWS console in us-west-2 and open the CloudWatch dashboard `everytown-oci`, so the trace link opens without a sign-in.
6. Open `OCI-Capacity-Coach-pitch.pdf` and `sample-report.pdf` locally as the offline backup. Browser zoom 125%. Notifications off.
7. The hourly report cap allows a few reports: do not run practice reports in the last hour.

## The live demo (2:30)

| Time | Exact clicks | Say |
|---|---|---|
| 0:00 to 0:15 | Tab A: open **Try a made-up sample organization**, click **Southside Youth Peace Collective (synthetic sample)**. | "One click fills a made-up organization's answers. The stages appear instantly, from Everytown's own scoring code. The AI report takes about 40 seconds, so let me show you one we ran earlier." |
| 0:15 to 0:50 | Tab B: **What's true about you**, point at **Reading level: about grade 6**. Click **Listen** for one sentence, then stop. | "It reads like a letter from a coach, strengths first. The reading level is measured in code, and any section can be read aloud." |
| 0:50 to 1:20 | Tab B: **Start here**, priority 1: point at **Based on your answers** (FR7) and the resource link. | "One or two things first, chosen by code. Each shows the exact answer behind it. If the model cites anything else, the server drops it, and links come only from a vetted catalog." |
| 1:20 to 1:40 | Tab B: **Your 12-week roadmap**, open it, tick one step of week 1. | "Then a 12-week roadmap with an owner for every step, points and badges for following through. Week 12 is retake the OCI." |
| 1:40 to 1:50 | Tab A: point at **Your report is ready**, click **Download PDF report**. | "That is the report we started a minute and a half ago, finished live, with a PDF letter for the board." |
| 1:50 to 2:20 | Tab C: **Training needs** (top cards), then **Ask the data**, click **Which organizations need fundraising training?**, then **Peers**. | "Everytown's side: who needs which training, plain-language questions where the AI only picks an analysis and code computes every number, and similar grantees to connect." |
| 2:20 to 2:30 | Tab C: back to **Training needs**, scroll to the matrix, click **Southside Youth Peace Collective (synthetic sample)** to open its drawer, then **View AI trace in CloudWatch (staff)**. | "And every AI step is auditable in Amazon CloudWatch: this is the trace of the report we just ran, every prompt, token and check." Back to the deck, slide 6. |

If a new report is refused because of the hourly cap, say "that is the hourly report cap doing its job" and stay in Tab B. If a report shows **We could not finish your recommendations**, say "the scores are saved, it only reruns the AI steps", click **Try again** and continue in Tab B.

## Numbers to have ready for questions

- 45 organizations in the manual 2025 pilot; 2 CSF staff wrote every report; 140+ organizations in the network. CSF has granted $15.7 million to 141 CVI programs in 72 cities since 2019.
- 8 areas, 143 statements; the reference scoring engine passes all 3 answer keys (`verify_benchmark.py`).
- About 40 seconds and about $0.11 of Bedrock per report (token counts on the trace). 15 coach questions per report.
- Hosting: about $45 a month with Aurora kept warm at 0.5 ACU (as for judging), $1 to $3 a month with auto-pause; CloudWatch observability a few dollars a month, no server.
- Evals: 16 report cases, 21 coach questions, 15 staff questions, 20 judge calibration cases; all gates pass. Report judges (v1.5 run): actionability 0.88, personalization 0.83, faithfulness 0.73, plain language 0.72; coach helpfulness 0.69.
- Bugs the evals caught: the guardrail blocked a normal Spanish report (it judged our own facts as a prompt attack); "change my score" returned an error; tracing was silently off after a deploy (a missing library).
- Protection on this temporary deployment: mocked login; CloudFront with IAM-signed origin access to the Lambda; 5 concurrent requests; an hourly cap on new reports; traces and model logs only in CloudWatch, behind AWS sign-in.
- axe-core: no WCAG 2.2 A or AA violations on any page.
- Scale: Bedrock quotas in this account are 6M tokens a minute for Claude Sonnet and 10M for Haiku. A report uses about 31,000 Sonnet tokens (cached prompt included) plus Haiku research, so even with output tokens counted 5× the quotas allow more than 100 reports a minute. Lambda allows 1,000 concurrent runs (the demo reserves 5 as a spend guard); Aurora Serverless v2 scales to a 16 ACU ceiling set at deploy.
- Sustainability: Apache-2.0 open source; three CloudFormation stacks and `scripts/deploy.sh`; no servers; evals, 11 end-to-end tests and axe-core before every release.
