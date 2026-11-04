# OCI Capacity Coach: 8-minute pitch and live demo

Deck: [`OCI-Capacity-Coach-pitch.pdf`](OCI-Capacity-Coach-pitch.pdf) (16 pages), or present [`index.html`](index.html) in a browser: arrows or space to move, `N` for speaker notes (timed per slide). Rebuild the PDF after editing the deck: `python3 scripts/build_pitch_pdf.py`.

Live app: https://d2mi2h3eu8y69s.cloudfront.net. Sign in as `demo` / `demo` (organization) or `staff` / `staff` (Everytown staff). AI observability: the CloudWatch dashboard `everytown-oci` (stack output `DashboardUrl`) and Transaction Search, in the AWS console.

Judging criteria (official weights): **[INNOV]** Technical innovation 25%, **[IMPACT]** Social impact potential 25%, **[FEAS]** Feasibility and sustainability 20%, **[SCALE]** Scalability 15%, **[PRES]** Presentation quality 15%. Every slide's top-right tag names the criterion it serves. Presentation quality is the whole talk: stay on time, demo live, land one line per slide.

## Recommended: demo-first, in plain English (7:15, then 2:00 of questions)

The audience is the Everytown team and the judges. Show the product early and speak the way the report reads: short sentences, no tech words (see "Say it plainly" below). Slides 4, 5, 7 and 8 are skipped because the demo shows them; they are the backup if the network fails. 45 seconds of slack are left for a slow report or a question.

| Time | Show | Say | Criterion |
|---|---|---|---|
| 0:00 to 0:40 | Slides 1 and 2 | "Community violence intervention groups are the people who stop shootings in their own neighborhoods. Everytown's Community Safety Fund works with more than 140 of them and helps them grow stronger. Last year 45 groups took Everytown's self-assessment, and two staff wrote every report by hand. We built a tool that writes those reports in under a minute, so every group gets one, and staff spend their time coaching." | Social impact |
| 0:40 to 0:55 | Slide 3, point at the first quote | "Your team told us: 'I can read this even though I'm at an 8th grade reading level.' That became our rule. Let me show you." | Social impact |
| 0:55 to 1:10 | Tab A: **Try a made-up sample organization**, click **Southside Youth Peace Collective (synthetic sample)** | "A group answers 143 yes-or-no statements. To save time, here is a made-up group with the answers filled in. Its stages show up right away. They come from Everytown's own scoring rules, not from AI. The written report takes about 40 seconds, so here is one we ran earlier." | Technical innovation |
| 1:10 to 1:45 | Tab B: **Summary about your organization**, point at its label **Written by AI from your answers**, click **Listen** for one sentence, stop | "It reads like a letter from a coach: strengths first, never a grade. Each part says where it came from: the group's own answers, or AI writing from those answers. We check every report reads at about an 8th grade level or plainer. Any part can be read out loud, and it all works in Spanish and on a phone." | Social impact |
| 1:45 to 2:20 | Tab B: **Your 12-week roadmap** card, then **Start here** below it: priority 1, point at **Based on your answers** and the resource link | "First, where this goes: a 12-week roadmap. Its first four weeks are these two priorities, side by side. Out of everything a group could work on, code picks one or two things to start with. Each one shows the exact answer it came from. If the AI writes anything that is not tied to the group's own answers, our code removes it before anyone sees it. Links only come from a list Everytown trusts." | Technical innovation |
| 2:20 to 2:40 | Tab B: **Chat about your report** (bottom right), click **What is the first step this week?**, let the answer appear, press Escape | "And a leader can just ask. The chat knows their whole report and roadmap, answers in plain words and shows which answers it used. If someone writes about danger, code answers with 988 and 911, never the AI." | Technical innovation |
| 2:40 to 3:00 | Tab B: **Open my roadmap**, point at the badges and the 12-week timeline, tick one step of week 1 | "Here is the whole 12 weeks at a glance, one week at a time, with a person in charge of each step, points and badges for following through. In week 12 they take the assessment again, so everyone can see what changed." | Social impact |
| 3:00 to 3:10 | Tab A: **Your report is ready**, click **Download PDF report** | "And that is the report we started two minutes ago, finished, with a PDF for their board, marked confidential." | Feasibility |
| 3:10 to 3:55 | Tab C (staff): **Training needs**, then **Ask the data**, click **Which organizations need fundraising training?**, then **Peers** | "This is Everytown's side. Which groups need which training, and who asked for help. Staff can ask a question in plain words: the AI only picks the right table, and every number comes from the data, not from the AI. And here are groups facing the same problems, so staff can connect them." | Social impact, scalability |
| 3:55 to 4:20 | Tab C: **Training needs**, open **Southside Youth Peace Collective (synthetic sample)**, click **View AI trace in CloudWatch (staff)** | "Every step the AI took is recorded in Amazon CloudWatch, so staff can check exactly what it read and what it wrote. Nothing is a black box." | Technical innovation |
| 4:20 to 5:05 | Slide 6 | "This is what makes it safe: code scores, AI writes, code checks every line. Six fixed steps, not an AI left to decide on its own. It runs on Amazon Bedrock with Claude. We tested it with 52 made-up cases, and they caught 3 real bugs before any group saw them." | Technical innovation |
| 5:05 to 5:55 | Slide 9 | "It works today: you just saw it. About 11 cents of AI per report. The whole network, twice a year, is under 50 dollars. Hosting is a few dollars a month, with no servers to look after. Yesterday we watched a first-time user try it with no help, and we fixed all 12 places she got stuck the same day. And Everytown owns it: it is free and open source, and one script sets it up in Everytown's own Amazon account." | Feasibility and sustainability |
| 5:55 to 6:35 | Slide 10 | "Going from 45 groups to all 140, or to a thousand, needs no rebuild. Amazon's limits already allow more than 100 reports a minute, and cost only grows with use. It also gets more useful as it grows: every new assessment sharpens the training picture and the peer matches." | Scalability |
| 6:35 to 7:15 | Slide 11 | "Our ask: try it with 3 to 4 grantees this quarter. CSF invites them, staff go through each report with the group, and Everytown's tech team sets it up in Everytown's own account. Thank you." Leave this slide up for questions. | Feasibility |

If the network fails, stay in the deck: slides 4 and 5 show the same screens, so say the same lines over them and open `sample-report.pdf`. If a report is slow, keep talking over Tab B; Tab A can finish later or be skipped. If the chat is slow, say "it is reading the whole report" and move on to the roadmap; the answer will be there when you come back.

### Say it plainly

| Instead of | Say |
|---|---|
| tokens, Bedrock cost | AI cost |
| model, LLM | the AI |
| grounded, validated | tied to the group's own answers |
| guardrail | safety filter |
| trace, observability | a step-by-step record of what the AI did |
| evals, test suite | tests |
| Knowledge Base, retrieval | a library of CVI field guides |
| synthetic data | made-up organizations |
| Lambda, serverless | Amazon runs the servers for us |
| deploy, CloudFormation | set it up |

Save the AWS service names for questions (appendix slides A1 to A5 and "Numbers to have ready" below).

## Slides-first run of show (7:45, then 2:00 of questions)

| Time | Slide | Point to land | Criterion |
|---|---|---|---|
| 0:00 to 0:20 | 1 Title | CVI organizations stop shootings in their neighborhoods; CSF helps them get stronger. The AI never scores. Synthetic data, mocked login, URL torn down after judging. | [IMPACT] |
| 0:20 to 1:00 | 2 The need | 45 pilot organizations, 2 staff writing every report by hand, 140+ in the network. Impact path: stronger organizations keep violence intervention running; every grantee gets a plan in minutes, training aims at real gaps, staff time goes to coaching. | [IMPACT] |
| 1:00 to 1:30 | 3 What Everytown told us | Four quotes from the CSF interview, four things we built. | [IMPACT] |
| 1:30 to 4:00 | 4 Live demo | Switch to the browser (below). Slides 4 and 5 are the backup if the network fails. | [PRES] all |
| 4:00 to 4:45 | 6 How it works | Code scores, AI writes, code checks. Six fixed steps, not an agent. | [INNOV] |
| 4:45 to 5:30 | 7 Traced and tested | Every report is a trace in Amazon CloudWatch; 52 synthetic test cases; the evals caught 3 real bugs. | [INNOV] |
| 5:30 to 5:55 | 8 Accessible | Impact only counts if the readers can use it: coach's letter, every part labelled as from your answers or written by AI, reading grade checked in code, Listen, Spanish, phone first, WCAG 2.2 AA. | [IMPACT] |
| 5:55 to 6:35 | 9 Feasibility and sustainability | Live today; $0.11 a report, under $50 a year of tokens, $1 to $3 a month hosting, 0 servers; Apache-2.0 CloudFormation Everytown owns; gates on every release; a first-time user test on Nov 4 led to 12 fixes shipped the same day. | [FEAS] |
| 6:35 to 7:10 | 10 Scalability | 100+ reports a minute within the Bedrock quotas; Lambda 1,000 concurrent (10 is a spend guard); cost grows linearly; better peer matches as it grows. | [SCALE] |
| 7:10 to 7:45 | 11 Our ask | Pilot with 3 to 4 CSF grantees this quarter. Leave this slide up for questions. | [FEAS] |

Slide 5 (staff screenshots) is skipped when the live demo covers the staff view. The appendix (A1 to A5) answers likely questions: responsible AI, security and privacy, eval results, cost, roadmap.

## Judging morning preflight (30 minutes before)

From a laptop with AWS access (the e2e agent needs AWS keys in the environment; on an instance role, first run `eval "$(aws configure export-credentials --format env)"`):

```
cd qa && export AWS_REGION=us-west-2 APP_URL=https://d2mi2h3eu8y69s.cloudfront.net
npx e2e run --exclude-tag demo --action-timeout 8000   # sign-in, smoke, regressions and the live 404 check (read-only)
npm run test:demo                                       # the exact on-stage path: Southside sample to a ready report, one chat question and the PDF, then staff Training needs, Ask the data, Peers and the CloudWatch trace link
```

Both must pass. `test:demo` makes one report (about 45 seconds) and asks its chat one question. If a step fails, its screenshot and trace are under `qa/.e2e/results/`. Do not redeploy on judging morning; a failed step is either the network (use the backup below) or something to report as a known issue.

## Before you go on stage (10 minutes)

1. Open https://d2mi2h3eu8y69s.cloudfront.net/api/healthz and confirm `ok`.
2. **Tab B (prepared report).** Sign in as `demo` / `demo`. Open **Try a made-up sample organization** and click **Riverbend Violence Interruption Network (synthetic sample)**. Wait for **Your report is ready**. Keep this tab at the top of the report. Do not sign out: the roadmap and the chat belong to this sign-in session. Do not practice the chat in this tab (each report allows 15 questions, and the conversation is kept).
3. **Tab A (live run).** In the same window, a new tab on the start page. Optional: choose **Español** in the language switch at the top right.
4. **Tab C (staff).** A private window, sign in as `staff` / `staff`, stay on **Training needs**.
5. **Tab D (AWS console).** In the private window, sign in to the AWS console in us-west-2 and open the CloudWatch dashboard `everytown-oci`, so the trace link opens without a sign-in.
6. Open `OCI-Capacity-Coach-pitch.pdf` and `sample-report.pdf` locally as the offline backup. Browser zoom 125%. Notifications off.
7. The hourly report cap allows a few reports: do not run practice reports in the last hour.

## The live demo (2:30)

| Time | Exact clicks | Say |
|---|---|---|
| 0:00 to 0:15 | Tab A: open **Try a made-up sample organization**, click **Southside Youth Peace Collective (synthetic sample)**. | "One click fills a made-up organization's answers. The stages appear instantly, from Everytown's own scoring code. The AI report takes about 40 seconds, so let me show you one we ran earlier." |
| 0:15 to 0:40 | Tab B: **Summary about your organization**, point at **Written by AI from your answers**. Click **Listen** for one sentence, then stop. | "It reads like a letter from a coach, strengths first. Each part is labelled: from your answers, or written by AI from them. Reading level is checked in code, and any section can be read aloud." |
| 0:40 to 1:10 | Tab B: **Start here** (below the roadmap card), priority 1: point at **Based on your answers** (FR7) and the resource link. | "One or two things first, chosen by code, and they are weeks 1 to 4 of the roadmap. Each shows the exact answer behind it. If the model cites anything else, the server drops it, and links come only from a vetted catalog." |
| 1:10 to 1:25 | Tab B: **Chat about your report** (bottom right), click **What is the first step this week?**, then Escape. | "Leaders can ask about their own report. The chat knows the report and roadmap and shows the answers it used; crisis questions get a fixed 988 / 911 answer from code." |
| 1:25 to 1:45 | Tab B: **Open my roadmap**, point at the badges and the 12-week timeline, tick one step of week 1. | "Then a 12-week roadmap at a glance, an owner for every step, points and badges for following through. Week 12 is retake the OCI." |
| 1:45 to 1:55 | Tab A: point at **Your report is ready**, click **Download PDF report**. | "That is the report we started a minute and a half ago, finished live, with a PDF letter for the board, watermarked and marked confidential." |
| 1:55 to 2:20 | Tab C: **Training needs** (top cards), then **Ask the data**, click **Which organizations need fundraising training?**, then **Peers**. | "Everytown's side: who needs which training, plain-language questions where the AI only picks an analysis and code computes every number, and similar grantees to connect." |
| 2:20 to 2:30 | Tab C: back to **Training needs**, scroll to the matrix, click **Southside Youth Peace Collective (synthetic sample)** to open its drawer, then **View AI trace in CloudWatch (staff)**. | "And every AI step is auditable in Amazon CloudWatch: this is the trace of the report we just ran, every prompt, token and check." Back to the deck, slide 6. |

If a new report is refused because of the hourly cap, say "that is the hourly report cap doing its job" and stay in Tab B. If a report shows **We could not finish your recommendations**, say "the scores are saved, it only reruns the AI steps", click **Try again** and continue in Tab B.

## Numbers to have ready for questions

- 45 organizations in the manual 2025 pilot; 2 CSF staff wrote every report; 140+ organizations in the network. CSF has granted $15.7 million to 141 CVI programs in 72 cities since 2019.
- 8 areas, 143 statements; the reference scoring engine passes all 3 answer keys (`verify_benchmark.py`).
- About 40 seconds and about $0.11 of Bedrock per report (token counts on the trace). 15 chat questions per report (the limit is in code; the page does not count them down).
- Hosting: about $45 a month with Aurora kept warm at 0.5 ACU (as for judging), $1 to $3 a month with auto-pause; CloudWatch observability a few dollars a month, no server.
- Evals: 16 report cases, 21 coach questions, 15 staff questions, 20 judge calibration cases; all gates pass (v1.10 run, Nov 4, about $3.50). Report judges: personalization 0.88, actionability 0.86, plain language 0.75, faithfulness 0.70; coach helpfulness 0.69; every unsafe staff question rejected.
- Bugs the evals caught: the guardrail blocked a normal Spanish report (it judged our own facts as a prompt attack); "change my score" returned an error; tracing was silently off after a deploy (a missing library).
- Caught by the on-stage test the night before judging: a chat question clicked while the earlier conversation was still loading showed "We could not answer right now" although the answer was saved. Fixed and live in v1.10.1, with a regression test.
- Protection on this temporary deployment: mocked login; CloudFront with IAM-signed origin access to the Lambda; 10 concurrent requests; an hourly cap on new reports; traces and model logs only in CloudWatch, behind AWS sign-in.
- axe-core: no WCAG 2.2 A or AA violations on any page, at 320, 390 and 1280 px.
- Phone first: every end-to-end test runs on a desktop and on a phone-sized screen (390 px, iPhone).
- User test (Nov 4): a first-time user went through the site with no guidance; the team logged 12 places she got stuck (GitHub issues #28 to #39). All 12 were fixed, tested and live the same day in v1.10.0: pick how to answer from a sample, clearer filled-in answers, Previous and Next on every card, a report labelled by source (your answers or AI), the roadmap before the priorities, a chat, a 12-week timeline with badge pop-ups, and watermarked, confidential PDFs.
- Scale: Bedrock quotas in this account are 6M tokens a minute for Claude Sonnet and 10M for Haiku. A report uses about 31,000 Sonnet tokens (cached prompt included) plus Haiku research, so even with output tokens counted 5× the quotas allow more than 100 reports a minute. Lambda allows 1,000 concurrent runs (the demo reserves 10 as a spend guard; this shared workshop account cannot reserve more); Aurora Serverless v2 scales to a 16 ACU ceiling set at deploy.
- Sustainability: Apache-2.0 open source; three CloudFormation stacks and `scripts/deploy.sh`; no servers; evals, 35 end-to-end test files (each run on desktop and phone) and axe-core before every release.
- "How does your staff check the AI's quality?" (the CSF director's question): open Tab C, **Quality and follow-through** (`/staff/#quality`). Organizations answer "Does this feel right?" at the end of each report; staff see a review queue, flag a report with a reason such as "Too big for their size", and see which mistakes repeat. The same tab shows who is following their roadmap, who stalled (with a check-in note to send), who opted in to trainings, and where people stop the assessment.
- "Why not QuickSight?": the staff dashboard is built in and costs nothing extra; QuickSight would add per-user cost, a second sign-in and a network path into the database. See `docs/quicksight-assessment.md`.
