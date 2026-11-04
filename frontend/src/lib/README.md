# frontend/src/lib/

Client-side TypeScript modules that the pages in `../pages/` import. They build HTML strings, wire events and call the API. None of them score anything: scores and roadmap progress come from the server. See [../../README.md](../../README.md) for the page list.

## Files

| File | What it does |
|---|---|
| `api.ts` | Typed API client: `api.get` / `api.post` to `/api${path}` (JSON body with `x-amz-content-sha256`), `ApiError`, `requireUser()` (`/api/me`, redirects to `/login/?next=` on 401), cached `getMeta()` (`/api/meta`). Shared types (`User`, `Question`, `Assessment`, ...). |
| `dom.ts` | Small helpers: `esc`, `$` / `$$`, `plural`, `announce` (live region), `focusEl`, `hostOf`, `safeUrl`. |
| `icons.ts` | `icon(name)`: inline Lucide SVG paths, decorative (`aria-hidden`). |
| `draft.ts` | In-progress answers in localStorage (`saveDraft`, `loadDraft`, `clearDraft`); once a resume link exists, syncs to `/api/drafts` (debounced 1 s) and creates teammate share links (`/share`, `?d=&area=`). `mountDraftTools`, `DraftLinkError`. |
| `quick.ts` | `mountQuick`: the one-at-a-time questionnaire view (one card, Yes/No, auto-advance). `scopeLadders` limits `ladders.json` groups to the asked statements; each choice still records one yes or no per statement. |
| `results.ts` | HTML builders and behaviors for the results page: `statusPanel`, `reportBody`, `stagesSection`, `areaDetail`, `progressSection`, `wireLayers`, `wireExplore`, `wireChecklists`, `wirePeers`, `wireSupport` (`/api/assessments/<id>/support`), `wireReminder` / `reminderIcs`, `pdfButton`. |
| `report-ui.ts` | Shared by results and plan: `errorText` for readable API errors, `wireDownloads` for PDF downloads that fail politely. |
| `coach.ts` | "Ask about your report": `coachBody`, code-written `starters`, `wireCoach` posting to `/api/assessments/<id>/ask`. |
| `listen.ts` | `wireListen`: "Listen" buttons play a section from `/api/assessments/<id>/audio/<section>` (Amazon Polly) through one shared player. |
| `toc.ts` | `wireToc`: "On this page" nav, sticky from 1100px, a disclosure below; opens the hidden layer a link points into. |
| `roadmap.ts` | 12-week roadmap: `mountPlan` for `/plan/`, the results-page teaser (`roadmapTeaser`, `fillRoadmapTeaser`, `wireRoadmapTeaser`), `getRoadmap`, `setRoadmapTask` (task ticks), weekly PDF links. |
| `staff-bi.ts` | Staff dashboard types for `/api/staff/bi` and HTML per tab (`needsPanel`, `gapsPanel`, `changePanel`, `commonPanel`, `peersPanel`, `drawerHtml`, `roadmapHtml`), `downloadCsv` / `needsCsv`, `markScroll` (scroll hints on tables), `failHtml` / `expired` (401 messages). |
| `staff-ask.ts` | "Ask the data": `askPanel`, `wireAsk` posting to `/api/staff/ask`; the table from code is the source of truth, AI only words the answer. |
| `staff-brief.ts` | AI training brief: `briefButton`, `wireBriefs` posting to `/api/staff/briefs` (aggregated counts only). |

## How it connects

- `index`, `questionnaire`, `resume` use `draft` (and `quick`); `results` uses `results`, `coach`, `listen`, `toc`, `roadmap`, `report-ui`; `plan` uses `roadmap`; `staff` uses the three `staff-*` modules.
- `results.ts` also imports `staff-bi.ts` for staff-only views on a report.

## Changing it safely

- Every API string goes through `esc()` and every URL through `safeUrl()`.
- Type check with `npm run check` in `frontend/`.
