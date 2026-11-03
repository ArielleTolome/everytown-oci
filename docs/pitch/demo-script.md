# OCI Capacity Coach: 3-minute live demo script

Live app: https://d2mi2h3eu8y69s.cloudfront.net (sign in `demo` / `demo`).
Deck: `docs/pitch/index.html` (arrows or space to move, `N` for speaker notes). Slide 4 is the demo hand-off.
Judging criteria tags: **[TECH]** Technical Capability, **[UI]** User Interface and Design, **[IMPACT]** Impact and Scalability, **[ORIG]** Originality and Uniqueness.

## Before you go on stage (10 minutes)

1. Open https://d2mi2h3eu8y69s.cloudfront.net/healthz and confirm it loads.
2. **Tab B (re-assessment with progress), prepare first:**
   1. Sign in with `demo` / `demo`. On "Tell us about your organization" keep **English** and the four pre-selected areas, open **Try a synthetic sample organization** and click **Riverbend Violence Interruption Network (synthetic sample)**. Wait for **Your report is ready** (about 45 s). This is the baseline.
   2. Go back to the start page. Type exactly `Riverbend Violence Interruption Network (synthetic sample)` in **Organization name** (the name is how the app finds the previous assessment), leave **Website** empty, keep English and the same four areas, click **Start questionnaire**.
   3. Answer **Yes** to every statement except these, which are **No** (this is sample B with FR7, FR15 and ML6 improved to Yes):
      - Planning: 1, 10, 11, 13, 14, 15
      - Fundraising: 8, 10, 11, 12, 16, 17, 18, 19, 20
      - Financial Management: 9, 10, 11, 17, 18, 19, 20
      - Monitoring, Learning & Evaluation: 10 to 17
   4. Click **Submit assessment** and wait for **Your report is ready**. Check that **Progress since your last assessment** shows 3 growth priorities closed, 0 new, and Monitoring, Learning & Evaluation moved up from Emerging to Developing. Keep this tab open, scrolled to the top.
   5. Do not click the Riverbend sample again after this: the next Riverbend run would compare against this one.
3. **Tab A (live run):** a fresh tab on the start page. Open **Display** and make sure Larger text and High contrast are both off.
4. Open `docs/pitch/sample-report.pdf` in a local PDF viewer (backup, works offline).
5. Browser zoom 125% so the back row can read the screen. Turn notifications off.

## The run (3:00)

| Time | Exact clicks | Say | Criterion |
|---|---|---|---|
| 0:00 to 0:20 | Tab A. Point at the four pre-selected areas. Optional: choose **Español** under **Report language**. Open **Try a synthetic sample organization** and click **Southside Youth Peace Collective (synthetic sample)**. | "A real leader answers one area per screen, plain Yes or No: 'Every No is simply a place to grow.' For the demo, and for CSF staff training, we use a fictional organization from Everytown's builder package, so no real data is needed. The four priority areas come pre-selected because the pilot showed Planning, Fundraising and Financial Management track overall capacity." | [UI] [ORIG] [IMPACT] |
| 0:20 to 0:50 | Results page loads. Point at the **Building your recommendations** checklist, then scroll to **Where you are today**. | "The stage ladder is already here: deterministic Python, the unchanged reference engine, verified against all three answer keys. The AI never scores. Now a hardcoded pipeline runs in the background: Claude Haiku profiles the organization, a Bedrock Knowledge Base on S3 Vectors pulls the matching CVI field guides, and Claude Sonnet writes the plan through a strict JSON schema. End to end it takes 38 to 47 seconds." | [TECH] |
| 0:50 to 1:10 | Switch to Tab B. Point at **Progress since your last assessment**: 3 growth priorities closed, 0 new, Monitoring, Learning & Evaluation moved up from Emerging to Developing. | "This is the same organization re-assessing a few months later. The comparison is deterministic: three growth priorities closed and one area moved up a stage. The summary opens by celebrating that progress, so the tool keeps teams coming back." | [IMPACT] [ORIG] |
| 1:10 to 2:00 | Still Tab B. Scroll to **30 / 60 / 90 day action plan**. On the first action, read the **Owner** line, then click **Show statements** under "Based on your answers to". Point at the **Resource** link. Scroll to **Team conversation guide**. | "Every action has a role owner and steps a team can start Monday. And every action shows its evidence: these are the exact answers it is based on. The server rejects any action that does not cite a real growth priority from this submission, and any link that is not in our vetted catalog of 19 resources. Then a conversation guide for the next leadership meeting, so the report becomes a team reflection." | [ORIG] [TECH] |
| 2:00 to 2:25 | Scroll up to **Summary**, click **Listen** (let it read one sentence, click **Stop**). Open **Display**, switch on **Larger text** and **High contrast**, then switch both off. | "Listen reads any section aloud. Larger text and high contrast are one click and remembered. The font is Atkinson Hyperlegible, made for low-vision readers. axe-core finds no WCAG 2.2 A or AA violations on any page, and Spanish text is tagged so screen readers switch voice." | [UI] |
| 2:25 to 2:45 | Switch to Tab A: point at **Your report is ready** (if you chose Español, point at the Spanish **Summary** text). Click **Download PDF report**. | "That is the report we started two minutes ago, finished live. Same report as a PDF with bookmarks to share with the board." | [TECH] [UI] |
| 2:45 to 3:00 | Switch back to the deck, press the right arrow to slide 7. | "Each report costs five to ten cents of Bedrock tokens, the infrastructure is one Lambda that scales to zero, and the whole stack is one CloudFormation template Everytown Labs can fork." | [IMPACT] |

If Southside was run before, Tab A also shows **Progress since your last assessment** ("Your answers match your assessment on ..."). That is expected; skip past it. Do not use the Riverbend sample live (see step 2.5).

If a step shows **We could not finish your recommendations**, say "the scores are saved, it only reruns the AI steps" and click **Try again**, then continue in Tab B.

## 30-second backup (network down)

Open `docs/pitch/sample-report.pdf` (21 pages, Riverbend synthetic sample, Spanish narrative).

| Time | Show | Say |
|---|---|---|
| 0:00 to 0:08 | Page 1 cover, then page 3 **Domain results**. | "This is a real report the live system produced. Scores and stages come from deterministic Python, never the AI." |
| 0:08 to 0:20 | Pages 4 to 7 **30 / 60 / 90 day action plan**: point at **Owner**, **Based on:** (for example ML6, ML15) and **Resource**. | "Each action has an owner, cites the exact answers behind it and links only vetted resources. This one was written in Spanish, because the organization chose Español." |
| 0:20 to 0:30 | Page 16 **Team conversation guide** and **Sources**. Then back to the deck slide 4 screenshots. | "A guide for the next team meeting, and every source listed. The live app does this in under a minute for five to ten cents." |

## Numbers to have ready for questions

- 45 organizations in the manual 2025 pilot; 2 CSF staff wrote every report by hand; 140+ organizations in the network.
- 143 statements across 8 domains; reference scoring engine passes all 3 benchmark answer keys.
- 38 to 47 seconds end to end; about $0.05 to $0.10 of Bedrock tokens per report; about $0 to $1 a month of infrastructure at demo traffic.
- axe-core: no WCAG 2.2 A or AA violations on login, organization, questionnaire, processing and report pages.
- Out of MVP scope, on the roadmap: Everytown review of the field guides, real authentication, CSF staff cohort insights, more languages.
