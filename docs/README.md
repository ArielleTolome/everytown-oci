# docs/

Project documents: the hackathon vision and technical write-ups, the pitch deck with its demo script, and app screenshots. Nothing here is loaded by the app.

## Files

| File | What it does |
|---|---|
| `vision.md` | Vision document from the OCI scoping session: problem, users, goals and the AI recommendation layer on top of the deterministic scoring. |
| `tech.md` | Technical document: stack, which AWS service runs what, and the planned multi-step Bedrock pipeline. |
| `next-steps.md` | What the CSF director raised in the 2026-11-04 walkthrough, what v1.7 built for each point, and the remaining tasks (L1 to L10), each sized for one person or agent. |
| `quicksight-assessment.md` | Whether staff BI should move to Amazon QuickSight: not now, with costs, data-access limits, revisit triggers and the low-risk path if it is ever needed. |
| `pitch/index.html` | The pitch deck as one HTML page. Open it in a browser: arrows or space to move, `N` for timed speaker notes. |
| `pitch/OCI-Capacity-Coach-pitch.pdf` | PDF export of the deck, built by `python3 scripts/build_pitch_pdf.py`. Rebuild it after editing `index.html`. |
| `pitch/demo-script.md` | The 8-minute run of show: timing per slide, judging criteria, demo steps, sign-ins and offline backup. |
| `pitch/sample-report.pdf` | A sample generated report, the offline backup if the live demo fails. |
| `pitch/img/*.jpg` | Screenshots used by the deck (questionnaire, report, roadmap, staff views, CloudWatch dashboard and trace). |
| `screenshots/*.jpg` | Numbered app screenshots (1 to 10) in demo order, from the start page to the CloudWatch trace and dashboard. |

## Changing it safely

- `vision.md` and `tech.md` describe the hackathon plan; the root [README](../README.md) is the source of truth for what was built.
