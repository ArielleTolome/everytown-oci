# OCI Capacity Coach: 3-minute live demo script

Live app: https://d2mi2h3eu8y69s.cloudfront.net. Sign in as `demo` / `demo` (organization) or `staff` / `staff` (Everytown staff).

**Say up front (it is in the first 10 seconds of the run):** the login is mocked; this public URL is temporary and will be torn down after judging; the API sits behind CloudFront with IAM-signed origin access, a cap of 5 concurrent requests and an hourly cap on reports. All organizations shown are synthetic.

**The guarantee to lead with:** every action traces to a statement the organization answered, and every link comes from a vetted catalog. The model's output is validated against the scoring engine's results, and anything ungrounded is dropped.

Deck: `docs/pitch/index.html` (arrows or space to move, `N` for speaker notes). Slide 5 is the demo hand-off; after the demo, continue at slide 6.
Judging criteria tags: **[TECH]** Technical Capability, **[UI]** User Interface and Design, **[IMPACT]** Impact and Scalability, **[ORIG]** Originality and Uniqueness.

## Before you go on stage (10 minutes)

1. Open https://d2mi2h3eu8y69s.cloudfront.net/api/healthz and confirm it says `ok`. The first request after a quiet period can take a few seconds if the database is on auto-pause, so do this early.
2. **Tab B (re-assessment with progress), prepare first.** Re-assessment history is scoped to the browser sign-in session (a demo shortcut until real authentication), so the baseline and the re-assessment must run in the **same browser window, in one sign-in session**. Do not sign out, do not sign in as `staff` in this window, and do not clear cookies between steps 1 and 4. Use the same window for the live run on stage.
   1. Sign in with `demo` / `demo`. On "Tell us about your organization" keep **English** and the four pre-selected areas, open **Try a synthetic sample organization** and click **Riverbend Violence Interruption Network (synthetic sample)**. Wait for **Your report is ready** (about 45 s). This is the baseline.
   2. In the same tab, go back to the start page. Type exactly `Riverbend Violence Interruption Network (synthetic sample)` in **Organization name** (the name plus your sign-in session is how the app finds the previous assessment), leave **Website** empty, keep English and the same four areas, click **Start questionnaire**.
   3. Answer **Yes** to every statement except these, which are **No** (this is sample B with FR7, FR15 and ML6 improved to Yes). Click **Next area** after each area:
      - Planning: 1, 10, 11, 13, 14, 15
      - Fundraising: 8, 10, 11, 12, 16, 17, 18, 19, 20
      - Financial Management: 9, 10, 11, 17, 18, 19, 20
      - Monitoring, Learning & Evaluation: 10 to 17
   4. Click **Submit assessment** and wait for **Your report is ready**. Check that **Progress since your last assessment** shows 3 growth priorities closed, 0 new, and Monitoring, Learning & Evaluation moved from Emerging to Developing. If the Progress section is missing, the session changed between steps 1 and 4: sign in again and redo steps 1 to 4 without signing out. Keep this tab open, scrolled to the top.
   5. Do not click the Riverbend sample again in this session: the next Riverbend run would compare against this one.
   6. Budget for the hourly report cap: this prep uses 2 reports and the live run 1. Do not do extra practice runs in the last hour before the pitch.
3. **Tab C (staff dashboard):** open a private or incognito window (sign-in is per browser profile, so it must not share cookies with Tabs A and B). Sign in with `staff` / `staff`. You land on **Network capacity dashboard**; leave it at the top with **Show capacity area** set to **All areas**.
4. **Tab A (live run):** a fresh tab on the start page in the `demo` window. Open **Display** and make sure Larger text and High contrast are both off.
5. Open `docs/pitch/sample-report.pdf` in a local PDF viewer (backup, works offline).
6. Browser zoom 125% so the back row can read the screen. Turn notifications off.

## The run (3:00)

| Time | Exact clicks | Say | Criterion |
|---|---|---|---|
| 0:00 to 0:10 | Tab A on the start page. Hands off the mouse. | "Three facts up front. The login is mocked, and this URL is temporary: we tear it down after judging. The API sits behind CloudFront with IAM-signed origin access, capped at 5 concurrent requests and an hourly number of reports." | [TECH] |
| 0:10 to 0:30 | Optional: choose **Español** under **Report language**. Open **Try a synthetic sample organization** and click **Southside Youth Peace Collective (synthetic sample)**. | "Our guarantee: every action in this report traces to a statement the organization answered, and every link comes from a vetted catalog. The model's output is checked against the scoring engine's results, and anything ungrounded is dropped. This is a fictional organization from Everytown's builder package, one click, no real data." If you chose Español, add: "The questions are in English today; the report comes back in Spanish." | [TECH] [ORIG] |
| 0:30 to 0:50 | Results page loads. Point at the **Building your recommendations** checklist, then scroll to **Where you are today**. | "The stages are already here: deterministic Python, the unchanged reference engine, verified against all three answer keys. The AI never scores. Now a hardcoded pipeline writes the narrative with Claude on Bedrock and a Knowledge Base of CVI field guides. About 40 seconds." | [TECH] |
| 0:50 to 1:10 | Switch to Tab B. Point at **Progress since your last assessment**: 3 growth priorities closed, 0 new, Monitoring, Learning & Evaluation from Emerging to Developing. | "This is how it scales beyond one report. The same organization assessed again: three growth priorities closed, one area moved up a stage, computed deterministically, and the summary opens by celebrating it. Today that history is tied to the sign-in session; with real authentication it follows the organization's account." | [IMPACT] [ORIG] |
| 1:10 to 1:45 | Still Tab B. Scroll to **What's true about you**, then **Start here: your top priorities**. On priority 1, click **Show statements** under "Based on your answers to" and point at the **Resource** link. Scroll briefly past **30 / 60 / 90 day action plan** (point at one **Owner** line). | "Here is the guarantee on screen. Each priority shows the exact statements this organization answered. If the model cites anything else, the server drops it, and this link can only come from our vetted catalog. Everytown asked for an 8th grade reading level and one or two things to do first, not ten. Then a 30 / 60 / 90 day plan with an owner for every action." | [TECH] [ORIG] [UI] |
| 1:45 to 2:00 | Click **Listen** on **What's true about you** (one sentence, then **Stop**). Open **Display**, switch on **Larger text** and **High contrast**, then both off. | "Listen reads any section aloud. Larger text and high contrast are one click. axe-core finds no WCAG 2.2 A or AA violations on any page." | [UI] |
| 2:00 to 2:15 | Switch to Tab A: point at **Your report is ready** (if you chose Español, point at the Spanish text). Click **Download PDF report**. | "That is the report we started a minute and a half ago, finished live, as a PDF for the board." If Spanish: "Same English questionnaire, report written in Spanish and tagged so screen readers switch voice." | [TECH] [UI] |
| 2:15 to 2:40 | Switch to Tab C (staff). Point at the totals, then the **Stage distribution by capacity area** bars. Scroll to **Most common growth priorities across the network** (top row), then **Grantees to connect** (first card). | "Now Everytown's side. Staff see where every grantee is, the most common growth priorities, which tells them what training and services to offer, and groups of grantees with the same high priority problem to connect. Benchmarking is a staff-only preview; grantees never see peer comparisons." | [IMPACT] [ORIG] |
| 2:40 to 3:00 | Switch back to the deck, press the right arrow to slide 6. | "Five to ten cents of Bedrock tokens per report, bounded by the caps. One to three dollars a month of hosting with the database on auto-pause, and CloudFormation that Everytown Labs can fork into its own account." | [IMPACT] |

If Southside was run before in this sign-in session, Tab A also shows **Progress since your last assessment** ("Your answers match your assessment on ..."). That is expected; skip past it. Do not use the Riverbend sample live (see step 2.5).

If a new report is refused because of the hourly cap, do not retry live: stay in Tab B, which is already complete, and say "that is the hourly report cap doing its job".

If a step shows **We could not finish your recommendations**, say "the scores are saved, it only reruns the AI steps" and click **Try again**, then continue in Tab B.

## 30-second backup (network down)

Open `docs/pitch/sample-report.pdf` (29 pages, Southside Youth Peace Collective synthetic sample, English).

| Time | Show | Say |
|---|---|---|
| 0:00 to 0:08 | Page 2 **What's true about you**, then page 4 **Domain results**. | "A real report the live system produced. Scores and stages come from deterministic Python, never the AI. Every action traces to a statement the organization answered; anything ungrounded was dropped." |
| 0:08 to 0:18 | Pages 2 to 3 **Start here**: point at the two priorities, the **Based on** lines and the resource. | "Two things to do first, each with the exact answers behind it and a link from our vetted catalog. The 30 / 60 / 90 day plan follows on page 6." |
| 0:18 to 0:30 | Back to the deck, slide 7 (staff dashboard screenshots). | "And Everytown staff see the whole network: stage distribution, the most common needs, and which grantees to connect. The live app does a report in under a minute for five to ten cents." |

## Numbers to have ready for questions

- 45 organizations in the manual 2025 pilot; 2 CSF staff wrote every report by hand; 140+ organizations in the network.
- 143 statements across 8 domains; reference scoring engine passes all 3 benchmark answer keys.
- 38 to 47 seconds end to end; about $0.05 to $0.10 of Bedrock tokens per report.
- Hosting: about $45 a month with Aurora PostgreSQL Serverless v2 kept warm at 0.5 ACU (as for this demo); about $1 to $3 a month with auto-pause (`DB_MIN_CAPACITY=0 scripts/deploy.sh`).
- Protection on this temporary deployment: mocked login; CloudFront in front of the API with IAM-signed origin access to the Lambda; 5 concurrent requests maximum; an hourly cap on new reports, which bounds Bedrock spend. The URL is torn down after judging.
- Grounding: the model never scores; its output is validated against the engine's results; actions must cite growth priorities from this submission; links only from the vetted 19-entry catalog; anything else is dropped.
- Re-assessment history is scoped to the browser sign-in session in the demo; real authentication would scope it to the organization's account.
- Spanish: the questionnaire is English only; the report and PDF can be written in Spanish, with `lang="es"` tags for screen readers.
- Staff dashboard data: 20 seeded synthetic organizations plus demo runs; benchmarking is a staff-only preview from the `domain_benchmarks` SQL view.
- axe-core: no WCAG 2.2 A or AA violations on any page, including the staff dashboard.
- On the roadmap: Everytown review of the field guides, real authentication, a translated questionnaire and more languages; later, peer benchmarking beyond the preview and matching new grantees with peers.
