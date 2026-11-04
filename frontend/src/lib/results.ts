// HTML builders and small behaviors for the results page. Every API string goes through esc(); URLs through safeUrl().
import { api, ApiError, type Assessment, type Focus, type Gap, type Meta, type PlanItem, type Step, type Support } from "./api";
import { $$, announce, esc, focusEl, hostOf, plural, safeUrl } from "./dom";
import { coachBody } from "./coach";
import { icon, type IconName } from "./icons";
import { fillRoadmapTeaser, getRoadmap, roadmapTeaser, setRoadmapTask, type Roadmap } from "./roadmap";
import { traceLink } from "./staff-bi";

/** v1.0 document fields (all optional; older documents lack them). Kept local so api.ts stays conflict-free. */
export interface ResearchSource { kind: "website" | "social" | "news"; url: string; title: string; used: boolean }
export interface V10 {
  respondent?: { name?: string | null; title?: string | null; role?: string | null } | null;
  research?: { strength: "rich" | "some" | "limited" | "none"; sources: ResearchSource[] } | null;
  answered_by?: Record<string, string> | null;
  peer_request?: { requested_at: string } | null;
  /** v1.1: the AI trace of the latest run (staff only; the API strips it for organizations). */
  trace?: { trace_id: string; project: string; url: string | null } | null;
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

const pct = (n: number) => `${Math.round(n)}%`;

export const pdfUrl = (sub: Assessment) => `/api/assessments/${encodeURIComponent(sub.id)}/report.pdf`;
export function pdfButton(sub: Assessment): string {
  const size = sub.pdf_kb ? `PDF, ${sub.pdf_kb} KB` : "PDF";
  return `<a class="btn btn-primary" href="${pdfUrl(sub)}" download>${icon("download")}<span>Download PDF report (${size})</span></a>`;
}

/** Read-aloud button for one report section; listen.ts plays it with Amazon Polly. */
function listen(section: "summary" | "focus" | "plan" | "strengths" | "conversation", lang: string): string {
  return `<button type="button" class="btn btn-ghost btn-sm btn-listen" data-listen="${section}" data-lang="${esc(lang)}" aria-pressed="false">
    <span class="btn-listen__play">${icon("volume")}<span>Listen</span></span>
    <span class="btn-listen__stop">${icon("stop")}<span>Stop</span></span>
  </button>`;
}

function sectionHead(id: string, title: string, eyebrow: string, listenSection?: Parameters<typeof listen>[0], lang = "en", lead = ""): string {
  return `<div class="section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="${id}">${esc(title)}</h2></div>${listenSection ? listen(listenSection, lang) : ""}</div>${lead ? `<p class="section-lead">${lead}</p>` : ""}`;
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
    return `<section class="panel panel--ready" aria-labelledby="ready">
      <h2 id="ready" tabindex="-1">${icon("circle-check")}Your report is ready</h2>
      <p>Read what's true about you, then start with your top ${sub.report?.focus?.length === 1 ? "priority" : "priorities"}. Share the PDF with your team to talk it through together.</p>
    </section>`;
  }
  const failed = sub.steps.find((s) => s.state === "error");
  const isError = sub.status === "error";
  return `<section class="panel ${isError ? "panel--error" : ""}" id="processing" aria-labelledby="processing-title" aria-busy="${isError ? "false" : "true"}" data-no-print>
    ${isError
      ? `<h2 id="processing-title" tabindex="-1">${icon("alert")}We could not finish your recommendations</h2>
         <p>${failed ? `The step "${esc(failed.label)}" did not finish. ` : ""}Your answers and stages are saved. You do not need to answer the questions again.</p>
         ${sub.error ? `<p class="hint">Details: ${esc(sub.error)}</p>` : ""}`
      : `<h2 id="processing-title" tabindex="-1">${icon("loader", "spin")}Building your recommendations</h2>
         <p>This usually takes under a minute. Your stages are ready now, below. You can read them while you wait.</p>`}
    <ol class="step-list" role="list" id="step-list">${stepItems(sub.steps)}</ol>
    ${isError ? `<p class="field-error" id="retry-error" role="alert" hidden></p>
      <button type="button" class="btn btn-primary" id="retry-btn">${icon("refresh")}<span>Try again</span></button>` : ""}
  </section>`;
}

/* ---------- Where you are today: stage tracks (Stitch) + accessible table ---------- */

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

export function stagesSection(sub: Assessment, meta: Meta): string {
  const stages = [...meta.stages].sort((a, b) => a.n - b.n);
  const names = stages.map((s) => s.name);
  const tracks = sub.domains.map((d) => {
    const desc = stages[names.indexOf(d.estimated_stage)]?.description;
    return `<li class="card track-card">
      <div class="track-card__head">
        <h3>${esc(d.domain_name)}</h3>
        <span class="stage-pill">Current stage: ${esc(d.estimated_stage)}</span>
      </div>
      ${track(d, names)}
      ${desc ? `<p class="track-card__desc"><strong>${esc(d.estimated_stage)}:</strong> ${esc(desc)}</p>` : ""}
    </li>`;
  }).join("");
  const o = sub.overall;
  return `<section class="section" aria-labelledby="stages-title">
    ${sectionHead("stages-title", "Where you are today", "Your stages", undefined, "en",
      `Each area has five stages, from ${esc(names[0] ?? "Seeding")} to ${esc(names[names.length - 1] ?? "Transformational")}. Your stage is the highest one where every statement is already in place. Every stage is a normal place to be.`)}
    <ul class="tracks" role="list">${tracks}</ul>
    <div class="table-wrap" role="region" aria-labelledby="scores-caption" tabindex="0">
      <table>
        <caption id="scores-caption">Capacity by area. Stages are estimated from your answers by a fixed scoring method.</caption>
        <thead><tr><th scope="col">Area</th><th scope="col">Estimated stage</th><th scope="col" class="num">Capacity</th><th scope="col" class="num">Growth priorities</th><th scope="col" class="num">High priority</th></tr></thead>
        <tbody>${sub.domains.map((d) => `<tr><th scope="row">${esc(d.domain_name)}</th><td>${esc(d.estimated_stage)}</td><td class="num">${pct(d.score_pct)}</td><td class="num">${d.gap_count} of ${d.total_questions}</td><td class="num">${d.high_count}</td></tr>`).join("")}</tbody>
        ${o ? `<tfoot><tr><th scope="row">All areas</th><td></td><td class="num">${pct(o.favorable_pct)}</td><td class="num">${o.total_gaps} of ${o.total_questions}</td><td class="num">${o.high}</td></tr></tfoot>` : ""}
      </table>
    </div>
  </section>`;
}

export function progressSection(sub: Assessment): string {
  const p = sub.progress;
  if (!p) return "";
  const closed = p.closed ?? [], fresh = p.new ?? [], moves = p.stages ?? [];
  const changed = moves.filter((m) => m.from !== m.to);
  const item = (g: { id: string; text: string }) => `<li><span class="chip">${esc(g.id)}</span> ${esc(g.text)}</li>`;
  let body: string;
  if (!closed.length && !fresh.length && !changed.length) {
    body = `<p class="notice">${icon("info")}<span>Your answers match your assessment on ${esc(p.previous_created)}.</span></p>`;
  } else {
    body = `<ul class="stat-grid" role="list">
        <li class="card stat">${icon("circle-check")}<span><span class="stat__num">${closed.length}</span><span class="stat__label">growth ${closed.length === 1 ? "priority" : "priorities"} closed</span></span></li>
        <li class="card stat">${icon("flag")}<span><span class="stat__num">${fresh.length}</span><span class="stat__label">new</span></span></li>
      </ul>
      ${moves.length ? `<h3>Stage changes by area</h3>
      <ul class="stage-moves" role="list">${moves.map((m) => m.from === m.to
        ? `<li class="stage-move is-same"><span class="stage-move__name">${esc(m.domain_name)}</span><span class="stage-move__change">${esc(m.to)}: No change</span></li>`
        : `<li class="stage-move"><span class="stage-move__name">${esc(m.domain_name)}</span><span class="stage-move__change">${esc(m.from)} ${icon("arrow-right")}<span class="visually-hidden"> to </span> ${esc(m.to)}</span></li>`).join("")}
      </ul>` : ""}
      ${closed.length ? `<details class="about"><summary>Show closed growth priorities (${closed.length})</summary><ul>${closed.map(item).join("")}</ul></details>` : ""}
      ${fresh.length ? `<details class="about"><summary>Show new growth priorities (${fresh.length})</summary><ul>${fresh.map(item).join("")}</ul></details>` : ""}`;
  }
  return `<section class="section" aria-labelledby="progress-title">
    ${sectionHead("progress-title", `Progress since your last assessment (${p.previous_created})`, "Your progress")}
    ${body}
    <p class="hint">Progress compares with earlier assessments from this sign-in session (demo shortcut).</p>
    ${p.previous_id ? `<p><a href="/results/?id=${encodeURIComponent(p.previous_id)}">View previous report</a></p>` : ""}
  </section>`;
}

/* ---------- AI sections ---------- */

/** "Based on your answers": real statement text from the question bank (English even in a Spanish report). */
function basis(ids: string[], gaps: Map<string, Gap>, open = false): string {
  if (!ids.length) return "";
  const rows = ids.map((id) => `<li>${icon("flag")}<span><span class="chip">${esc(id)}</span> ${esc(gaps.get(id)?.question_text ?? "Statement not found")}</span></li>`).join("");
  return `<div class="basis" lang="en">
    ${open
      ? `<p class="mini-label">Based on your answers</p><ul class="basis__list" role="list">${rows}</ul>`
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

function focusSection(items: Focus[], gaps: Map<string, Gap>, lang: string): string {
  if (!items.length) return "";
  const L = `lang="${esc(lang)}"`;
  return `<section class="section" aria-labelledby="focus-title">
    ${sectionHead("focus-title", "Start here: your top priorities", "Do these first", "focus", lang,
      `Do not try to fix everything at once. Out of everything you could work on, ${items.length === 1 ? "this is the one priority" : "these are the two priorities"} to start with. These steps are weeks 1 to ${items.length * 2} of your 12-week roadmap: check them off here or there, and each week's steps open in turn.`)}
    <ol class="focus-list" id="focus-body" role="list">${items.map((f, i) => `
      <li class="card focus-card" data-focus="${i}">
        <div class="focus-card__head">
          <span class="focus-card__num" aria-hidden="true">${i + 1}</span>
          <div>
            <h3><span class="visually-hidden">Priority ${i + 1}: </span><span ${L}>${esc(f.title)}</span></h3>
            <p class="focus-card__status" id="focus-status-${i}" data-status="none"></p>
          </div>
        </div>
        <div class="inset">
          <p class="mini-label">Why this comes first</p>
          <p ${L}>${esc(f.why)}</p>
        </div>
        ${basis(f.gap_ids, gaps, true)}
        ${f.steps.length ? `<fieldset class="checklist">
          <legend class="mini-label">What to do</legend>
          <ul role="list" ${L}>${f.steps.map((s, j) => `
            <li><input type="checkbox" id="focus-${i}-step-${j}" data-focus="${i}" data-step="${j}" aria-describedby="focus-status-${i}" disabled>
              <label for="focus-${i}-step-${j}">${esc(s)}</label></li>`).join("")}
          </ul>
        </fieldset>` : ""}
        ${resource(f.resource, lang)}
      </li>`).join("")}
    </ol>
  </section>`;
}

function planSection(plan: PlanItem[], gaps: Map<string, Gap>, lang: string): string {
  const L = `lang="${esc(lang)}"`;
  const groups: [30 | 60 | 90, string, string, Parameters<typeof icon>[0]][] = [
    [30, "Days 1 to 30", "First 30 days", "flag"], [60, "Days 31 to 60", "Next 30 days", "clock"], [90, "Days 61 to 90", "Last 30 days", "trending"],
  ];
  const cards = groups.map(([h, range, title, ic]) => {
    const items = plan.filter((p) => p.horizon === h);
    if (!items.length) return "";
    return `<li class="card horizon-card">
      <div class="horizon-card__head">
        <div><span class="mini-label mini-label--blue">${range}</span><h3>${title}</h3></div>${icon(ic, "horizon-card__icon")}
      </div>
      <ul class="actions-list" role="list">${items.map((a) => `
        <li class="action">
          <div class="action__head">
            <h4 ${L}>${esc(a.title)}</h4>
            ${a.owner ? `<span class="role-chip">${icon("user")}<span class="visually-hidden">Owner: </span><span ${L}>${esc(a.owner)}</span></span>` : ""}
          </div>
          <p ${L}>${esc(a.why)}</p>
          ${a.steps.length ? `<ol class="steps-list" ${L}>${a.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
          ${basis(a.gap_ids, gaps)}
          ${resource(a.resource, lang)}
        </li>`).join("")}
      </ul>
    </li>`;
  }).join("");
  if (!cards) return "";
  return `<section class="section" aria-labelledby="plan-title">
    ${sectionHead("plan-title", "30 / 60 / 90 day plan", "Your next 90 days", "plan", lang, "A realistic order for a small team over the next three months.")}
    <ol class="horizons" id="plan-body" role="list">${cards}</ol>
  </section>`;
}

/** One growth priority: priority and stage badges, statement, the engine's next steps. */
function gapItem(g: Gap): string {
  const steps = g.next_steps.flatMap((s) => s.split("\n")).map((s) => s.trim().replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const pr = g.priority.toLowerCase();
  return `<li class="gap gap--${esc(pr)}">
        <div class="gap__meta">
          <span class="badge badge--${esc(pr)}">${pr === "high" ? icon("flag") : ""}${esc(g.priority)} priority</span>
          <span class="badge badge--stage">Stage ${g.stage}: ${esc(g.stage_name)}</span>
          <span class="chip">${esc(g.question_id)}</span>
        </div>
        <p class="gap__text">${esc(g.question_text)}</p>
        ${steps.length ? `<p class="label">Next steps</p><ul class="steps-list">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      </li>`;
}

function gapsSection(sub: Assessment, meta: Meta): string {
  const body = sub.domains.map((d) => {
    const dg = sub.gaps.filter((g) => g.domain_id === d.domain_id);
    const info = meta.domains.find((m) => m.id === d.domain_id);
    const list = dg.length ? `<ul class="gaps" role="list">${dg.map((g) => gapItem(g)).join("")}</ul>`
      : `<p class="notice">${icon("circle-check")}<span>No growth priorities in this area. Your answers show these practices are in place.</span></p>`;
    return `<section class="gap-domain" aria-labelledby="gaps-${esc(d.domain_id)}">
      <h3 id="gaps-${esc(d.domain_id)}">${esc(d.domain_name)} <span class="count">${plural(dg.length, "growth priority", "growth priorities")}</span></h3>
      ${info ? `<details class="about"><summary>About ${esc(d.domain_name)}</summary><p>${esc(info.about)}</p>${info.connects ? `<p>${esc(info.connects)}</p>` : ""}</details>` : ""}
      ${list}
    </section>`;
  }).join("");
  return `<section class="section" aria-labelledby="gaps-title">
    ${sectionHead("gaps-title", "All growth priorities", "Everything you could work on", undefined, "en",
      "These are the statements you answered in a way that points to room to grow, ordered by priority within each area. Priority comes from the fixed scoring method.")}
    ${body}
  </section>`;
}

/** Codecademy-style "take it again" callout with a client-generated calendar reminder. */
function reassessCallout(): string {
  return `<section class="reassess" aria-labelledby="reassess-title" data-no-print>
    <div>
      <h2 id="reassess-title">Take the assessment again in 90 days to see your progress</h2>
      <p>Work through your plan, then answer the same statements again. Your next report will show which growth priorities you closed and how your stages changed.</p>
      <p class="hint">Progress compares with earlier assessments from this sign-in session (demo shortcut).</p>
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
      <p class="hint" id="support-hint">${s ? "Change the areas and send again. Your newest request replaces the old one." : "We checked the areas of your top priorities. Change them if you like."}</p>
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
      "The Everytown Community Safety Fund plans its Community Training Institute trainings and coaching around what grantees ask for. Choose the areas where your team would like help. We share only the areas you choose and your organization's name with Community Safety Fund staff.")}
    <div class="card support__card" id="support-body">${supportBody(sub, !sub.support)}</div>
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
      else fail("We could not send your request. Please try again.");
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
  const found = res.strength !== "none" && res.sources.some((s) => s.used);
  return `<section class="section" aria-labelledby="learned-title">
    ${sectionHead("learned-title", "What we learned about you", "Personalized for you")}
    <div class="card learned">
      <p class="learned__headline">${icon(found ? "sprout" : "info")}<span>${esc(researchHeadline(res))}</span></p>
      ${res.sources.length ? `<ul class="learned__sources" role="list">${res.sources.map((s) => `
        <li class="learned__source${s.used ? "" : " is-unused"}">
          ${icon(KIND[s.kind]?.[1] ?? "globe")}
          <span><span class="learned__kind">${esc(KIND[s.kind]?.[0] ?? s.kind)}</span>
            <a href="${esc(safeUrl(s.url))}" rel="noopener">${esc(s.title || hostOf(s.url))}</a> <span class="url-domain">(${esc(hostOf(s.url))})</span>
            <span class="learned__status">${s.used ? "Used for your plan" : "We could not read this one"}</span></span>
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
    <button type="button" class="btn btn-primary" id="peers-btn">${icon("users")}<span>Ask CSF to connect me</span></button>`;
}

function peersSection(sub: Assessment, staff: boolean): string {
  return `<section class="section peers" aria-labelledby="peers-title" data-no-print>
    ${sectionHead("peers-title", "Connect me with similar groups", "Learn from peers")}
    <div class="card peers__card">
      <div class="peers__intro">${icon("users", "peers__icon")}
        <div><p>The Community Safety Fund can introduce you to organizations like yours: a similar program model, a similar size, and the same growth priorities.</p>
        <p class="hint">Community Safety Fund staff make the match. They share names only with consent, from both groups. You will never see other organizations' results here.</p></div>
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
        : "We could not send your request. Please try again.")}</span>`;
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
      <li>${icon("flag")}<span><strong>${plural(dg.length, "growth priority", "growth priorities")}</strong>${d.high_count ? `, ${d.high_count} high` : ""}</span></li>
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
      : `<p>Your plan does not cover this area yet. That is on purpose: the plan starts with what unlocks the most. You can ask about it in "Ask about your report"${sub.status === "done" ? ", or ask the Community Safety Fund for support" : ""}.</p>`}` : ""}`;
}

function exploreSection(sub: Assessment, meta: Meta): string {
  if (!sub.domains.length) return "";
  const start = focusAreas(sub);
  const first = sub.domains.find((d) => !start.includes(d.domain_id)) ?? sub.domains[0];
  return `<section class="section" aria-labelledby="explore-title">
    ${sectionHead("explore-title", "Explore any area", "Deep dive", undefined, "en",
      "Pick any area you assessed, not just the ones we pulled out for you. See your stage, what is already in place, and what to work on next.")}
    <fieldset class="area-picker">
      <legend class="mini-label">Choose an area</legend>
      <ul class="area-picker__list" role="list">${sub.domains.map((d) => `
        <li><label class="area-chip">
          <input type="radio" name="explore-area" value="${esc(d.domain_id)}"${d.domain_id === first.domain_id ? " checked" : ""}>
          <span class="area-chip__text"><span class="area-chip__name">${esc(d.domain_name)}</span>
          <span class="area-chip__meta">${esc(d.estimated_stage)}${start.includes(d.domain_id) ? " · In Start here" : ""}</span></span>
        </label></li>`).join("")}
      </ul>
    </fieldset>
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

/* ---------- Layers: "Your plan" first, then any area, then all the numbers ---------- */

export const LAYERS = [
  ["plan", "Your plan", "Where to start", "target"],
  ["explore", "Explore any area", "Deep dive on one area", "search"],
  ["details", "Your results in detail", "Stages, scores, full plan", "layers"],
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

/** ARIA tabs (automatic activation): arrows, Home, End; the URL hash (#plan, #explore, #details) keeps the layer on reload. */
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

/** Everything below the status panel: three layers, in the order the Everytown rep asked for. */
export function reportBody(sub: Assessment, meta: Meta, opts: { reminder: boolean; support: boolean; staff: boolean }): string {
  const lang = sub.language || "en";
  const gaps = new Map(sub.gaps.map((g) => [g.question_id, g]));
  const r = sub.report;
  const top: string[] = [];
  if (lang === "es") {
    top.push(`<p class="notice section-gap" lang="es">${icon("info")}<span>Las preguntas están en inglés; este informe se escribió en español.</span></p>`);
  }
  if (r) top.push(`<p class="notice section-gap">${icon("info")}<span>Recommendations generated with AI from your answers and the CVI resource library. Scores are calculated by a fixed scoring method. Please review them with your team before acting.</span></p>`);
  if (opts.staff) top.push(traceLink(v10(sub).trace?.url));

  // Layer 1: the short, conversational version.
  const plan: string[] = [];
  if (r) {
    plan.push(`<section class="section" aria-labelledby="truth-title">
      ${sectionHead("truth-title", "What's true about you", "In plain words", "summary", lang)}
      <div class="card truth"><div class="prose" id="truth-body" lang="${esc(lang)}">${r.summary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        ${r.reading_grade != null ? `<details class="about reading-level"><summary>Reading level: about grade ${Math.round(r.reading_grade)}</summary><p>Measured by a fixed formula (Flesch-Kincaid). We aim for grade 8 or lower.</p></details>` : ""}</div>
    </section>`);
    plan.push(researchSection(sub), focusSection(r.focus ?? [], gaps, lang));
    const teaser = roadmapTeaser(sub);
    if (teaser) plan.push(`<section class="section" aria-labelledby="roadmap-title" id="roadmap-section">${sectionHead("roadmap-title", "Your 12-week roadmap", "A little each week")}${teaser}</section>`);
    plan.push(`<section class="section coach" aria-labelledby="coach-title" data-no-print>
      ${sectionHead("coach-title", "Ask about your report", "Questions and answers", undefined, "en", "Ask a question in your own words, like you would ask a coach. Answers are written with AI, so check them with your team.")}
      ${coachBody(sub)}
    </section>`);
    if (opts.support) plan.push(supportSection(sub));
    if (!opts.staff || v10(sub).peer_request) plan.push(peersSection(sub, opts.staff));
  } else if (sub.status === "done") {
    plan.push(`<p class="notice section-gap">${icon("info")}<span>AI recommendations were not generated for this synthetic seed record. Open "Explore any area" or "Your results in detail" for the stages and growth priorities.</span></p>`);
  } else {
    plan.push(`<p class="notice section-gap">${icon("clock")}<span>Your plan appears here when your recommendations are ready. Your stages are ready now in "Your results in detail".</span></p>`);
  }
  if (sub.status === "done" && opts.reminder) plan.push(reassessCallout());

  // Layer 3: every number behind the plan.
  const details: string[] = [stagesSection(sub, meta), progressSection(sub)];
  if (r) {
    details.push(planSection(r.plan ?? [], gaps, lang));
    if (r.strengths?.length) {
      details.push(`<section class="section" aria-labelledby="strengths-title">
        ${sectionHead("strengths-title", "What you already do well", "Your strengths", "strengths", lang)}
        <ul class="check-list prose" id="strengths-body" lang="${esc(lang)}" role="list">${r.strengths.map((s) => `<li>${icon("circle-check")}<span>${esc(s)}</span></li>`).join("")}</ul>
      </section>`);
    }
    if (r.conversation?.length) {
      details.push(`<section class="section" aria-labelledby="conversation-title">
        ${sectionHead("conversation-title", "Team conversation guide", "Talk it through", "conversation", lang, "Use these questions at your next team or board meeting.")}
        <ol class="prose conversation" id="conversation-body" lang="${esc(lang)}">${r.conversation.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
      </section>`);
    }
  }
  details.push(gapsSection(sub, meta));
  if (r?.sources?.length) {
    details.push(`<section class="section" aria-labelledby="sources-title">
      ${sectionHead("sources-title", "Sources consulted", "Where this comes from")}
      <ul class="sources" lang="${esc(lang)}">${r.sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" rel="noopener">${esc(s.title)}</a> <span class="url-domain">(${esc(hostOf(s.url))})</span></li>`).join("")}</ul>
    </section>`);
  }

  const hash = location.hash.slice(1);
  const current: Layer = LAYERS.some(([k]) => k === hash) ? (hash as Layer) : r ? "plan" : "details";
  const out = top.join("") + layered({ plan: plan.join(""), explore: exploreSection(sub, meta), details: details.join("") }, current);
  return sub.status === "done" ? `${out}<div class="actions section-gap">${pdfButton(sub)}</div>` : out;
}

/* ---------- Behaviors ---------- */

/** Start-here checklists: each step is a task in roadmap weeks 1-2 (priority 1) and 3-4 (priority 2), so the roadmap
 *  is the only store. Steps of a week that has not opened stay disabled; a viewer who may not use the roadmap
 *  (the API answers 403) sees the steps without checkboxes. Announce the new count politely. */
export function wireChecklists(sub: Assessment, root: ParentNode) {
  const focus = sub.report?.focus ?? [];
  const boxes = $$<HTMLInputElement>("input[data-focus][data-step]", root);
  if (!boxes.length) return;
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
    boxes.forEach((box) => {
      const i = Number(box.dataset.focus), j = Number(box.dataset.step);
      const t = tasks.get(`${i}:${(focus[i]?.steps[j] ?? "").trim().toLowerCase()}`);
      box.dataset.task = t?.id ?? "";
      box.checked = !!t?.done;
      box.disabled = !t;
    });
    focus.forEach((_, i) => refresh(i));
  };
  getRoadmap(sub.id).then(sync).catch(() => boxes.forEach((box) => box.remove()));
  let chain = Promise.resolve();
  root.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.matches("input[data-focus][data-step]") || !box.dataset.task) return;
    const i = Number(box.dataset.focus), task = box.dataset.task, done = box.checked;
    const total = boxes.filter((b) => Number(b.dataset.focus) === i).length;
    announce(`Priority ${i + 1}: ${refresh(i)} of ${total} steps done.`);
    chain = chain.then(async () => {
      try {
        const r = await setRoadmapTask(sub.id, task, done);
        sync(r);
        fillRoadmapTeaser(root, r);
      } catch (ex) {
        box.checked = !done;
        refresh(i);
        announce(ex instanceof ApiError ? ex.message : "We could not save that. Please try again.");
      }
    });
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
