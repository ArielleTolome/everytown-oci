// HTML builders and small behaviors for the results page. Every API string goes through esc(); URLs through safeUrl().
import { api, ApiError, type Assessment, type Focus, type Gap, type Meta, type PlanItem, type Step, type Support } from "./api";
import { $$, announce, esc, focusEl, hostOf, plural, safeUrl } from "./dom";
import { icon } from "./icons";

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

function listen(target: string, lang: string): string {
  return `<button type="button" class="btn btn-ghost btn-sm btn-listen" data-listen="${target}" data-lang="${esc(lang)}" aria-pressed="false" hidden>
    <span class="btn-listen__play">${icon("volume")}<span>Listen</span></span>
    <span class="btn-listen__stop">${icon("stop")}<span>Stop</span></span>
  </button>`;
}

function sectionHead(id: string, title: string, eyebrow: string, listenTarget?: string, lang = "en", lead = ""): string {
  return `<div class="section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="${id}">${esc(title)}</h2></div>${listenTarget ? listen(listenTarget, lang) : ""}</div>${lead ? `<p class="section-lead">${lead}</p>` : ""}`;
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

export function stagesSection(sub: Assessment, meta: Meta): string {
  const stages = [...meta.stages].sort((a, b) => a.n - b.n);
  const names = stages.map((s) => s.name);
  const tracks = sub.domains.map((d) => {
    const cur = names.indexOf(d.estimated_stage);
    const desc = stages[cur]?.description;
    return `<li class="card track-card">
      <div class="track-card__head">
        <h3>${esc(d.domain_name)}</h3>
        <span class="stage-pill">Current stage: ${esc(d.estimated_stage)}</span>
      </div>
      <ol class="track" role="list" aria-label="${esc(d.domain_name)}: five stages">${names.map((st, i) => `
        <li class="track__step${i <= cur ? " is-filled" : ""}${i === cur ? " is-current" : ""}"${i === cur ? ' aria-current="step"' : ""}>
          <span class="track__bar" aria-hidden="true"></span>
          <span class="track__label"><span class="track__full">${esc(st)}</span><span class="track__short" aria-hidden="true">${i + 1}</span>${i === cur ? '<span class="visually-hidden"> (current stage)</span>' : ""}</span>
        </li>`).join("")}
      </ol>
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
    ${sectionHead("focus-title", "Start here: your top priorities", "Do these first", "#focus-body", lang,
      `Do not try to fix everything at once. Out of everything you could work on, ${items.length === 1 ? "this is the one priority" : "these are the two priorities"} to start with. Check off steps as you go; your checks are saved on this device.`)}
    <ol class="focus-list" id="focus-body" role="list">${items.map((f, i) => `
      <li class="card focus-card" data-focus="${i}">
        <div class="focus-card__head">
          <span class="focus-card__num" aria-hidden="true">${i + 1}</span>
          <div>
            <h3><span class="visually-hidden">Priority ${i + 1}: </span><span ${L}>${esc(f.title)}</span></h3>
            <p class="focus-card__status" id="focus-status-${i}" data-status="none">${checklistStatus(0, f.steps.length)}</p>
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
            <li><input type="checkbox" id="focus-${i}-step-${j}" data-focus="${i}" data-step="${j}" aria-describedby="focus-status-${i}">
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
    ${sectionHead("plan-title", "30 / 60 / 90 day plan", "Your plan", "#plan-body", lang, "A realistic order for a small team over the next three months.")}
    <ol class="horizons" id="plan-body" role="list">${cards}</ol>
  </section>`;
}

function gapsSection(sub: Assessment, meta: Meta): string {
  const body = sub.domains.map((d) => {
    const dg = sub.gaps.filter((g) => g.domain_id === d.domain_id);
    const info = meta.domains.find((m) => m.id === d.domain_id);
    const list = dg.length ? `<ul class="gaps" role="list">${dg.map((g) => {
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
    }).join("")}</ul>`
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

/** Everything below the status panel, in the order the Everytown rep asked for. */
export function reportBody(sub: Assessment, meta: Meta, opts: { reminder: boolean; support: boolean }): string {
  const lang = sub.language || "en";
  const gaps = new Map(sub.gaps.map((g) => [g.question_id, g]));
  const r = sub.report;
  const parts: string[] = [];
  if (lang === "es") {
    parts.push(`<p class="notice section-gap" lang="es">${icon("info")}<span>Las preguntas están en inglés; este informe se escribió en español.</span></p>`);
  }
  if (r) {
    parts.push(`<p class="notice section-gap">${icon("info")}<span>Recommendations generated with AI from your answers and the CVI resource library. Scores are calculated by a fixed scoring method. Please review them with your team before acting.</span></p>`);
    parts.push(`<section class="section" aria-labelledby="truth-title">
      ${sectionHead("truth-title", "What's true about you", "In plain words", "#truth-body", lang)}
      <div class="card truth"><div class="prose" id="truth-body" lang="${esc(lang)}">${r.summary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}</div></div>
    </section>`);
    parts.push(focusSection(r.focus ?? [], gaps, lang));
  } else if (sub.status === "done") {
    parts.push(`<p class="notice section-gap">${icon("info")}<span>AI recommendations were not generated for this synthetic seed record.</span></p>`);
  }
  parts.push(stagesSection(sub, meta), progressSection(sub));
  if (r) {
    parts.push(planSection(r.plan ?? [], gaps, lang));
    if (r.strengths?.length) {
      parts.push(`<section class="section" aria-labelledby="strengths-title">
        ${sectionHead("strengths-title", "What you already do well", "Your strengths", "#strengths-body", lang)}
        <ul class="check-list prose" id="strengths-body" lang="${esc(lang)}" role="list">${r.strengths.map((s) => `<li>${icon("circle-check")}<span>${esc(s)}</span></li>`).join("")}</ul>
      </section>`);
    }
    if (r.conversation?.length) {
      parts.push(`<section class="section" aria-labelledby="conversation-title">
        ${sectionHead("conversation-title", "Team conversation guide", "Talk it through", "#conversation-body", lang, "Use these questions at your next team or board meeting.")}
        <ol class="prose conversation" id="conversation-body" lang="${esc(lang)}">${r.conversation.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
      </section>`);
    }
  }
  parts.push(gapsSection(sub, meta));
  if (opts.support) parts.push(supportSection(sub));
  if (r?.sources?.length) {
    parts.push(`<section class="section" aria-labelledby="sources-title">
      ${sectionHead("sources-title", "Sources consulted", "Where this comes from")}
      <ul class="sources" lang="${esc(lang)}">${r.sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" rel="noopener">${esc(s.title)}</a> <span class="url-domain">(${esc(hostOf(s.url))})</span></li>`).join("")}</ul>
    </section>`);
  }
  if (sub.status === "done" && opts.reminder) parts.push(reassessCallout());
  if (sub.status === "done") parts.push(`<div class="actions section-gap">${pdfButton(sub)}</div>`);
  return parts.join("");
}

/* ---------- Behaviors ---------- */

type ChecklistState = Record<string, boolean[]>;
const CHECKLIST_PREFIX = "oci-checklist:";

function readChecklist(id: string): ChecklistState {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKLIST_PREFIX + id) || "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as ChecklistState) : {};
  } catch { return {}; }
}

/** Start-here checklists: native checkboxes persisted per assessment id + item index; announce the new count politely. */
export function wireChecklists(sub: Assessment, root: ParentNode) {
  const focus = sub.report?.focus ?? [];
  const state = readChecklist(sub.id);
  const refresh = (i: number) => {
    const total = focus[i]?.steps.length ?? 0;
    const done = (state[i] ?? []).filter(Boolean).length;
    const el = root.querySelector<HTMLElement>(`#focus-status-${i}`);
    if (el) {
      el.innerHTML = checklistStatus(done, total);
      el.dataset.status = done === 0 ? "none" : done === total ? "done" : "some";
    }
    return done;
  };
  $$<HTMLInputElement>("input[data-focus][data-step]", root).forEach((box) => {
    const i = Number(box.dataset.focus), j = Number(box.dataset.step);
    box.checked = !!state[i]?.[j];
  });
  focus.forEach((_, i) => refresh(i));
  root.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.matches("input[data-focus][data-step]")) return;
    const i = Number(box.dataset.focus), j = Number(box.dataset.step);
    const total = focus[i]?.steps.length ?? 0;
    state[i] = Array.from({ length: total }, (_, k) => (k === j ? box.checked : !!state[i]?.[k]));
    try { localStorage.setItem(CHECKLIST_PREFIX + sub.id, JSON.stringify(state)); } catch { /* storage disabled */ }
    const done = refresh(i);
    announce(`Priority ${i + 1}: ${done} of ${total} steps done.`);
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
