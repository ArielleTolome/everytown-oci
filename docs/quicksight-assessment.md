# Should staff BI move to Amazon QuickSight?

**Short answer: not now.** Keep the staff dashboard that is built into the app, and revisit QuickSight when one of the triggers at the end is true. Checked on 2026-11-04 against this AWS account and the public QuickSight pricing page.

## What staff have today (no extra cost)

The staff dashboard (`/staff/`, `features/bi.py`, `features/peers.py`, v1.7 quality tab) already answers the questions the CSF director asked for, inside the same sign-in:

- Which organizations need which training, gaps by area, most common gaps, change over time between assessments.
- "Ask the data": plain-English questions; the AI only picks one of our fixed analyses and code computes every number.
- Peers and connect requests; organization drawer with the full report, roadmap progress and AI trace links.
- v1.7: report quality (organization feedback, review queue, flags), roadmap follow-through and a check-in list, opt-ins to trainings, where people stop in the assessment.
- CSV downloads and a network report PDF for anything else.

## What QuickSight would add

- Drag-and-drop charts and ad hoc slicing for an analyst, scheduled email reports, and QuickSight's own natural-language Q&A (Author Pro / Q).
- A standard tool if Everytown already uses QuickSight elsewhere.

## What it would cost and take

| Item | Finding |
|---|---|
| Account | QuickSight is **not subscribed** in this account (`describe-account-subscription`: "The account does not exist"). Subscribing is an account-level billing decision. |
| Price | Author about $24 per user a month, Reader from $3 per user a month (per-user pricing); generative Q&A needs Author Pro / Reader Pro at a higher price. Embedding in our app for staff without QuickSight sign-in needs capacity pricing. |
| Data access | QuickSight cannot use the RDS Data API we use. It needs a network path to Aurora: an Enterprise-edition VPC connection into the database's VPC (security groups, subnets), or a nightly export to S3 + Athena. |
| Sign-in | A second sign-in and user management for staff, or embedding work in the app. |
| Effort | 1 to 2 days to set up datasets, the VPC connection, a first dashboard and permissions; ongoing upkeep of a second place where numbers are defined. |
| Risk | Two definitions of "needs training" (app code and QuickSight calculated fields) can drift; staff would see different numbers in two places. |

At today's scale (about 20 synthetic organizations, 140 at full network), the in-app dashboard is enough and costs nothing extra.

## When to revisit (any one of these)

1. Everytown already pays for QuickSight or another BI tool and wants OCI data next to its other data.
2. A data analyst needs ad hoc slicing that CSV + spreadsheet cannot cover.
3. More than a few hundred organizations, or a need for scheduled emailed reports to leadership.

## If we do it later, the low-risk path

1. A nightly job writes read-only CSV or Parquet snapshots of `organizations`, `assessments`, `domain_results`, `support_requests`, `roadmap_tasks`, `report_feedback` and `network_optins` to an S3 bucket (no personal emails in the snapshot unless staff need them).
2. Athena tables over that bucket; QuickSight datasets on Athena (no VPC connection into the live database).
3. One staff dashboard, with readers for CSF staff; keep the app's numbers as the definition and test that both agree.
