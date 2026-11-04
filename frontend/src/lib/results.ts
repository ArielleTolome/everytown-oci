// HTML builders and small behaviors for the results page. Every API string goes through esc(); URLs through safeUrl().
import { api, ApiError, type Assessment, type Focus, type Gap, type Meta, type Step, type Support } from "./api";
import { $$, announce, esc, focusEl, hostOf, plural, safeUrl } from "./dom";
import { coachCard, coachChat } from "./coach";
import { feedbackSection } from "./feedback";
import { optinSection } from "./optin";
import { icon, type IconName } from "./icons";
import { celebrateWeek, fillRoadmapTeaser, roadmapTeaser, setRoadmapTask, shortDate, type Roadmap, type RoadmapWeek } from "./roadmap";
import { errorText, fold } from "./report-ui";
import { traceLinks } from "./staff-bi";

/** v1.0 document fields (all optional; older documents lack them). Kept local so api.ts stays conflict-free. */
export interface ResearchSource { kind: "website" | "social" | "news"; url: string; title: string; used: boolean }
export interface V10 {
  respondent?: { name?: string | null; title?: string | null; role?: string | null } | null;
  research?: { strength: "rich" | "some" | "limited" | "none"; sources: ResearchSource[] } | null;
  answered_by?: Record<string, string> | null;
  peer_request?: { requested_at: string } | null;
  /** v1.1: the AI trace of the latest run (staff only; the API strips it for organizations). `url` is Phoenix when
   *  configured, else CloudWatch; `cloudwatch_url` (v1.6) is always the CloudWatch console. */
  trace?: { trace_id: string; project: string; url: string | null; cloudwatch_url?: string | null } | null;
}
export const v10 = (sub: Assessment) => sub as Assessment & V10;

/** "Executive director (Founder and executive director)": role and title only; the name stays off screen too. */
export function respondentLine(sub: Assessment): string {
  const r = v10(sub).respondent;
  const role = (r?.role ?? "").trim(), title = (r?.title ?? "").trim();
  if (role && title && role.toLowerCase() !== title.toLowerCase()) return `${role} (${title})`;
  return role || title;
}

export const STATE_TEXT: Record<Step["state"], string> = { pending: "Waiting", running: "In progress", done: "Done", error: "Did not finish" };
const STATE_ICON: Record<Step["state"], string> = {
  pending: icon("circle"), running: icon("loader", "spin"), done: icon("circle-check"), error: icon("circle-x"),
};

/** Small visible note under a section heading saying where its content comes from (#32). */
const SOURCE: Record<"ai" | "answers" | "web", [IconName, string]> = {
  ai: ["pencil", "Written by AI from your answers"],
  answers: ["clipboard", "Built from your answers"],
  web: ["globe", "Found on public web pages"],
};
export const sourceTag = (kind: keyof typeof SOURCE, text = SOURCE[kind][1]) =>
  `<p class="source-tag source-tag--${kind}">${icon(SOURCE[kind][0])}<span>${esc(text)}</span></p>`;

export const pdfUrl = (sub: Assessment) => `/api/assessments/${encodeURIComponent(sub.id)}/report.pdf`;
export function pdfButton(sub: Assessment): string {
  const size = sub.pdf_kb ? `PDF, ${sub.pdf_kb} KB` : "PDF";
  return `<a class="btn btn-primary" href="${pdfUrl(sub)}" download data-download>${icon("download")}<span>Download PDF report (${size})</span></a>`;
}

/** Read-aloud button for one report section; listen.ts plays it with Amazon Polly. */
function listen(section: "summary" | "focus" | "plan" | "strengths" | "conversation", lang: string): string {
  return `<button type="button" class="btn btn-ghost btn-sm btn-listen" data-listen="${section}" data-lang="${esc(lang)}" aria-pressed="false">
    <span class="btn-listen__play">${icon("volume")}<span>Listen</span></span>
    <span class="btn-listen__stop">${icon("stop")}<span>Stop</span></span>
  </button>`;
}

function sectionHead(id: string, title: string, eyebrow: string, listenSection?: Parameters<typeof listen>[0], lang = "en", lead = "", source = ""): string {
  return `<div class="section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="${id}">${esc(title)}</h2>${source}</div>${listenSection ? listen(listenSection, lang) : ""}</div>${lead ? `<p class="section-lead">${lead}</p>` : ""}`;
}

export function stepItems(steps: Step[]): string {
  return steps.map((s) => `
    <li class="step-list__item" data-step="${esc(s.key)}" data-state="${esc(s.state)}">
      <span class="step-list__icon">${STATE_ICON[s.state] ?? ""}</span>
      <span class="step-list__label">${esc(s.label)}</span>
      <span class="step-list__state">${STATE_TEXT[s.state] ?? esc(s.state)}</span>
    </li>`).join("");
}

export function statusPanel(sub: Assessment): string {
  if (sub.status === "done") {
    const n = sub.report?.focus?.length ?? 0;
    return `<section class="panel panel--ready" aria-labelledby="ready">
      <h2 id="ready" tabindex="-1">${icon("circle-check")}Your report is ready</h2>
      ${sub.report
        ? `<p>Start with the summary about your organization${n ? `, then your roadmap and your ${n === 1 ? "top priority" : "top priorities"}` : ""}. The PDF also has your scores by area and the full plan, so your team can talk it through together.</p>
      <p class="hint">This is a learning tool, not a grade. A small label under each heading says what came from your answers and what AI wrote. Talk the AI parts over with your team before you act.</p>`
        : `<p>Open "Explore any area" below to see what is in place and what to work on next in each area. This is a learning tool, not a grade: every stage is a normal place to be.</p>`}
    </section>`;
  }
  const failed = sub.steps.find((s) => s.state === "error");
  const isError = sub.status === "error";
  return `<section class="panel ${isError ? "panel--error" : ""}" id="processing" aria-labelledby="processing-title" aria-busy="${isError ? "false" : "true"}" data-no-print>
    ${isError
      ? `<h2 id="processing-title" tabindex="-1">${icon("alert")}We could not finish your recommendations</h2>
         <p>${failed ? `The step "${esc(failed.label)}" did not finish. ` : ""}Your answers are saved, so you do not need to answer the questions again. Try again now, or come back to this page later.</p>
         ${sub.error ? `<p class="hint">Details: ${esc(sub.error)}</p>` : ""}`
      : `<h2 id="processing-title" tabindex="-1">${icon("loader", "spin")}Building your recommendations</h2>
         <p>This usually takes under a minute. While you wait, you can open "Explore any area" below.</p>
         <p class="hint" id="processing-slow" hidden>This is taking longer than usual. Your answers are saved. You can keep this page open, or come back to this link later.</p>`}
    <ol class="step-list" role="list" id="step-list">${stepItems(sub.steps)}</ol>
    ${isError ? `<p class="field-error" id="retry-error" role="alert" hidden></p>
      <button type="button" class="btn btn-primary" id="retry-btn">${icon("refresh")}<span>Try again</span></button>` : ""}
  </section>`;
}

/* ---------- Stage track (Explore any area) ---------- */

/** Five-segment stage track for one area (filled + bold current label, so not color alone). */
function track(d: Assessment["domains"][number], names: string[]): string {
  const cur = names.indexOf(d.estimated_stage);
  return `<ol class="track" role="list" aria-label="${esc(d.domain_name)}: five stages">${names.map((st, i) => `
        <li class="track__step${i <= cur ? " is-filled" : ""}${i === cur ? " is-current" : ""}"${i === cur ? ' aria-current="step"' : ""}>
          <span class="track__bar" aria-hidden="true"></span>
          <span class="track__label"><span class="track__full">${esc(st)}</span><span class="track__short" aria-hidden="true">${i + 1}</span>${i === cur ? '<span class="visually-hidden"> (current stage)</span>' : ""}</span>
        </li>`).join("")}
      </ol>`;
}

/* ---------- AI sections ---------- */

/** "Based on your answers": real statement text from the question bank (English even in a Spanish report). */
function basis(ids: string[], gaps: Map<string, Gap>, open = false): string {
  if (!ids.length) return "";
  const rows = ids.map((id) => `<li>${icon("circle-dashed")}<span><span class="chip">${esc(id)}</span> ${esc(gaps.get(id)?.question_text ?? "Statement not found")}</span></li>`).join("");
  return `<div class="basis" lang="en">
    ${open
      ? fold(`Based on your answers to ${plural(ids.length, "statement", "statements")}`, `<p class="mini-label">Based on your answers to these statements</p><ul class="basis__list" role="list">${rows}</ul>`)
      : `<details class="about"><summary>Based on your answers to ${plural(ids.length, "statement", "statements")}</summary><ul class="basis__list" role="list">${rows}</ul></details>`}
  </div>`;
}

function resource(r: Focus["resource"], lang: string): string {
  if (!r?.url) return "";
  return `<p class="resource-link">${icon("book")}<span><span class="visually-hidden">Resource: </span><a href="${esc(safeUrl(r.url))}" rel="noopener" lang="${esc(lang)}">${esc(r.title)}</a> <span class="url-domain">(${esc(hostOf(r.url))})</span></span></p>`;
}

/** Status line for a Start-here card (Monarch "Not started · 8 tasks"). */
function checklistStatus(done: number, total: number): string {
  if (!total) return "";
  if (done === 0) return `${icon("circle-dashed")}<span>Not started · ${plural(total, "step", "steps")}</span>`;
  if (done === total) return `${icon("circle-check")}<span>Done · all ${plural(total, "step", "steps")} checked</span>`;
  return `${icon("clock")}<span>${done} of ${total} steps done</span>`;
}

/** Start here: the one or two priorities that make up roadmap weeks 1 to 4, side by side on wide screens (#36).
 *  Only steps of open weeks show; wireChecklists hides the rest and says when the next ones open. */
function focusSection(items: Focus[], gaps: Map<string, Gap>, lang: string): string {
  if (!items.length) return "";
  const L = `lang="${esc(lang)}"`;
  const one = items.length === 1;
  return `<section class="section" aria-labelledby="focus-title">
    ${sectionHead("focus-title", one ? "Start here: weeks 1 and 2 of your roadmap" : "Start here: weeks 1 to 4 of your roadmap", one ? "Your top priority" : "Your top priorities", "focus", lang,
      `You do not have to do everything at once. Out of everything you could work on, ${one ? "this is the one priority to start with. Its steps are weeks 1 and 2" : "these are the two priorities to start with. Priority 1 is weeks 1 and 2"} of the roadmap above${one ? "" : ", and priority 2 is weeks 3 and 4"}. New steps show up here as each week opens. Tick them here or on your roadmap.`,
      sourceTag("answers", "Picked from your answers. Steps written by AI."))}
    <ol class="focus-list" id="focus-body" role="list">${items.map((f, i) => `
      <li class="card focus-card" data-focus="${i}">
        <div class="focus-card__head">
          <span class="focus-card__num" aria-hidden="true">${i + 1}</span>
          <div>
            <h3><span class="visually-hidden">Priority ${i + 1}: </span><span ${L}>${esc(f.title)}</span></h3>
            <p class="focus-card__status" id="focus-status-${i}" data-status="none"></p>
          </div>
        </div>
        ${fold("Why this comes first", `<div class="inset">
          <p class="mini-label">Why this comes first</p>
          <p ${L}>${esc(f.why)}</p>
        </div>`)}
        ${basis(f.gap_ids, gaps, true)}
        ${f.steps.length ? `<fieldset class="checklist">
          <legend class="mini-label">What to do</legend>
          <ul role="list" ${L}>${f.steps.map((s, j) => `
            <li><label><input type="checkbox" id="focus-${i}-step-${j}" data-focus="${i}" data-step="${j}" aria-describedby="focus-status-${i}" disabled>
              <span>${esc(s)}</span></label></li>`).join("")}
          </ul>
          <p class="focus-card__next" id="focus-next-${i}" lang="en" hidden></p>
        </fieldset>
        <p class="field-error" id="focus-error-${i}" role="alert" hidden></p>` : ""}
        ${resource(f.resource, lang)}
      </li>`).join("")}
    </ol>
  </section>`;
}

/** One growth priority: priority, stage and statement id as quiet meta text, the statement, the engine's next steps. */
function gapItem(g: Gap): string {
  const steps = g.next_steps.flatMap((s) => s.split("\n")).map((s) => s.trim().replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const pr = g.priority.toLowerCase();
  return `<li class="gap gap--${esc(pr)}">
        <div class="gap__meta">
          <span class="badge badge--${esc(pr)}">${esc(g.priority)} priority</span>
          <span class="badge badge--stage">Stage ${g.stage}: ${esc(g.stage_name)}</span>
          <span class="chip">${esc(g.question_id)}</span>
        </div>
        <p class="gap__text">${esc(g.question_text)}</p>
        ${steps.length ? `<p class="label">Next steps</p><ul class="steps-list">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      </li>`;
}

/** Codecademy-style "take it again" callout with a client-generated calendar reminder. */
function reassessCallout(): string {
  return `<section class="reassess" aria-labelledby="reassess-title" data-no-print>
    <div>
      <h2 id="reassess-title">Take the assessment again in 90 days to see your progress</h2>
      <p>Work through your plan, then answer the same statements again. Your next report will show which growth priorities are now in place and how your stages changed.</p>
      <p class="hint">In this demo, progress compares only with assessments from the same sign-in.</p>
    </div>
    <button type="button" class="btn btn-secondary" id="reminder-btn">${icon("calendar-plus")}<span>Add a 90-day reminder to my calendar</span></button>
  </section>`;
}

/* ---------- Ask the Community Safety Fund for support (v0.8) ---------- */

const areaNames = (sub: Assessment, ids: string[]) =>
  ids.map((id) => sub.domains.find((d) => d.domain_id === id)?.domain_name ?? id);

/** Areas behind the "Start here" priorities: the domain of each focus gap id. */
function focusAreas(sub: Assessment): string[] {
  const byId = new Map(sub.gaps.map((g) => [g.question_id, g.domain_id]));
  const ids = (sub.report?.focus ?? []).flatMap((f) => f.gap_ids).map((id) => byId.get(id) ?? id.replace(/\d+$/, ""));
  return [...new Set(ids)];
}

function supportBody(sub: Assessment, editing: boolean): string {
  const s = sub.support;
  if (s && !editing) {
    return `<p class="support__sent" id="support-status" tabindex="-1">${icon("circle-check")}<span>Request sent on ${esc(s.requested_at)} for: ${esc(areaNames(sub, s.domain_ids).join(", "))}.</span></p>
      <button type="button" class="btn btn-secondary" id="support-edit">${icon("pencil")}<span>Update my request</span></button>`;
  }
  const chosen = s?.domain_ids ?? focusAreas(sub);
  return `<form id="support-form" novalidate>
    <fieldset id="support-fieldset" aria-describedby="support-hint">
      <legend class="mini-label">Which areas would you like help with?</legend>
      <p class="hint" id="support-hint">${s ? "Change the areas and send again. Your newest request replaces the old one." : chosen.length ? "We checked the areas of your top priorities. Change them if you like." : "Choose one or more areas."}</p>
      <p class="field-error" id="support-error" role="alert" hidden></p>
      <ul class="area-options" role="list">${sub.domains.map((d) => `
        <li><label class="choice">
          <input type="checkbox" name="support-area" value="${esc(d.domain_id)}" id="support-${esc(d.domain_id)}" ${chosen.includes(d.domain_id) ? "checked" : ""}>
          <span class="choice__text">${esc(d.domain_name)}</span>${icon("check", "choice__check")}
        </label></li>`).join("")}
      </ul>
    </fieldset>
    <div class="actions actions--start">
      <button type="submit" class="btn btn-primary">${icon("message")}<span>Send my request</span></button>
      ${s ? '<button type="button" class="btn btn-secondary" id="support-cancel">Cancel</button>' : ""}
    </div>
  </form>`;
}

function supportSection(sub: Assessment): string {
  return `<section class="section support" aria-labelledby="support-title" data-no-print>
    ${sectionHead("support-title", "Ask the Community Safety Fund for support", "Training and coaching", undefined, "en",
      "The Community Safety Fund plans its Community Training Institute trainings and coaching around what grantees ask for. We share only the areas you choose and your organization's name with Community Safety Fund staff.")}
    ${sub.support ? `<div class="card support__card" id="support-body">${supportBody(sub, false)}</div>`
      : fold("Choose areas and send a request", `<div class="card support__card" id="support-body">${supportBody(sub, true)}</div>`)}
  </section>`;
}

/** Support request form: POST /api/assessments/<id>/support {domain_ids}; 403 when this sign-in session did not submit it. */
export function wireSupport(sub: Assessment, root: ParentNode) {
  const body = root.querySelector<HTMLElement>("#support-body");
  if (!body) return;
  const show = (editing: boolean) => { body.innerHTML = supportBody(sub, editing); };
  const fail = (msg: string) => {
    const err = body.querySelector<HTMLElement>("#support-error")!;
    err.innerHTML = `${icon("alert")}<span>${esc(msg)}</span>`;
    err.hidden = false;
    body.querySelector("#support-fieldset")?.setAttribute("aria-describedby", "support-hint support-error");
  };
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#support-edit")) { show(true); body.querySelector<HTMLInputElement>("input[name=support-area]")?.focus(); }
    if (t.closest("#support-cancel")) { show(false); focusEl(body.querySelector("#support-status")); }
  });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const ids = $$<HTMLInputElement>("input[name=support-area]:checked", form).map((b) => b.value);
    if (!ids.length) { fail("Choose at least one area."); form.querySelector<HTMLInputElement>("input[name=support-area]")?.focus(); return; }
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.setAttribute("aria-disabled", "true");
    try {
      const res = await api.post<{ support: Support }>(`/assessments/${encodeURIComponent(sub.id)}/support`, { domain_ids: ids });
      sub.support = res.support;
      show(false);
      focusEl(body.querySelector("#support-status"));
      announce(`Request sent. Thank you. The Community Safety Fund will see your request for ${areaNames(sub, res.support.domain_ids).join(", ")}.`);
    } catch (ex) {
      btn.removeAttribute("aria-disabled");
      if (ex instanceof ApiError && ex.status === 403) fail("Only the person who submitted this assessment can send a request.");
      else if (ex instanceof ApiError && ex.status === 400) fail("Choose at least one area.");
      else fail(errorText(ex, "We could not send your request. Please try again."));
    }
  });
}

/* ---------- What we learned about you (v1.0 research sources) ---------- */

const KIND: Record<ResearchSource["kind"], [string, IconName]> = { website: ["Website", "globe"], social: ["Social media", "share"], news: ["News", "newspaper"] };

/** Same rule as report.research_line: how much the online research could personalize the plan. */
export function researchHeadline(research: NonNullable<V10["research"]>): string {
  const used = research.sources.filter((s) => s.used);
  const n = (k: ResearchSource["kind"]) => used.filter((s) => s.kind === k).length;
  const parts = [
    n("website") ? "your website" : "",
    n("social") ? plural(n("social"), "social page", "social pages") : "",
    n("news") ? plural(n("news"), "news story", "news stories") : "",
  ].filter(Boolean);
  if (!parts.length || research.strength === "none") return "We did not find much online, so this plan is based on your answers.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return research.strength === "limited" ? `We found a little online (${list}). Most of this plan comes from your answers.` : `Personalized from ${list}.`;
}

function researchSection(sub: Assessment): string {
  const res = v10(sub).research;
  if (!res || !Array.isArray(res.sources)) return "";
  // pipeline.write_report sets profile_withheld when the guardrail kept the website profile out of the report.
  const withheld = !!(sub.report as { profile_withheld?: boolean } | null)?.profile_withheld;
  const found = !withheld && res.strength !== "none" && res.sources.some((s) => s.used);
  const status = (s: ResearchSource) => (withheld ? "Not used this time" : s.used ? "Used for your plan" : "We could not read this one");
  return `<section class="section" aria-labelledby="learned-title">
    ${sectionHead("learned-title", "What we learned about you", "Personalized for you", undefined, "en", "", sourceTag("web"))}
    <div class="card learned">
      <p class="learned__headline">${icon(found ? "sprout" : "info")}<span>${esc(withheld ? "We could not use what we found online this time, so this plan is based on your answers." : researchHeadline(res))}</span></p>
      ${res.sources.length ? `<ul class="learned__sources" role="list">${res.sources.map((s) => `
        <li class="learned__source${s.used && !withheld ? "" : " is-unused"}">
          ${icon(KIND[s.kind]?.[1] ?? "globe")}
          <span><span class="learned__kind">${esc(KIND[s.kind]?.[0] ?? s.kind)}</span>
            <a href="${esc(safeUrl(s.url))}" rel="noopener">${esc(s.title || hostOf(s.url))}</a> <span class="url-domain">(${esc(hostOf(s.url))})</span>
            <span class="learned__status">${status(s)}</span></span>
        </li>`).join("")}
      </ul>` : ""}
      <p class="hint">We read public pages only to tailor your plan. What we find online never changes your scores.</p>
    </div>
  </section>`;
}

/* ---------- Connect me with similar groups (v1.0 peer connect, organization side) ---------- */

function peersBody(sub: Assessment, staff: boolean): string {
  const req = v10(sub).peer_request;
  if (req) {
    return `<p class="support__sent" id="peers-status" tabindex="-1">${icon("circle-check")}<span>${staff ? "This organization asked to be connected" : "Request sent"} on ${esc(req.requested_at)}. ${staff ? "" : "Community Safety Fund staff will reach out when they find a good match."}</span></p>`;
  }
  return `<p class="field-error" id="peers-error" role="alert" hidden></p>
    <button type="button" class="btn btn-primary" id="peers-btn">${icon("users")}<span>Ask to be connected</span></button>`;
}

function peersSection(sub: Assessment, staff: boolean): string {
  return `<section class="section peers" aria-labelledby="peers-title" data-no-print>
    ${sectionHead("peers-title", "Connect me with similar groups", "Learn from peers")}
    <div class="card peers__card">
      <div class="peers__intro">${icon("users", "peers__icon")}
        <div><p>The Community Safety Fund can introduce you to organizations like yours: a similar program model, a similar size, and the same growth priorities.</p>
        <p class="hint">Community Safety Fund staff make the match and share names only with consent from both groups. You will never see other organizations' results here.</p></div>
      </div>
      <div id="peers-body">${peersBody(sub, staff)}</div>
    </div>
  </section>`;
}

/** POST /api/assessments/<id>/peer-request (owner session only); shows "Request sent on <date>". */
export function wirePeers(sub: Assessment, root: ParentNode) {
  const body = root.querySelector<HTMLElement>("#peers-body");
  body?.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("#peers-btn");
    if (!btn || btn.getAttribute("aria-disabled") === "true") return;
    btn.setAttribute("aria-disabled", "true");
    try {
      const res = await api.post<{ peer_request: NonNullable<V10["peer_request"]> }>(`/assessments/${encodeURIComponent(sub.id)}/peer-request`);
      v10(sub).peer_request = res.peer_request;
      body.innerHTML = peersBody(sub, false);
      focusEl(body.querySelector("#peers-status"));
      announce("Request sent. The Community Safety Fund will reach out when they find a good match.");
    } catch (ex) {
      btn.removeAttribute("aria-disabled");
      const err = body.querySelector<HTMLElement>("#peers-error")!;
      err.innerHTML = `${icon("alert")}<span>${esc(ex instanceof ApiError && ex.status === 403
        ? "Only the person who submitted this assessment can ask to be connected."
        : errorText(ex, "We could not send your request. Please try again."))}</span>`;
      err.hidden = false;
    }
  });
}

/* ---------- Explore any area (deep dive on every assessed area) ---------- */

const HORIZON_LABEL: Record<number, string> = { 30: "Days 1 to 30", 60: "Days 31 to 60", 90: "Days 61 to 90" };
const IN_PLACE_SHOWN = 6;

/** One area: stage, what's in place (favorable statements), growth priorities with next steps, plan items that touch it. */
export function areaDetail(sub: Assessment, meta: Meta, id: string): string {
  const d = sub.domains.find((x) => x.domain_id === id);
  if (!d) return "";
  const lang = sub.language || "en";
  const info = meta.domains.find((m) => m.id === id);
  const names = [...meta.stages].sort((a, b) => a.n - b.n).map((s) => s.name);
  const dg = sub.gaps.filter((g) => g.domain_id === id);
  const gapIds = new Set(dg.map((g) => g.question_id));
  // Favorable = every statement of the area that is not a growth priority (the engine's own definition).
  const inPlace = (info?.questions ?? []).filter((q) => !gapIds.has(q.id));
  const r = sub.report;
  const items = [
    ...(r?.focus ?? []).map((f, i) => [`Start here, priority ${i + 1}`, f] as const),
    ...(r?.plan ?? []).map((p) => [HORIZON_LABEL[p.horizon] ?? "Plan", p] as const),
  ].filter(([, f]) => f.gap_ids.some((g) => gapIds.has(g)));
  const by = v10(sub).answered_by?.[id];
  const tick = (q: { text: string }) => `<li>${icon("circle-check")}<span>${esc(q.text)}</span></li>`;
  return `<div class="explore-area__head">
      <h3 id="explore-area-title" tabindex="-1">${esc(d.domain_name)}</h3>
      <span class="stage-pill">Current stage: ${esc(d.estimated_stage)}</span>
    </div>
    ${track(d, names)}
    <ul class="explore-facts" role="list">
      <li>${icon("circle-check")}<span><strong>${inPlace.length} of ${d.total_questions}</strong> statements in place</span></li>
      <li>${icon("sprout")}<span><strong>${dg.length ? plural(dg.length, "growth priority", "growth priorities") : "No growth priorities"}</strong></span></li>
      ${by ? `<li>${icon("user")}<span>Answered by: <strong>${esc(by)}</strong></span></li>` : ""}
    </ul>
    ${info ? `<details class="about"><summary>About ${esc(d.domain_name)}</summary><p>${esc(info.about)}</p>${info.connects ? `<p>${esc(info.connects)}</p>` : ""}</details>` : ""}
    <h4 class="explore-area__sub">What's already in place</h4>
    ${inPlace.length
      ? `<ul class="check-list explore-inplace" role="list" lang="en">${inPlace.slice(0, IN_PLACE_SHOWN).map(tick).join("")}</ul>
        ${inPlace.length > IN_PLACE_SHOWN ? `<details class="about"><summary>Show ${inPlace.length - IN_PLACE_SHOWN} more in place</summary><ul class="check-list explore-inplace" role="list" lang="en">${inPlace.slice(IN_PLACE_SHOWN).map(tick).join("")}</ul></details>` : ""}`
      : `<p class="hint">Nothing here is in place yet. That is a normal place to start, and every step from here counts.</p>`}
    <h4 class="explore-area__sub">Growth priorities and next steps</h4>
    ${dg.length
      ? `<ul class="gaps" role="list">${dg.slice(0, 3).map(gapItem).join("")}</ul>
        ${dg.length > 3 ? `<details class="about"><summary>Show ${plural(dg.length - 3, "more growth priority", "more growth priorities")}</summary><ul class="gaps" role="list">${dg.slice(3).map(gapItem).join("")}</ul></details>` : ""}`
      : `<p class="notice">${icon("circle-check")}<span>No growth priorities in this area. Your answers show these practices are in place.</span></p>`}
    ${r ? `<h4 class="explore-area__sub">In your plan</h4>
    ${items.length
      ? `<ul class="explore-plan" role="list">${items.map(([label, f]) => `<li><span class="mini-label mini-label--blue">${esc(label)}</span><span lang="${esc(lang)}">${esc(f.title)}</span></li>`).join("")}</ul>`
      : `<p>Your plan does not cover this area yet. That is on purpose: the plan starts with what unlocks the most. You can ask about it in "Chat about your report"${sub.status === "done" ? ", or ask the Community Safety Fund for support" : ""}.</p>`}` : ""}`;
}

function exploreSection(sub: Assessment, meta: Meta): string {
  if (!sub.domains.length) return "";
  const start = focusAreas(sub);
  const first = sub.domains.find((d) => !start.includes(d.domain_id)) ?? sub.domains[0];
  // With one assessed area there is nothing to pick: show its detail straight away.
  const one = sub.domains.length === 1;
  return `<section class="section" aria-labelledby="explore-title">
    ${sectionHead("explore-title", "Explore any area", "Deep dive", undefined, "en",
      one ? "See your stage, what is already in place, and what to work on next." : "Pick any area you assessed, not just the ones we pulled out for you. See your stage, what is already in place, and what to work on next.",
      sourceTag("answers", "From your answers"))}
    ${one ? "" : `<fieldset class="area-picker">
      <legend class="mini-label">Choose an area</legend>
      <ul class="area-picker__list" role="list">${sub.domains.map((d) => `
        <li><label class="area-chip">
          <input type="radio" name="explore-area" value="${esc(d.domain_id)}"${d.domain_id === first.domain_id ? " checked" : ""}>
          <span class="area-chip__text"><span class="area-chip__name">${esc(d.domain_name)}</span>
          <span class="area-chip__meta">${esc(d.estimated_stage)}${start.includes(d.domain_id) ? " · In Start here" : ""}</span></span>
        </label></li>`).join("")}
      </ul>
    </fieldset>`}
    <div class="card explore-area" id="explore-body" aria-labelledby="explore-area-title" role="region">${areaDetail(sub, meta, first.domain_id)}</div>
  </section>`;
}

/** Area picker: native radios (arrow keys move and select); the detail re-renders and the change is announced. */
export function wireExplore(sub: Assessment, meta: Meta, root: ParentNode) {
  const body = root.querySelector<HTMLElement>("#explore-body");
  root.querySelector(".area-picker")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (!body || input.name !== "explore-area") return;
    body.innerHTML = areaDetail(sub, meta, input.value);
    announce(`Showing ${sub.domains.find((d) => d.domain_id === input.value)?.domain_name ?? "area"}.`);
  });
}

/* ---------- Layers: "Your plan" first, then any area ---------- */

export const LAYERS = [
  ["plan", "Your plan", "Where to start", "target"],
  ["explore", "Explore any area", "Deep dive on one area", "search"],
] as const satisfies readonly (readonly [string, string, string, IconName])[];
export type Layer = (typeof LAYERS)[number][0];

function layered(panels: Record<Layer, string>, current: Layer): string {
  return `<div class="layers">
    <div class="layer-tabs" role="tablist" aria-label="Report views" data-no-print>${LAYERS.map(([key, label, hint, ic]) => `
      <button type="button" role="tab" class="layer-tab" id="tab-${key}" aria-controls="layer-${key}" aria-selected="${key === current}" tabindex="${key === current ? 0 : -1}">
        ${icon(ic, "layer-tab__icon")}<span class="layer-tab__text"><span class="layer-tab__label">${label}</span><span class="layer-tab__hint">${hint}</span></span>
      </button>`).join("")}
    </div>${LAYERS.map(([key, label]) => `
    <div class="layer" role="tabpanel" id="layer-${key}" aria-labelledby="tab-${key}" data-layer-title="${label}"${key === current ? "" : " hidden"}>${panels[key]}</div>`).join("")}
  </div>`;
}

/** ARIA tabs (automatic activation): arrows, Home, End; the URL hash (#plan, #explore) keeps the layer on reload. */
export function wireLayers(root: ParentNode) {
  const tabs = $$<HTMLButtonElement>('[role="tab"]', root as HTMLElement);
  const select = (tab: HTMLButtonElement, focus: boolean) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")!)!.hidden = !on;
    }
    if (focus) tab.focus();
    history.replaceState(null, "", `#${tab.id.slice(4)}`);
    tab.dispatchEvent(new CustomEvent("oci:layer", { bubbles: true }));
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (e) => {
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
  });
}

/** Everything below the status panel: two layers, then the feedback card and the chat (#32: scores live in the PDF). */
export function reportBody(sub: Assessment, meta: Meta, opts: { reminder: boolean; support: boolean; staff: boolean }): string {
  const lang = sub.language || "en";
  const gaps = new Map(sub.gaps.map((g) => [g.question_id, g]));
  const r = sub.report;
  const top: string[] = [];
  if (lang === "es") {
    top.push(`<p class="notice section-gap" lang="es">${icon("info")}<span>Las preguntas están en inglés; este informe se escribió en español.</span></p>`);
  }
  // The AI and scoring note lives in the ready panel (statusPanel), so it is said once.
  if (opts.staff) top.push(traceLinks(v10(sub).trace?.url, v10(sub).trace?.cloudwatch_url));

  // Layer 1: the short, conversational version. Order (#35, #36): summary, roadmap, Start here, ..., research last.
  const plan: string[] = [];
  if (r) {
    const paras = r.summary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`);
    plan.push(`<section class="section" aria-labelledby="truth-title">
      ${sectionHead("truth-title", "Summary about your organization", "In plain words", "summary", lang, "", sourceTag("ai"))}
      <div class="card truth"><div class="prose" id="truth-body" lang="${esc(lang)}">${paras[0] ?? ""}${paras.length > 1 ? fold(`Read the rest (${plural(paras.length - 1, "more paragraph", "more paragraphs")})`, paras.slice(1).join("")) : ""}</div></div>
    </section>`);
    const teaser = roadmapTeaser(sub);
    if (teaser) plan.push(`<section class="section" aria-labelledby="roadmap-title" id="roadmap-section">${sectionHead("roadmap-title", "Your 12-week roadmap", "A little each week", undefined, "en", "", sourceTag("answers"))}${teaser}</section>`);
    plan.push(focusSection(r.focus ?? [], gaps, lang), coachCard());
    if (opts.support) plan.push(supportSection(sub));
    if (!opts.staff || v10(sub).peer_request) plan.push(peersSection(sub, opts.staff));
    plan.push(optinSection(sub, opts.staff));
  } else if (sub.status === "done") {
    plan.push(`<p class="notice section-gap">${icon("info")}<span>AI recommendations were not generated for this synthetic seed record. Open "Explore any area" for the stage and growth priorities in each area.</span></p>`);
  } else {
    plan.push(`<p class="notice section-gap">${icon("clock")}<span>Your plan appears here when your recommendations are ready. While you wait, open "Explore any area".</span></p>`);
  }
  if (sub.status === "done" && opts.reminder) plan.push(reassessCallout());
  if (r) plan.push(researchSection(sub));

  const hash = location.hash.slice(1);
  const current: Layer = LAYERS.some(([k]) => k === hash) ? (hash as Layer) : r ? "plan" : "explore";
  const out = top.join("") + layered({ plan: plan.join(""), explore: exploreSection(sub, meta) }, current);
  // One "Does this feel right?" card for the whole report, under every layer (v1.7).
  const feedback = r ? feedbackSection(sub, opts.staff) : "";
  return sub.status === "done" ? `${out}${feedback}<div class="actions section-gap">${pdfButton(sub)}</div>${r ? coachChat(sub) : ""}` : out;
}

/* ---------- Behaviors ---------- */

/** Start-here checklists: each step is a task in roadmap weeks 1-2 (priority 1) and 3-4 (priority 2), so the roadmap
 *  is the only store. Steps of a week that has not opened are hidden, and one line says how many open next and when
 *  (#36); a viewer who may not use the roadmap (the API answers 403) sees every step without checkboxes. Announce the
 *  new count politely. */
export function wireChecklists(sub: Assessment, root: ParentNode, roadmap: Promise<Roadmap> | null) {
  const focus = sub.report?.focus ?? [];
  const boxes = $$<HTMLInputElement>("input[data-focus][data-step]", root);
  if (!boxes.length || !roadmap) return;
  const refresh = (i: number) => {
    const mine = boxes.filter((b) => Number(b.dataset.focus) === i);
    const done = mine.filter((b) => b.checked).length;
    const el = root.querySelector<HTMLElement>(`#focus-status-${i}`);
    if (el) {
      el.innerHTML = checklistStatus(done, mine.length);
      el.dataset.status = done === 0 ? "none" : done === mine.length ? "done" : "some";
    }
    return done;
  };
  const sync = (r: Roadmap) => {
    // Priority i owns focus weeks 2i+1 and 2i+2 (features/milestones.py build_roadmap); match its steps by text.
    const tasks = new Map(r.weeks.filter((w) => w.focus).flatMap((w) =>
      (w.tasks ?? []).map((t) => [`${Math.floor((w.n - 1) / 2)}:${t.text.trim().toLowerCase()}`, t] as const)));
    const next = new Map<number, { week: RoadmapWeek; n: number }>();
    boxes.forEach((box) => {
      const i = Number(box.dataset.focus), j = Number(box.dataset.step);
      const t = tasks.get(`${i}:${(focus[i]?.steps[j] ?? "").trim().toLowerCase()}`);
      box.dataset.task = t?.id ?? "";
      box.checked = !!t?.done;
      box.disabled = !t;
      // The server splits a priority's steps over its two weeks in order; a step of a locked week stays hidden.
      let k = j;
      const week = r.weeks.filter((w) => w.focus && Math.floor((w.n - 1) / 2) === i).find((w) => (k -= w.task_count) < 0);
      const locked = week?.state === "locked";
      box.closest("li")!.hidden = locked;
      if (locked && (next.get(i)?.week ?? week) === week) next.set(i, { week, n: (next.get(i)?.n ?? 0) + 1 });
    });
    focus.forEach((_, i) => {
      refresh(i);
      const el = root.querySelector<HTMLElement>(`#focus-next-${i}`);
      const nx = next.get(i);
      if (!el) return;
      el.hidden = !nx;
      const shown = boxes.some((b) => Number(b.dataset.focus) === i && !b.closest("li")!.hidden);
      el.innerHTML = nx ? `${icon("lock")}<span>${shown ? plural(nx.n, "more step opens", "more steps open") : plural(nx.n, "step opens", "steps open")} in week ${nx.week.n}, on ${esc(shortDate(nx.week.unlocks_on))} or sooner.</span>` : "";
    });
  };
  roadmap.then(sync).catch(() => boxes.forEach((box) => box.remove()));
  let chain = Promise.resolve();
  root.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.matches("input[data-focus][data-step]") || !box.dataset.task) return;
    const i = Number(box.dataset.focus), task = box.dataset.task, done = box.checked;
    const total = boxes.filter((b) => Number(b.dataset.focus) === i).length;
    announce(`Priority ${i + 1}: ${refresh(i)} of ${total} steps done.`);
    chain = chain.then(async () => {
      try {
        const hidden = () => boxes.filter((b) => b.closest("li")!.hidden).length, before = hidden();
        const r = await setRoadmapTask(sub.id, task, done);
        sync(r);
        fillRoadmapTeaser(root, r);
        const opened = before - hidden();
        if (opened > 0) announce(`${plural(opened, "new step is", "new steps are")} open in Start here.`);
        celebrateWeek(sub.id, r, box); // the same badge pop-up as /plan/ when this tick finished a week
      } catch (ex) {
        box.checked = !done;
        refresh(i);
        const err = root.querySelector<HTMLElement>(`#focus-error-${i}`);
        if (err) {
          err.innerHTML = `${icon("alert")}<span>${esc(errorText(ex, "We could not save that step. Please try again."))}</span>`;
          err.hidden = false;
        }
        return;
      }
      root.querySelector<HTMLElement>(`#focus-error-${i}`)?.setAttribute("hidden", "");
    });
  });
}

/** A signed-in viewer who did not submit this assessment (the roadmap answers 403) gets a notice instead of forms
 *  the server would refuse. Staff never get 403 here. */
export function wireOwnerOnly(root: ParentNode, roadmap: Promise<Roadmap> | null) {
  roadmap?.catch((ex) => {
    if (!(ex instanceof ApiError && ex.status === 403)) return;
    const note = (what: string) => `<p class="notice">${icon("info")}<span>Only the person who submitted this assessment can ${what}.</span></p>`;
    const form = root.querySelector("#support-form");
    if (form) form.outerHTML = note("send a request");
    root.querySelector("#support-edit")?.remove();
    const peers = root.querySelector("#peers-btn");
    if (peers) peers.outerHTML = note("ask to be connected");
  });
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Builds an all-day VEVENT 90 days after the report date. No external services. */
export function reminderIcs(sub: Assessment, siteUrl: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(sub.created);
  const base = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : now;
  const start = new Date(base.getTime() + 90 * 86400000);
  const end = new Date(start.getTime() + 86400000);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Everytown//OCI Capacity Coach//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:oci-retake-${sub.id}@oci-capacity-coach`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    "SUMMARY:Retake the OCI Capacity Coach assessment",
    `DESCRIPTION:${icsEscape(`Answer the same statements again to see your progress since ${sub.created.slice(0, 10)}. ${siteUrl}`)}`,
    `URL:${siteUrl}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

export function wireReminder(sub: Assessment, root: ParentNode) {
  root.querySelector<HTMLButtonElement>("#reminder-btn")?.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([reminderIcs(sub, `${location.origin}/`)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "oci-retake-reminder.ics";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Calendar reminder downloaded. Open the file to add it to your calendar.");
  });
}
