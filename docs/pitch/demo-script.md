# OCI Capacity Coach: 10-minute presentation and live demo

Deck: [`OCI-Capacity-Coach-pitch.pdf`](OCI-Capacity-Coach-pitch.pdf) (6 slides), or present [`index.html`](index.html) in a browser: arrows or space to move, `N` for speaker notes. Rebuild the PDF after editing the deck: `python3 scripts/build_pitch_pdf.py`.

Live app: https://d2mi2h3eu8y69s.cloudfront.net. Sign in as `showcase` / `showcase` (a group's leader, with the start page already filled in for presenting), `demo` / `demo` (a group's leader, empty start page) or `staff` / `staff` (Everytown staff).

## What the judges asked for, and where it is

The presentation must not go over **10 minutes, including 2 to 3 minutes of judges' questions**. So we talk for 7 minutes and leave 3 for questions.

| Required | Who | When | Slides |
|---|---|---|---|
| Team introduction | Johanna | 0:00 to 0:40 | 1 |
| Solution overview + architecture | Bo | 0:40 to 2:40 | 2 (before and now), 3 (new features and what each gives), 4 (how it works) |
| Live demo | Ariel | 2:40 to 5:10 | 5, then the browser |
| Proposed industry impact | Atman | 5:10 to 6:20 | 6 |
| Our ask, thank you | Atman | 6:20 to 7:00 | 6 |
| Judges' questions (2 to 3 minutes) | Everyone | 7:00 to 10:00 | 6 stays up |

The speaker split is a suggestion: swap names freely, but keep the order and the times.

## How to talk

The room is nonprofit people, not engineers. Talk the way you would explain it to a neighbor:

- Short sentences. One idea at a time.
- Say "the AI", "a plan", "the website", "the groups". Never say "LLM", "model", "pipeline", "deploy", "serverless", "tokens", "schema".
- Lead with people: the groups who stop shootings, and the two Everytown staff who wrote every report by hand.
- Every made-up group on screen is made up. Say so once, then move on.

| Instead of | Say |
|---|---|
| LLM, model, Claude Sonnet | the AI |
| grounded, validated | tied to the group's own answers |
| guardrail | safety filter |
| trace, observability | a step-by-step record of what the AI did |
| evals, test suite | practice cases, tests |
| Knowledge Base, retrieval | a library of field guides |
| synthetic data | made-up groups |
| Lambda, serverless | Amazon runs the computers for us |
| deploy, CloudFormation | set it up |
| scale | grow |

## The talk, word for word (7:00)

### Team introduction (Johanna, 0:00 to 0:40)

| Time | Slide | Say |
|---|---|---|
| 0:00 to 0:15 | 1 Title and team | "Good morning. We built the OCI Capacity Coach for Everytown's Community Safety Fund. It helps the groups who stop shootings in their neighborhoods grow stronger, with a plan they can start on Monday." |
| 0:15 to 0:40 | 1 Title and team | Each person says one sentence: their name and what they worked on. Then Johanna: "We spent three days with Everytown's team. We listened, we built, then we watched a first-time user try it and fixed everywhere she got stuck. Bo will show you what we built." |

### Solution overview + architecture (Bo, 0:40 to 2:40)

| Time | Slide | Say |
|---|---|---|
| 0:40 to 1:20 | 2 Before and now | "Community violence intervention groups are neighbors who step in before violence happens, usually five to twenty people. Here is where Everytown started. Two staff wrote every report by hand, for 45 groups, and more than 140 groups are in the network. The tool showed scores only, and a sample report listed 57 things to improve, all at once. Everytown's questions and scoring were good, so we kept them exactly as they are. What changed is everything around them." |
| 1:20 to 2:05 | 3 New features | "Here is what we added. For a group's leader: they pick how to answer, in English or Spanish, on a phone, and can share an area with a teammate. In about a minute they get a plan, with just the two things to start with, read aloud if they like, and a chat to ask questions. Then twelve weeks of small steps with badges, and a direct line to ask Everytown for help. For Everytown's staff: a live view of who needs which training, a first draft of each training, plain questions answered from the data, peer matches, and one place to check quality and follow up." |
| 2:05 to 2:40 | 4 How it works | "Behind the scenes, one simple rule: rules score, AI writes, rules check. Everytown's scoring rules decide where a group stands; no AI touches the score. The AI writes the plan from nine trusted field guides. Then our rules check every line, and anything not tied to the group's own answers is removed before anyone sees it. Amazon runs it all, so there is nothing for Everytown to look after. Ariel will show you." |

### Live demo (Ariel, 2:40 to 5:10)

Follow "The live demo, click by click" below. On slide 5 say: "Let me show you, with a made-up group."

### Proposed industry impact (Atman, 5:10 to 6:20)

| Time | Slide | Say |
|---|---|---|
| 5:10 to 6:20 | 6 What changes | "What does this change? For local groups: a plan in about a minute, instead of waiting for staff to write one by hand. Written for them: plain words, read aloud, in Spanish, on the phone they already carry, with steps a team of five can really do. For Everytown: the two people who wrote reports by hand get that time back for coaching. Training is planned around what the network really needs. And the retake in week 12 shows whether their support helped. And for the nonprofit field: it is free and open, so any funder that supports small nonprofits can use it. It costs about 11 cents per report, under 50 dollars a year for all 140 groups, and it can grow from 45 groups to the whole network without being rebuilt." |

### Our ask (Atman, 6:20 to 7:00)

| Time | Slide | Say |
|---|---|---|
| 6:20 to 7:00 | 6 Our ask | "Our ask is simple: try it with three or four grantees this quarter. Everytown invites them, staff go through each plan with the group and tell us what helped, and Everytown's tech team sets it up in Everytown's own account. Thank you to the Community Safety Fund team for three days of honest answers. We would love your questions." Leave slide 6 up. |

### Judges' questions (everyone, 7:00 to 10:00)

Answer in two or three sentences, then stop. Go back to a slide only if it helps. Likely questions:

| Question | Short answer | Slide |
|---|---|---|
| Can the AI make things up? | "It can try, but it cannot get through. The AI never scores anyone and never picks the priorities: Everytown's rules do. Every line it writes must point to the group's own answers, or our rules remove it before anyone sees it." | 4 |
| What if someone writes about danger or a crisis? | "That never goes to the AI. Our rules answer straight away with 988 and 911." | 4 |
| Can people with low literacy or on a phone use it? | "That was Everytown's first request. Every plan is checked to read at about an 8th grade level or plainer, any part can be read aloud, it works in Spanish, and every screen is tested on a phone." | 3 |
| What does it cost, and who keeps it running? | "About 11 cents of AI per report, under 50 dollars a year for the whole network, and a few dollars a month to host. Amazon runs the computers, so there is nothing to patch, and it is Everytown's to keep." | 6 |
| What about privacy? | "Today every group is made up. People's names are never sent to the AI, no group sees another group's answers, and every PDF is watermarked and marked confidential. Real sign-in is the first step of the pilot." | none |
| What if all 140 groups use it at once? | "Amazon already allows more than 100 reports a minute for us. Growing is a setting, not a rebuild." | 6 |
| How do you know it works? | "We tested it on 52 practice cases before every release, and they caught three real problems before any group saw them. And yesterday a first-time user tried it with no help; we fixed all 12 places she got stuck the same day." | none |
| What can leaders and staff actually do in it? | "For leaders: answer on a phone, get a plan in a minute, listen, chat, follow 12 weeks of steps and ask Everytown for help. For staff: see training needs, ask the data, match peers and follow up. The full list is in docs/features-and-benefits.md." | 3 |
| Could another organization use it? | "Yes. It is free and open source. The questions and scoring are Everytown's, but the same approach works for any funder that supports small nonprofits." | 6 |
| (For a technical judge) Which AWS services? | Point at slide 4: CloudFront and S3 for the website, Lambda, Claude on Amazon Bedrock with Knowledge Bases and Guardrails, Aurora, Polly, CloudWatch, CloudFormation. | 4 |

## The live demo, click by click (2:30)

| Time | Clicks | Say |
|---|---|---|
| 2:40 to 2:50 | Slide 5 | "Let me show you, with a made-up group." Switch to the browser. |
| 2:50 to 3:05 | Tab A: **Try a made-up sample organization**, click **Southside Youth Peace Collective (synthetic sample)** | "One click fills in a made-up group's answers. Where they stand shows up right away, from Everytown's own scoring rules. The plan takes about a minute to write, so while it writes, here is one we made earlier." |
| 3:05 to 3:35 | Tab B: **Summary about your organization**, point at the label **Written by AI from your answers**, click **Listen** for one sentence, then stop | "It reads like a letter from a coach: strengths first, never a grade. Every part tells you where it came from: your answers, or written by AI from your answers. And any part can be read out loud." |
| 3:35 to 4:05 | Tab B: scroll to **Your 12-week roadmap**, then **Start here**: point at priority 1, **Based on your answers** and the resource link | "Out of everything this group could work on, here are the two things to start with. Each one shows the exact answer it came from, and links come only from guides Everytown trusts. These two are the first four weeks of their roadmap." |
| 4:05 to 4:20 | Tab B: **Chat about your report** (bottom right), click **What is the first step this week?**, let the answer appear, press Escape | "And a leader can just ask. The chat knows their whole plan and answers in plain words." |
| 4:20 to 4:35 | Tab B: **Open my roadmap**, point at the badges and the 12-week timeline, tick one step of week 1 | "Here are all 12 weeks at a glance, one week at a time, with a person in charge of each step and badges for every week done." |
| 4:35 to 4:45 | Tab A: point at **Your report is ready**, click **Download PDF report** | "And the plan we started two minutes ago is ready, with a PDF for their board, marked confidential." |
| 4:45 to 5:10 | Tab C (staff): **Training needs**, then **Ask the data**, click **Which organizations need fundraising training?**, then **Peers** | "This is Everytown's side: which groups need which training, and who asked for help. Staff can ask a question in plain words, and every number comes straight from the data. And here are groups facing the same challenges, so staff can connect them. Atman will tell you what this changes." |

If there is time left, Tab C: open **Southside Youth Peace Collective (synthetic sample)** in Training needs and click **View AI trace in CloudWatch (staff)**: "and every step the AI took is recorded, so staff can check it."

If something goes wrong:
- **The internet fails:** stay on slide 5 (its screenshot shows a group's two priorities), say the same lines, and open `sample-report.pdf`.
- **A new report is refused** (the hourly limit): "that is the spending limit doing its job." Stay in Tab B.
- **The plan says "We could not finish your recommendations":** "the scores are saved; it only redoes the writing." Click **Try again** and carry on in Tab B.
- **The chat is slow:** "it is reading the whole plan." Move on to the roadmap; the answer will be there when you come back.

## Before judging

### 30 minutes before: check the live site

From a laptop with AWS access (on an instance role, first run `eval "$(aws configure export-credentials --format env)"`):

```
cd qa && export AWS_REGION=us-west-2 APP_URL=https://d2mi2h3eu8y69s.cloudfront.net
npx e2e run --exclude-tag demo --action-timeout 8000   # sign-in, smoke, regressions and the live 404 check (read-only)
npm run test:demo                                       # the exact on-stage path: Southside sample to a ready report, one chat question and the PDF, then staff Training needs, Ask the data, Peers and the CloudWatch trace link
```

Both must pass. `test:demo` makes one report (about 45 seconds) and asks its chat one question. If a step fails, its screenshot and record are under `qa/.e2e/results/`. Do not change the live site on judging morning.

### 10 minutes before: open the tabs

1. Open https://d2mi2h3eu8y69s.cloudfront.net/api/healthz and confirm `ok`.
2. **Tab B (prepared plan).** Sign in as `showcase` / `showcase`. Open **Try a made-up sample organization** and click **Riverbend Violence Interruption Network (synthetic sample)**. Wait for **Your report is ready**. Keep this tab at the top of the report. Do not sign out: the roadmap and the chat belong to this sign-in. Do not practice the chat in this tab (each report allows 15 questions, and the conversation is kept).
3. **Tab A (live run).** In the same window, a new tab on the start page: it is already filled in for a made-up group (Southside Youth Peace Collective, Jordan Rivera, founder and executive director, the four main areas). If asked to show the questions, press **Start questionnaire**: it goes straight to "How would you like to answer?", and **Demo: fill this area with sample answers** fills an area in one click.
4. **Tab C (staff).** A private window, sign in as `staff` / `staff`, stay on **Training needs**.
5. **Tab D (AWS console, optional).** In the private window, sign in to the AWS console in us-west-2 and open the CloudWatch dashboard `everytown-oci`, so the record link opens without a sign-in.
6. Open `OCI-Capacity-Coach-pitch.pdf` and `sample-report.pdf` on the laptop as the offline backup. Browser zoom 125%. Notifications off. Phones silent.
7. The site limits new reports per hour: do not run practice reports in the last hour.

### Rehearse once with a timer

Run the whole talk once, out loud, with a phone timer. If it runs over 7 minutes, cut words, not slides: the demo's staff part can drop **Peers**, and Bo can shorten slide 2 to its first and last rows.

## Numbers to have ready

- **The need:** 45 groups took the check-up in 2025; 2 Everytown staff wrote every report by hand; 140+ groups in the network. Since 2019 the Community Safety Fund has granted $15.7 million to 141 violence intervention programs in 72 cities.
- **The check-up:** 8 areas, 143 yes-or-no statements, Everytown's own scoring, unchanged and checked against all 3 of Everytown's answer keys.
- **Speed and cost:** about 1 minute and about 11 cents of AI per plan; under $50 a year of AI for 140 groups twice a year; $1 to $3 a month to host when the database sleeps (about $45 a month kept always on, as for judging).
- **Testing:** 52 practice cases for the AI (16 plans, 21 chat questions, 15 staff questions), every safety check passed in the Nov 4 run; they caught 3 real problems before any group saw them. 35 screen-by-screen tests, each run on a computer and a phone. An accessibility check finds 0 problems on every page.
- **Every feature and its benefit:** [`docs/features-and-benefits.md`](../features-and-benefits.md) lists each feature for leaders, staff and Everytown, checked on the live site on Nov 5.
- **Before and now (from Everytown's OCI package):** the 2025 pilot covered 45 groups, with 2 staff writing each report by hand; the prototype was scoring code with a basic screen and scores only (vision and technical documents); its sample report for Riverbend runs about 5,500 words and lists 57 areas to improve, 19 marked high priority; the network analysis was done by hand once (handoff slides, July 2025). The 143 statements and the scoring are unchanged in what we built.
- **The user test (Nov 4):** a first-time user tried it with no help; 12 places she got stuck; all 12 fixed and live the same day. The on-stage test then caught one more (the chat could show an error while still loading), also fixed.
- **Growth:** Amazon allows this account more than 100 plans a minute; the demo is capped at 10 at once to control cost.
- **Safety:** the AI never scores and never picks priorities; links come only from 19 trusted guides; crisis questions get 988 and 911 from our rules, never the AI; people's names are never sent to the AI.
- **Staff quality check** (the Community Safety Fund director's question): Tab C, **Quality and follow-through**. Groups answer "Does this feel right?" at the end of each plan; staff see a review queue and which mistakes repeat, who is following their roadmap, and where people stop.
- **Why not a separate dashboard product:** the staff view is built in and costs nothing extra (see `docs/quicksight-assessment.md`).
