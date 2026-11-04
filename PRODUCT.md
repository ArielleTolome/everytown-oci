# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: leaders of community violence intervention (CVI) nonprofits** in Everytown's Community Safety Fund (CSF) network. Small organizations of 5 to 20 staff; many leaders and staff have lived experience of violence or incarceration, and some read at an 8th grade level ("I can read this even though I'm at an 8th grade reading level and I've been to prison"). Many use a phone, often between shifts. They work in English or Spanish. The executive director usually starts the assessment; finance leads or bookkeepers, board chairs or members and program directors may answer areas sent to them.
- **Secondary: CSF program staff**, a very small team that coaches the network. Their job: see which organizations need which training, who to connect with whom, and whether support helped over time.

## Product Purpose

Everytown for Gun Safety works to end gun violence. Its Community Safety Fund supports community-based violence intervention programs (since 2019, $15.7 million to 141 programs in 72 cities) with funding, capacity-building training, peer convenings and advocacy. New grantees complete a self-assessment that shapes their training.

The OCI Capacity Coach is that self-assessment, the Organizational Capacity Index: 143 Yes / No statements across 8 capacity areas. Everytown's reference code scores the answers into a stage per area. The tool then gives the leader a plain-language report: what is true about the organization today, one or two priorities to start with, a 12-week roadmap with owners, and a PDF letter for the board. CSF staff get a network dashboard.

Success: in a pilot, 3 to 4 CSF grantees find the recommendations helpful, and CSF staff spend their time coaching instead of writing reports by hand (two staff hand-wrote every report for the 45-organization 2025 pilot).

## Positioning

A learning tool, not an evaluation. Code computes every score and stage; AI only writes the narrative around them, and the server drops anything that does not cite the organization's own answers. Links come only from a vetted catalog of 19 CVI resources. It is Everytown's own instrument, not a generic nonprofit survey.

## Operating Context

- Leaders take the assessment alone or with a teammate, one area at a time, often over several sittings (save and resume, "send this area to a teammate"). Reports come back in about 40 seconds; a re-assessment shows what changed.
- CSF staff use the dashboard to plan cohort trainings, write training briefs, and connect similar grantees.
- Hackathon build (AWS Breaking Barriers 2026): mocked logins (demo / demo, staff / staff), synthetic organizations only, a temporary public URL torn down after judging.

## Capabilities and Constraints

- The 143 statements are Everytown's official wording (with a machine translation to Spanish); their text and the stage names (Seeding, Emerging, Developing, Strengthening, Transformational) do not change.
- Gaps are called "growth priorities". Every stage is a normal place to be; results never read as a grade.
- Reports aim at an 8th grade reading level, measured in code.
- No em dashes in any copy. No emojis.
- AWS only; Claude on Amazon Bedrock; Astro static site with a Flask JSON API.

## Brand Commitments

- The look follows the Everytown Community Safety Fund site: navy and royal blue, serif headlines (Source Serif 4 as a stand-in for CSF's GT Super), Atkinson Hyperlegible body, pill buttons, pale-blue title bands, the orange three-bar CSF mark, one red accent stripe. Tokens and rules: `design-system/everytown-oci/MASTER.md` and its `pages/` overrides (in the workshop folder, outside this repo).
- Voice: warm, plain, strength-first, trauma-informed, people-first; never blaming or alarming.

## Evidence on Hand

- The 2025 pilot facts above, quotes from the onsite interview with the CSF team (`docs/pitch/`), and three synthetic sample organizations (`data/samples.json`, `benchmark/`).
- Absent and never to be invented: testimonials from real grantees, logos of real organizations, outcome metrics, real organization data.

## Product Principles

1. Strength first: every screen says what is going well before what to grow.
2. One or two things to do first, not ten.
3. Show the work: every priority shows the statements it came from.
4. Never alarm: priorities are invitations, not failures; crisis language gets a fixed 988 / 911 answer.
5. Reduce burden: one area at a time, save anywhere, phone-friendly.

## Accessibility & Inclusion

WCAG 2.2 AA (axe-core clean at 1280 and 375 px), 8th grade reading level, Atkinson Hyperlegible, read-aloud with Amazon Polly, larger text and high contrast modes, English and Spanish, 44 px touch targets.
