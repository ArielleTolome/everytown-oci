# What we built for Everytown, and what it gives leaders and staff

How this was put together: on Nov 5, 2026 we walked the live site (https://d2mi2h3eu8y69s.cloudfront.net) as an organization leader (`demo`) and as Everytown staff (`staff`), page by page: sign-in, the start page, resume, the answer-style choice, the questionnaire, both report tabs, the 12-week roadmap and all seven staff tabs. We checked each feature below against the code and the project history (`CHANGELOG.md`, v0.1.0 to v1.10) and compared it with what Everytown handed us in its OCI package.

Everything in the live app is made up (synthetic organizations), and sign-in is a practice login.

## Where Everytown started

From Everytown's OCI package (vision and technical documents, the 2025 findings, the July 2025 handoff slides and the prototype's sample report for Riverbend):

- **A proven idea that could not grow.** The 2025 pilot helped 45 groups, but two Community Safety Fund staff wrote every individual report by hand. The network is more than 140 groups.
- **A prototype that only scored.** Python scoring code with a basic screen: it asked the questions and showed the scores. No personal recommendations, no AI.
- **A long report.** The prototype's sample report for Riverbend is about 5,500 words and lists 57 areas to improve, 19 of them marked high priority, all at once. English only.
- **Nothing after the report.** No way to track follow-through.
- **A one-time network view.** Staff analyzed the 45 results by hand once (July 2025) to plan training.

We kept Everytown's 143 statements, its stage names and its scoring exactly as they were (checked against all three of Everytown's answer keys). Everything below is new.

## For organization leaders

### Getting started

| Feature | What it does | What the leader gets |
|---|---|---|
| A short start page | Who is filling it out (role, job title, name), the organization's name, what it does, its size, states (as removable bubbles, up to 10), website and up to 5 social links. The four priority areas are picked for them. | A start that takes a few minutes, and a plan that fits their size and work. |
| English or Español | One switch at the top right sets the questions, the report and the read-aloud voice. | Leaders and staff can work in their own language. |
| Made-up sample groups | One click fills a sample group's answers (Southside, Riverbend, Metro). | A way to see what the tool gives before answering. |
| Pick how to answer | Before the first question: one real statement shown three ways (one at a time, Yes / No for each, a checklist), each with its estimated time and the time it saves (for the four main areas: about 11 minutes; one at a time saves under a minute, the checklist about 1 minute; with all 8 areas the checklist saves about 2). The choice sticks; "Change how I answer" switches later. | The style that feels easiest, knowing what each one costs in time, without being asked again. |

### Answering

| Feature | What it does | What the leader gets |
|---|---|---|
| One question at a time | Big Yes / No buttons (Y and N keys work), Previous and Next on every card, "Question 3 of 9" and minutes left in the area. | Never lost, never rushed, and always able to go back. |
| Fewer questions on hard topics | Five topics that step up (like how far ahead you can see your funding) are one multiple-choice question; the next screen shows the Yes / No it filled in, ready to change. | Less clicking, with every answer still in their control. |
| Plain-word help | "What does this word mean?" under statements with jargon. | No one has to guess what a term means. |
| Save and finish later | Answers save on the device after every change; a resume link or code picks up anywhere. | They can stop and come back, on another device too. |
| Send an area to a teammate | A link for one area; the teammate answers only that area, and answers merge ("Answered by"). | The finance lead answers finance; the work is shared, as Everytown intended. |
| Phone first | Every screen is built and tested on a phone. | They can answer between shifts. |

### The report

| Feature | What it does | What the leader gets |
|---|---|---|
| A plan in about a minute | Live steps while it works: reading answers, scoring, looking at the website, consulting field guides, writing, checking. | No waiting for staff to write a report. |
| Summary about your organization | A letter from a coach: strengths first, never a grade, in plain words. Every report is checked to read at about an 8th grade level or plainer. | Something they can read, share with their board, and act on. |
| Start here: the two things to do first | Picked by Everytown's own scoring, not by the AI, shown side by side. Each shows the exact answers it is based on and a link from 19 trusted guides. These are weeks 1 to 4 of the roadmap. | Not 57 problems: one or two things to start Monday. |
| Labelled sources | A small label on each part: "From your answers", "Picked from your answers", "Written by AI from your answers", "Found on public web pages". | They know what came from them and what the AI wrote. |
| Explore any area | Every assessed area, its stage and what the plan says about it. | A deep dive when they want one. |
| What we learned about you | What the AI found on their website, social media and the news, with sources, at the end. | A plan that reflects who they are, with nothing hidden. |
| Listen | Any part read aloud (Amazon Polly), in English or Spanish. | Reports work for people who prefer to listen. |
| Chat about your report | A button at the bottom right: ask in their own words; answers know the whole report and roadmap and show the answers they used. Someone in crisis gets 988 and 911 from fixed rules, never the AI. A "New chat" button starts over with a clean slate. | A coach to ask "how do I start?" at any hour. |
| A PDF letter | A 2 to 3 page letter, then the detailed results; an Everytown watermark and a confidentiality note. | Something to print and take to the board, safely marked. |

### Following through

| Feature | What it does | What the leader gets |
|---|---|---|
| A 12-week roadmap | All 12 weeks at a glance; one week opens at a time (when the last is done, or after 7 days); a person in charge of each step; each week as a one-page PDF. | A pace a small team can keep. |
| Points, levels and badges | 7 badges and a pop-up when a week is finished; points for steps, never for answers or scores. | Encouragement to keep going. |
| Points at the top right | The roadmap page shows the group's points and level in a box at the top right of the page title. | Progress they can see at a glance. |
| Ticks in one place | Ticking a step in Start here or on the roadmap updates both. | No double work. |
| A retake in week 12 | Week 12 is "Retake the OCI"; a second assessment shows what moved. A calendar reminder is one click. | Proof of their progress, for themselves and funders. |

### Staying connected with Everytown

| Feature | What it does | What the leader gets |
|---|---|---|
| Ask for support | Pick the areas where they want training or coaching. | A direct line to Everytown's Community Training Institute. |
| Connect me with similar groups | A request Everytown staff act on; no group ever sees another group's answers. | Peers facing the same challenges. |
| Stay connected | An optional sign-up for trainings and updates; the email is asked only after a box is ticked. | Updates only if they want them. |
| Does this feel right? | Yes or Not quite, which part, and a comment. | A voice in how the tool improves. |

### For every reader

Larger text and high-contrast colors in a Display menu, a typeface designed for low vision, screen-reader support, large tap targets, and 0 problems in an automated accessibility check (WCAG 2.2 AA) on every page.

## For Everytown staff

| Feature | What it does | What staff get |
|---|---|---|
| Training needs | Which groups need which training, most needed first, who asked for help, a matrix to download. | Training planned around real, current needs. |
| Draft a training brief | An AI first draft of a training session for a common gap (why it matters, who it is for, an outline, resources), from counts only, never group names. | Hours saved preparing Community Training Institute sessions. |
| Gaps by area and most common gaps | Where the network is strong or growing, grouped by program model, size, budget, state or who answered. | The network picture the 2025 analysis took by hand, updated with every check-up. |
| Change over time | Groups assessed more than once: what moved, and an early "Did support help?". | A way to see whether their support works. |
| Ask the data | A question in plain words ("Which organizations need fundraising training?"). The AI only picks one of eight fixed analyses; every number comes from the data, with a short summary. | Answers without a data analyst or a spreadsheet. |
| Peers | Groups with the same program model and size, and requests to connect. | Peer learning that is easy to set up. |
| Quality and follow-through | What groups said about their reports, a review queue (Mark reviewed, Flag with a reason), where each group is on its roadmap (the week it is on, its points and level, the same numbers the group sees), who is on track or stalled with a ready-made check-in note, who signed up for trainings, and where people stop the assessment. | Quality control and follow-up in one place. |
| A drawer for each group | Details, stages, top priorities, support requests, roadmap progress, similar groups, the full report, and the record of every AI step. | Everything about one group, ready for a coaching call. |
| Exports | Any table as a spreadsheet (CSV); a network report as a PDF. | Easy to share with leadership and funders. |

## For Everytown as an organization

| What | Why it matters |
|---|---|
| Everytown's method, unchanged | The same 143 statements, stages and scoring, checked against Everytown's answer keys. The AI never scores and never picks the priorities. |
| AI that is checked | Every action must point to the group's own answers or it is removed; links only from 19 trusted guides; a safety filter on what comes in; crisis questions never reach the AI. |
| Tested before every release | 52 practice cases for the AI, 35 end-to-end tests run on a computer and a phone, and an accessibility check. A first-time user test on Nov 4 led to 12 fixes, live the same day. |
| Every AI step recorded | Staff can open the record of any report (Amazon CloudWatch). |
| Low cost | About 11 cents of AI per report; under $50 a year for 140 groups twice a year; $1 to $3 a month to host when the database sleeps. |
| Theirs to keep | Free and open source (Apache-2.0); one script sets it up in Everytown's own Amazon account. |

## The benefits in one line each

**Leaders:** a plan in about a minute; one or two things to start with, not 57; plain words, read aloud, Spanish, on a phone; a coach to ask anytime; 12 weeks of small steps with encouragement; a way to ask Everytown for help and meet similar groups.

**Staff:** no report writing by hand; a live view of training needs across the network; answers to plain questions; quality checks and follow-through in one place; a way to see whether their support helped.

## Not done yet

Real sign-in inside Everytown's Grantee Portal, a pilot with real groups, and expert review of the field guide library. See [`next-steps.md`](next-steps.md).
