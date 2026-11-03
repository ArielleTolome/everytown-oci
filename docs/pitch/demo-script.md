# OCI Capacity Coach: 3-minute live demo script

Live app: https://d2mi2h3eu8y69s.cloudfront.net. Sign in as `demo` / `demo` (organization) or `staff` / `staff` (Everytown staff).
Deck: `docs/pitch/index.html` (arrows or space to move, `N` for speaker notes). Slide 5 is the demo hand-off; after the demo, continue at slide 6.
Judging criteria tags: **[TECH]** Technical Capability, **[UI]** User Interface and Design, **[IMPACT]** Impact and Scalability, **[ORIG]** Originality and Uniqueness.

## Before you go on stage (10 minutes)

1. Open https://d2mi2h3eu8y69s.cloudfront.net/api/healthz and confirm it says `ok`. The first request after a quiet period can take a few seconds if the database is on auto-pause, so do this early.
2. **Tab B (re-assessment with progress), prepare first:**
   1. Sign in with `demo` / `demo`. On "Tell us about your organization" keep **English** and the four pre-selected areas, open **Try a synthetic sample organization** and click **Riverbend Violence Interruption Network (synthetic sample)**. Wait for **Your report is ready** (about 45 s). This is the baseline.
   2. Go back to the start page. Type exactly `Riverbend Violence Interruption Network (synthetic sample)` in **Organization name** (the name is how the app finds the previous assessment), leave **Website** empty, keep English and the same four areas, click **Start questionnaire**.
   3. Answer **Yes** to every statement except these, which are **No** (this is sample B with FR7, FR15 and ML6 improved to Yes). Click **Next area** after each area:
      - Planning: 1, 10, 11, 13, 14, 15
      - Fundraising: 8, 10, 11, 12, 16, 17, 18, 19, 20
      - Financial Management: 9, 10, 11, 17, 18, 19, 20
      - Monitoring, Learning & Evaluation: 10 to 17
   4. Click **Submit assessment** and wait for **Your report is ready**. Check that **Progress since your last assessment** shows 3 growth priorities closed, 0 new, and Monitoring, Learning & Evaluation moved from Emerging to Developing. Keep this tab open, scrolled to the top.
   5. Do not click the Riverbend sample again after this: the next Riverbend run would compare against this one.
3. **Tab C (staff dashboard):** open a private or incognito window (sign-in is per browser profile, so it must not share cookies with Tabs A and B). Sign in with `staff` / `staff`. You land on **Network capacity dashboard**; leave it at the top with **Show capacity area** set to **All areas**.
4. **Tab A (live run):** a fresh tab on the start page in the `demo` window. Open **Display** and make sure Larger text and High contrast are both off.
5. Open `docs/pitch/sample-report.pdf` in a local PDF viewer (backup, works offline).
6. Browser zoom 125% so the back row can read the screen. Turn notifications off.

## The run (3:00)

| Time | Exact clicks | Say | Criterion |
|---|---|---|---|
| 0:00 to 0:15 | Tab A. Point at the four pre-selected areas. Optional: choose **Español** under **Report language**. Open **Try a synthetic sample organization** and click **Southside Youth Peace Collective (synthetic sample)**. | "A leader answers one area per screen, plain Yes or No. For the demo, and for staff training, we use a fictional organization from Everytown's builder package, so no real data is needed." | [UI] [ORIG] |
| 0:15 to 0:40 | Results page loads. Point at the **Building your recommendations** checklist, then scroll to **Where you are today**. | "The stages are already here: deterministic Python, the unchanged reference engine, verified against all three answer keys. The AI never scores. Now a hardcoded pipeline runs: Claude Haiku profiles the organization, a Bedrock Knowledge Base on S3 Vectors pulls the matching CVI field guides, and Claude Sonnet writes the report through a strict JSON schema. About 40 seconds end to end." | [TECH] |
| 0:40 to 1:00 | Switch to Tab B. Point at **Progress since your last assessment**: 3 growth priorities closed, 0 new, Monitoring, Learning & Evaluation from Emerging to Developing. | "This is the same organization re-assessing later. The comparison is deterministic: three growth priorities closed and one area moved up a stage. The summary opens by celebrating that, so teams come back." | [IMPACT] [ORIG] |
| 1:00 to 1:40 | Still Tab B. Scroll to **What's true about you**, then **Start here: your top priorities**. On priority 1, click **Show statements** under "Based on your answers to" and point at the **Resource** link. Scroll briefly past **30 / 60 / 90 day action plan** (point at one **Owner** line). | "Everytown told us their leaders need something they can read at an 8th grade reading level, and one or two things to do first, not ten. So the report says what is true about you in plain words, then at most two priorities, each tied to the exact answers behind it. The server drops anything that does not cite a real growth priority, and links come only from a vetted catalog. Then a 30 / 60 / 90 day plan with an owner for every action." | [ORIG] [TECH] [UI] |
| 1:40 to 2:00 | Click **Listen** on **What's true about you** (one sentence, then **Stop**). Open **Display**, switch on **Larger text** and **High contrast**, then both off. | "Listen reads any section aloud. Larger text and high contrast are one click. Everytown's colors, Atkinson Hyperlegible, and axe-core finds no WCAG 2.2 A or AA violations on any page." | [UI] |
| 2:00 to 2:15 | Switch to Tab A: point at **Your report is ready** (if you chose Español, point at the Spanish text). Click **Download PDF report**. | "That is the report we started two minutes ago, finished live. Same report as a PDF to share with the board." | [TECH] [UI] |
| 2:15 to 2:40 | Switch to Tab C (staff). Point at the totals, then the **Stage distribution by capacity area** bars. Scroll to **Most common growth priorities across the network** (top row), then **Grantees to connect** (first card). | "Now Everytown's side. Staff see where every grantee is, the most common growth priorities, which tells them what training and services to offer, and groups of grantees with the same high priority problem to connect. Benchmarking is a staff-only preview; grantees never see peer comparisons. All of these organizations are synthetic." | [IMPACT] [ORIG] |
| 2:40 to 3:00 | Switch back to the deck, press the right arrow to slide 6. | "Each report costs five to ten cents of Bedrock tokens. Hosting is one to three dollars a month with the database on auto-pause, and the whole stack is CloudFormation that Everytown Labs can fork." | [IMPACT] |

If Southside was run before, Tab A also shows **Progress since your last assessment** ("Your answers match your assessment on ..."). That is expected; skip past it. Do not use the Riverbend sample live (see step 2.5).

If a step shows **We could not finish your recommendations**, say "the scores are saved, it only reruns the AI steps" and click **Try again**, then continue in Tab B.

## 30-second backup (network down)

Open `docs/pitch/sample-report.pdf` (29 pages, Southside Youth Peace Collective synthetic sample, English).

| Time | Show | Say |
|---|---|---|
| 0:00 to 0:08 | Page 2 **What's true about you**, then page 4 **Domain results**. | "This is a real report the live system produced, in plain words. Scores and stages come from deterministic Python, never the AI." |
| 0:08 to 0:18 | Pages 2 to 3 **Start here**: point at the two priorities, the **Based on** lines and the resource. | "Two things to do first, each tied to the exact answers behind it and a vetted resource. The 30 / 60 / 90 day plan follows on page 6." |
| 0:18 to 0:30 | Back to the deck, slide 7 (staff dashboard screenshots). | "And Everytown staff see the whole network: stage distribution, the most common needs, and which grantees to connect. The live app does a report in under a minute for five to ten cents." |

## Numbers to have ready for questions

- 45 organizations in the manual 2025 pilot; 2 CSF staff wrote every report by hand; 140+ organizations in the network.
- 143 statements across 8 domains; reference scoring engine passes all 3 benchmark answer keys.
- 38 to 47 seconds end to end; about $0.05 to $0.10 of Bedrock tokens per report.
- Hosting: about $45 a month with Aurora PostgreSQL Serverless v2 kept warm at 0.5 ACU (as for this demo); about $1 to $3 a month with auto-pause (`DB_MIN_CAPACITY=0 scripts/deploy.sh`).
- Staff dashboard data: 20 seeded synthetic organizations plus demo runs; benchmarking is a staff-only preview from the `domain_benchmarks` SQL view.
- axe-core: no WCAG 2.2 A or AA violations on any page, including the staff dashboard.
- On the roadmap: Everytown review of the field guides, real authentication, more languages; later, peer benchmarking beyond the preview and matching new grantees with peers.
