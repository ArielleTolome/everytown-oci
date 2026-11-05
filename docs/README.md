# docs/

Project documents: the hackathon vision and technical write-ups, the pitch deck with its demo script, and app screenshots. Nothing here is loaded by the app.

## Files

| File | What it does |
|---|---|
| `vision.md` | Vision document from the OCI scoping session: problem, users, goals and the AI recommendation layer on top of the deterministic scoring. |
| `tech.md` | Technical document: stack, which AWS service runs what, and the planned multi-step Bedrock pipeline. |
| `technical-guide.md` | The technical guide to the whole system: architecture, scoring, data model, API, AI pipeline, features, staff dashboard, frontend, infrastructure, security, observability, testing, how it was built, release history, operations and glossary. |
| `OCI-Capacity-Coach-technical-guide.pdf` | The same guide as a PDF, built by `python3 scripts/build_guide_pdf.py`. Rebuild it after editing `technical-guide.md`. |
| `features-and-benefits.md` | Every feature we added for Everytown and what it gives organization leaders, Everytown staff and Everytown itself, checked on the live site (Nov 5) and compared with Everytown's OCI package. |
| `next-steps.md` | What the CSF director raised in the 2026-11-04 walkthrough, what v1.7 built for each point, and the remaining tasks (L1 to L10), each sized for one person or agent. |
| `quicksight-assessment.md` | Whether staff BI should move to Amazon QuickSight: not now, with costs, data-access limits, revisit triggers and the low-risk path if it is ever needed. |
| `pitch/index.html` | The pitch deck as one HTML page. Open it in a browser: arrows or space to move, `N` for speaker notes (the script's words, per speaker). |
| `pitch/OCI-Capacity-Coach-pitch.pdf` | PDF export of the deck, built by `python3 scripts/build_pitch_pdf.py`. Rebuild it after editing `index.html`. |
| `pitch/demo-script.md` | The 10-minute presentation in the judges' required order (team, overview and architecture, live demo, industry impact, questions): who says what, word for word in plain English, the demo click by click, likely questions, preparation and offline backup. |
| `pitch/OCI-Capacity-Coach-script.docx` | The same script as a Word document, built by `python3 scripts/build_script_docx.py`. Rebuild it after editing `demo-script.md`. |
| `pitch/sample-report.pdf` | A sample generated report, the offline backup if the live demo fails. |
| `pitch/img/report-start.jpg` | The screenshot on the deck's live demo slide (Start here, two priorities side by side). |
| `screenshots/*.jpg` | Numbered app screenshots (1 to 10) in demo order, from the start page to the CloudWatch trace and dashboard. |
| `img/banner.html`, `img/banner.png` | The README banner: the HTML source (app fonts and colours, the deck's Start here screenshot) and its 2560x800 render, built by `python3 scripts/build_readme_media.py banner`. |
| `img/architecture.html`, `img/architecture.png`, `img/aws-icons/` | The AWS architecture diagram: HTML source with the official AWS Architecture Icons (release 07312026; AWS allows them in architecture diagrams), rendered to PNG by `scripts/build_architecture.py`. |
| `demo/oci-capacity-coach-demo.mp4`, `.gif` | The README demo video (about 1:45, 1280x720) recorded on the live site, and the 2x-speed GIF the README shows (GitHub plays only videos uploaded through its web editor inline). Built by `python3 scripts/build_readme_media.py demo`. |

## Changing it safely

- `vision.md` and `tech.md` describe the hackathon plan; the root [README](../README.md) is the source of truth for what was built.
