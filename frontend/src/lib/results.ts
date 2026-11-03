// HTML builders for the results page. Every API string goes through esc(); URLs through safeUrl().
import type { Assessment, Focus, Gap, Meta, PlanItem, Step } from "./api";
import { esc, hostOf, plural, safeUrl } from "./dom";
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

function sectionHead(id: string, title: string, eyebrow: string, listenTarget?: string, lang = "en"): string {
  return `<div class="section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="${id}">${esc(title)}</h2></div>${listenTarget ? listen(listenTarget, lang) : ""}</div>`;
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
      <p>Start with your stages below, then read your top priorities and 30 / 60 / 90 day plan. Share the PDF with your team to talk it through together.</p>
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

export function stagesSection(sub: Assessment, meta: Meta): string {
  const stages = [...meta.stages].sort((a, b) => a.n - b.n);
  const names = stages.map((s) => s.name);
  const ladders = sub.domains.map((d) => {
    const cur = names.indexOf(d.estimated_stage);
    const desc = stages[cur]?.description;
    return `<li class="card ladder-card">
      <h3>${esc(d.domain_name)}</h3>
      <p class="ladder-card__stage">Estimated stage: <strong>${esc(d.estimated_stage)}</strong></p>
      <ol class="ladder" role="list" aria-label="${esc(d.domain_name)} stages">${names.map((st, i) => `
        <li class="ladder__pip${i === cur ? " is-current" : i < cur ? " is-past" : ""}"${i === cur ? ' aria-current="step"' : ""}>
          <span class="ladder__dot" aria-hidden="true">${i === cur ? icon("check") : ""}</span>
          <span class="ladder__name">${i + 1}. ${esc(st)}${i === cur ? '<span class="visually-hidden"> (your estimated stage)</span>' : ""}</span>
        </li>`).join("")}
      </ol>
      ${desc ? `<p class="ladder-card__desc"><strong>${esc(d.estimated_stage)}:</strong> ${esc(desc)}</p>` : ""}
    </li>`;
  }).join("");
  const o = sub.overall;
  return `<section class="section" aria-labelledby="stages-title">
    ${sectionHead("stages-title", "Where you are today", "Your stages")}
    <p>Each area has five stages, from ${esc(names[0] ?? "Seeding")} to ${esc(names[names.length - 1] ?? "Transformational")}. Your estimated stage shows where your organization is growing from. Every stage is a normal place to be.</p>
    <ul class="ladders" role="list">${ladders}</ul>
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
    ${p.previous_id ? `<p><a href="/results/?id=${encodeURIComponent(p.previous_id)}">View previous report</a></p>` : ""}
  </section>`;
}

function basis(ids: string[], gaps: Map<string, Gap>, open = false): string {
  if (!ids.length) return "";
  const rows = ids.map((id) => `<li><span class="chip">${esc(id)}</span> ${esc(gaps.get(id)?.question_text ?? "Statement not found")}</li>`).join("");
  // Statement text comes from the question bank (English) even when the report is in Spanish.
  return `<div class="basis" lang="en">
    <p class="label">Based on your answers to:</p>
    ${open ? `<ul>${rows}</ul>` : `<ul class="chips" role="list">${ids.map((id) => `<li class="chip">${esc(id)}</li>`).join("")}</ul>
    <details class="about"><summary>Show statements</summary><ul>${rows}</ul></details>`}
  </div>`;
}

function resource(r: Focus["resource"], lang: string): string {
  if (!r?.url) return "";
  return `<p class="icon-line">${icon("book")}<span><span class="label">Resource:</span> <a href="${esc(safeUrl(r.url))}" rel="noopener" lang="${esc(lang)}">${esc(r.title)}</a> <span class="url-domain">(${esc(hostOf(r.url))})</span></span></p>`;
}

// UI labels stay English; only AI-written text carries the report language.
function focusSection(items: Focus[], gaps: Map<string, Gap>, lang: string): string {
  if (!items.length) return "";
  const L = `lang="${esc(lang)}"`;
  return `<section class="section" aria-labelledby="focus-title">
    ${sectionHead("focus-title", "Start here: your top priorities", "Do these first", "#focus-body", lang)}
    <p>Out of everything you could work on, ${items.length === 1 ? "this is the one priority" : "these are the two priorities"} to start with.</p>
    <ol class="focus-list" id="focus-body" role="list">${items.map((f, i) => `
      <li class="focus-card">
        <div class="focus-card__head"><span class="focus-card__num" aria-hidden="true">${i + 1}</span><h3><span class="visually-hidden">Priority ${i + 1}: </span><span ${L}>${esc(f.title)}</span></h3></div>
        <div class="focus-card__body">
          <h4>Why it matters</h4>
          <p class="focus-card__why" ${L}>${esc(f.why)}</p>
          ${basis(f.gap_ids, gaps, true)}
          ${f.steps.length ? `<h4>What to do</h4><ol class="steps-list" ${L}>${f.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
          ${resource(f.resource, lang)}
        </div>
      </li>`).join("")}
    </ol>
  </section>`;
}

function planSection(plan: PlanItem[], gaps: Map<string, Gap>, lang: string): string {
  const L = `lang="${esc(lang)}"`;
  const groups: [30 | 60 | 90, string][] = [[30, "First 30 days"], [60, "Days 31 to 60"], [90, "Days 61 to 90"]];
  const html = groups.map(([h, title]) => {
    const items = plan.filter((p) => p.horizon === h);
    if (!items.length) return "";
    return `<h3 class="horizon">${icon("calendar")}${title}</h3>
      <ul class="plan" role="list">${items.map((a) => `
        <li class="card plan-card">
          <h4 ${L}>${esc(a.title)}</h4>
          ${a.owner ? `<p class="icon-line">${icon("user")}<span><span class="label">Owner:</span> <span ${L}>${esc(a.owner)}</span></span></p>` : ""}
          <p ${L}>${esc(a.why)}</p>
          ${a.steps.length ? `<ol class="steps-list" ${L}>${a.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
          ${basis(a.gap_ids, gaps)}
          ${resource(a.resource, lang)}
        </li>`).join("")}
      </ul>`;
  }).join("");
  if (!html) return "";
  return `<section class="section" aria-labelledby="plan-title">
    ${sectionHead("plan-title", "30 / 60 / 90 day action plan", "Your plan", "#plan-body", lang)}
    <div id="plan-body">${html}</div>
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
    ${sectionHead("gaps-title", "All growth priorities", "Everything you could work on")}
    <p>These are the statements you answered in a way that points to room to grow, ordered by priority within each area. Priority comes from the fixed scoring method.</p>
    ${body}
  </section>`;
}

/** Everything below the status panel. */
export function reportBody(sub: Assessment, meta: Meta): string {
  const lang = sub.language || "en";
  const gaps = new Map(sub.gaps.map((g) => [g.question_id, g]));
  const r = sub.report;
  const parts = [stagesSection(sub, meta), progressSection(sub)];
  if (r) {
    parts.push(`<p class="notice section">${icon("info")}<span>Recommendations generated with AI from your answers and the CVI resource library. Scores are calculated by a fixed scoring method. Please review them with your team before acting.</span></p>`);
    parts.push(`<section class="section" aria-labelledby="truth-title">
      ${sectionHead("truth-title", "What's true about you", "In plain words", "#truth-body", lang)}
      <div class="truth"><div class="prose" id="truth-body" lang="${esc(lang)}">${r.summary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}</div></div>
    </section>`);
    parts.push(focusSection(r.focus ?? [], gaps, lang));
    if (r.strengths?.length) {
      parts.push(`<section class="section" aria-labelledby="strengths-title">
        ${sectionHead("strengths-title", "What you already do well", "Your strengths", "#strengths-body", lang)}
        <ul class="check-list prose" id="strengths-body" lang="${esc(lang)}" role="list">${r.strengths.map((s) => `<li>${icon("circle-check")}<span>${esc(s)}</span></li>`).join("")}</ul>
      </section>`);
    }
    parts.push(planSection(r.plan ?? [], gaps, lang));
    if (r.conversation?.length) {
      parts.push(`<section class="section" aria-labelledby="conversation-title">
        ${sectionHead("conversation-title", "Team conversation guide", "Talk it through", "#conversation-body", lang)}
        <p>Use these questions at your next team or board meeting.</p>
        <ol class="prose conversation" id="conversation-body" lang="${esc(lang)}">${r.conversation.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
      </section>`);
    }
  } else if (sub.status === "done") {
    parts.push(`<p class="notice section">${icon("info")}<span>AI recommendations were not generated for this synthetic seed record.</span></p>`);
  }
  parts.push(gapsSection(sub, meta));
  if (r?.sources?.length) {
    parts.push(`<section class="section" aria-labelledby="sources-title">
      ${sectionHead("sources-title", "Sources consulted", "Where this comes from")}
      <ul class="sources" lang="${esc(lang)}">${r.sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" rel="noopener">${esc(s.title)}</a> <span class="url-domain">(${esc(hostOf(s.url))})</span></li>`).join("")}</ul>
    </section>`);
  }
  if (sub.status === "done") parts.push(`<div class="actions section">${pdfButton(sub)}</div>`);
  return parts.join("");
}
