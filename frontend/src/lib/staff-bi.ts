// Staff BI dashboard (v1.0): types for GET /api/staff/bi and the HTML for each tab. All numbers come from the server.
import { ApiError } from "./api";
import { esc, plural } from "./dom";
import { icon } from "./icons";
import { briefButton } from "./staff-brief";

export interface Ref { id: string; name: string; assessment_id: string }
export interface Cell { high: number; asked: boolean; need: boolean }
export interface NeedArea { domain_id: string; domain_name: string; orgs: number; high: number; asked: number; top_question_id: string | null; top_question_text: string | null }
export interface NeedRow extends Ref { needs: number; high: number; cells: Record<string, Cell> }
export interface Stats { assessed: number; stages: Record<string, number>; avg_capacity: number | null; high_orgs: number; high_pct: number; top: { question_id: string; question_text: string; orgs: number }[] }
export interface AreaStats extends Stats { domain_id: string; domain_name: string; groups: Record<GroupBy, (Stats & { name: string })[]> }
export type GroupBy = "program_model" | "staff_size" | "budget" | "role";
export interface CommonGap { question_id: string; question_text: string; domain_id: string; domain_name: string; stage_name: string; orgs: number; share_pct: number; by_model: { name: string; assessed: number; orgs: number }[] }
export interface ChangeRow extends Ref { previous: string; latest: string; up: number; down: number; same: number; closed: number; new: number; moves: { domain_id: string; domain_name: string; from: string; to: string; change: number }[] }
export interface Rate { before: number; closed: number; rate: number | null }
export interface Change { reassessed: number; rows: ChangeRow[]; areas_up: number; areas_down: number; areas_same: number; closed: number; new: number; training: { asked: Rate; other: Rate } }
export interface Peer { org: Ref; score: number; reasons: string[] }
export interface OrgDetail extends Ref {
  assessed: string; source: string; assessments: number; program_models: string[]; staff_size: string | null; budget: string | null;
  states: string[]; role: string | null; asked: string[]; asked_at: string | null; trace_url?: string | null; trace_cloudwatch_url?: string | null;
  stages: { domain_id: string; domain_name: string; stage: string; score: number; percentile: number | null; high: number }[];
  top_gaps: { question_id: string; question_text: string; priority: string; domain_name: string }[];
}
export interface Bi {
  generated: string; filters: Record<string, string>; options: Record<GroupBy | "state" | "area", string[]>; stage_names: string[];
  totals: { organizations: number; assessments: number; last_30_days: number; reassessed: number; asked_for_help: number };
  training_needs: { areas: NeedArea[]; rows: NeedRow[] };
  gaps_by_domain: AreaStats[]; common_gaps: CommonGap[]; change: Change;
  support_requests: { domain_id: string; domain_name: string; orgs: number; organizations: (Ref & { requested_at: string | null })[] }[];
  peer_groups: { program_model: string; staff_size: string; members: Ref[]; shared_gaps: { question_id: string; question_text: string; orgs: number }[] }[];
  peer_requests: { org: Ref; requested_at: string; suggestions: Peer[] }[];
  organizations: OrgDetail[];
}

export const pct = (n: number | null | undefined) => (n == null ? "" : `${Math.round(n)}%`);
export const report = (r: Ref, label = r.name) => `<a href="/results/?id=${encodeURIComponent(r.assessment_id)}">${esc(label)}<span class="visually-hidden"> report</span></a>`;
/** Staff-only audit links to the latest report's AI trace, one per place it was sent: Arize Phoenix (its own sign-in)
 *  and the Amazon CloudWatch console (AWS sign-in). Older reports have only one of them. */
export const traceLinks = (...urls: (string | null | undefined)[]) =>
  [...new Set(urls)].filter((url): url is string => !!url && /^https?:\/\//.test(url)).map((url) => {
    const [where, opens] = url.includes(".console.aws.amazon.com/") ? ["CloudWatch", "the AWS console"] : ["Phoenix", "Phoenix"];
    return `<p class="trace-link" data-no-print>${icon("search")}<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">View AI trace in ${where} (staff)<span class="visually-hidden"> (opens ${opens} in a new tab)</span></a></p>`;
  }).join("");
const head = (id: string, eyebrow: string, title: string, extra = "") =>
  `<div class="section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="${id}">${esc(title)}</h2></div>${extra}</div>`;
const empty = (text: string) => `<p class="notice">${icon("info")}<span>${esc(text)}</span></p>`;
/** Tables scroll sideways inside a frame; staff.astro's markScroll() sets data-scrollable / data-more for the hint and the edge shade. */
const table = (id: string, caption: string, thead: string, tbody: string, cls = "") =>
  `<div class="scroll-frame"><p class="scroll-hint" aria-hidden="true">Scroll sideways to see every column.</p><div class="table-wrap" role="region" aria-labelledby="${id}" tabindex="0"><table class="${cls}"><caption id="${id}">${caption}</caption><thead>${thead}</thead><tbody>${tbody}</tbody></table></div></div>`;

/** Flag each table frame that overflows (hint) and still has columns to the right (edge shade). */
export function markScroll(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>(".scroll-frame").forEach((f) => {
    const w = f.querySelector<HTMLElement>(".table-wrap");
    if (!w || !w.clientWidth) return; // hidden tab: measured again when shown
    f.toggleAttribute("data-scrollable", w.scrollWidth > w.clientWidth + 1);
    f.toggleAttribute("data-more", w.scrollLeft + w.clientWidth < w.scrollWidth - 1);
  });
}

/** An expired staff session: retrying cannot help, signing in again does. */
export const expired = (e: unknown) => e instanceof ApiError && e.status === 401;

/** Error text for a failed staff request; an expired session gets a sign-in link that comes back here. */
export function failHtml(e: unknown, text: string) {
  if (expired(e)) {
    const next = encodeURIComponent(location.pathname + location.hash);
    return `${icon("lock")}<span>Your staff session has ended. <a href="/login/?next=${next}">Sign in again</a> to keep working.</span>`;
  }
  return `${icon("alert")}<span>${esc(text)}</span>`;
}
const share = (value: number, text: string) =>
  `<span class="share"><span class="share__track" aria-hidden="true"><span class="share__fill" style="width:${Math.min(100, Math.max(0, value))}%"></span></span><span>${text}</span></span>`;

/** Quote every cell and neutralize spreadsheet formulas, then download in the browser. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const cell = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
  const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 1. training needs ----------

export function needCell(c: Cell | undefined) {
  if (!c) return `<td class="need need--na"><span class="meta">Not assessed</span></td>`;
  if (!c.need) return `<td class="need"><span class="visually-hidden">No need</span></td>`;
  return `<td class="need need--yes"><span class="need__tags">${c.high ? `<span class="need__tag"><strong>${c.high}</strong> High priority</span>` : ""}${c.asked ? `<span class="need__tag need__tag--asked">${icon("message")}Asked for help</span>` : ""}</span></td>`;
}

export function needsCsv(d: Bi) {
  const areas = d.training_needs.areas;
  const byId = new Map(d.organizations.map((o) => [o.id, o]));
  const header = ["Organization", "Assessment id", "Areas that need training",
    ...areas.flatMap((a) => [`${a.domain_name} High priority growth priorities`, `${a.domain_name} asked for help`, `${a.domain_name} stage`, `${a.domain_name} capacity %`, `${a.domain_name} peer percentile within program model (staff-only preview)`])];
  const rows = d.training_needs.rows.map((r) => {
    const st = new Map((byId.get(r.id)?.stages ?? []).map((s) => [s.domain_id, s]));
    return [r.name, r.assessment_id, r.needs, ...areas.flatMap((a) => {
      const c = r.cells[a.domain_id], s = st.get(a.domain_id);
      return c ? [c.high, c.asked ? "Yes" : "No", s?.stage ?? "", s ? Math.round(s.score) : "", s?.percentile ?? ""] : ["", "", "Not assessed", "", ""];
    })];
  });
  downloadCsv("oci-training-needs", [header, ...rows]);
}

export function needsPanel(d: Bi) {
  const { areas, rows } = d.training_needs;
  const cards = [...areas].sort((a, b) => b.orgs - a.orgs).map((a) => `<li class="card need-card">
      <h3>${esc(a.domain_name)}</h3>
      <p class="need-card__count"><strong>${a.orgs}</strong> ${a.orgs === 1 ? "organization needs" : "organizations need"} training</p>
      <p class="meta">${a.high} with High priority growth priorities here · ${a.asked} asked for help</p>
      ${a.top_question_id ? `<p class="need-card__top"><span class="meta need-card__label">Top High priority statement</span><span class="chip">${esc(a.top_question_id)}</span> ${esc(a.top_question_text)}</p>
      ${briefButton(a.top_question_id, `need-${a.domain_id}`)}<div class="brief-slot" id="brief-need-${esc(a.domain_id)}" data-level="4" hidden></div>` : ""}
    </li>`).join("");
  const thead = `<tr><th scope="col">Organization</th><th scope="col" class="num need-count-col">Areas with a need</th>${areas.map((a) => `<th scope="col">${esc(a.domain_name)}<span class="th-count">${a.orgs} need training</span></th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr data-org="${esc(r.id)}">
      <th scope="row"><button type="button" class="link-btn" data-open-org="${esc(r.id)}">${esc(r.name)}</button></th>
      <td class="num">${r.needs}</td>${areas.map((a) => needCell(r.cells[a.domain_id])).join("")}
    </tr>`).join("");
  return `${head("needs-title", "Training", "Which organizations need which training",
    `<button type="button" class="btn btn-secondary btn-sm" id="needs-csv">${icon("download")}<span>Download matrix (CSV)</span></button>`)}
    <p class="measure">An area counts as a training need when the organization asked for help there, or when the area is at the Seeding or Emerging stage and has at least one High priority growth priority. Select an organization to see its details.</p>
    <h3 class="sub-head">Training to plan, most needed first</h3>
    <ul class="need-cards" role="list">${cards}</ul>
    <h3 class="sub-head">Organizations by area</h3>
    <ul class="legend need-legend" aria-label="What the cells mean">
      <li><span><strong>3</strong> High priority: 3 of the organization's High priority growth priorities are in this area</span></li>
      <li>${icon("message")}<span>Asked for help: the organization asked the Community Safety Fund for training or coaching in this area</span></li>
      <li><span>Blank: no training need in this area. Not assessed: the organization skipped the area.</span></li>
    </ul>
    ${table("needs-caption", `Training needs: ${plural(rows.length, "organization", "organizations")} by capacity area, most needs first`, thead, tbody, "needs-matrix")}
    ${supportTable(d)}`;
}

function supportTable(d: Bi) {
  const rows = d.support_requests;
  return `<h3 class="sub-head">Support requests by area</h3>
    ${rows.length ? table("support-caption", "Areas where grantees asked for training or coaching, latest request per organization",
      `<tr><th scope="col">Area</th><th scope="col" class="num">Organizations asking</th><th scope="col">Organizations</th></tr>`,
      rows.map((r) => `<tr><th scope="row">${esc(r.domain_name)}</th><td class="num">${r.orgs}</td><td><ul class="plain-list">${r.organizations.map((o) => `<li>${report(o)} ${o.requested_at ? `<span class="meta">(${esc(o.requested_at)})</span>` : ""}</li>`).join("")}</ul></td></tr>`).join(""))
      : empty("No organization has asked the Community Safety Fund for support yet.")}`;
}

// ---------- 2. gaps by domain ----------

const GROUP_LABEL: Record<GroupBy | "none", string> = { none: "None", program_model: "Program model", staff_size: "Staff size", budget: "Budget", role: "Who answered" };

function stageBar(stages: Record<string, number>, names: string[], label: string) {
  const total = names.reduce((n, s) => n + (stages[s] || 0), 0);
  const aria = `${label}: ${names.map((s) => `${stages[s] || 0} ${s}`).join(", ")}`;
  return `<div class="bar" role="img" aria-label="${esc(aria)}">${total ? names.map((s, i) => {
    const n = stages[s] || 0;
    return n ? `<span class="bar__seg s${i + 1}" style="flex-grow:${n}" title="${esc(`${s}: ${n}`)}">${n}</span>` : "";
  }).join("") : ""}</div>`;
}

/** Stage bars plus the equivalent table; `compact` (grouped view) keeps only the table and the top growth priority. */
function statsBlock(rows: (Stats & { label: string })[], names: string[], id: string, caption: string, firstCol: string, compact = false) {
  const bars = rows.map((r) => `<li>
      <div class="bar__label"><span>${esc(r.label)}</span><span class="meta">${plural(r.assessed, "organization", "organizations")} · average capacity ${pct(r.avg_capacity)} · ${r.high_pct}% with a High priority</span></div>
      ${stageBar(r.stages, names, r.label)}</li>`).join("");
  // Compact rows show the stage counts as one labelled stacked bar (numbers printed in each segment) instead of 5 columns.
  const stageHead = compact ? `<th scope="col" class="stage-col">Organizations at each stage</th>` : names.map((s) => `<th scope="col" class="num">${esc(s)}</th>`).join("");
  const stageCells = (r: Stats & { label: string }) => (compact ? `<td class="stage-col">${stageBar(r.stages, names, r.label)}</td>` : names.map((s) => `<td class="num">${r.stages[s] || 0}</td>`).join(""));
  const thead = `<tr><th scope="col">${esc(firstCol)}</th>${stageHead}<th scope="col" class="num">Assessed</th><th scope="col" class="num">Average capacity</th><th scope="col" class="num">With a High priority</th><th scope="col">Most common growth ${compact ? "priority" : "priorities"}</th></tr>`;
  const tbody = rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th>${stageCells(r)}<td class="num">${r.assessed}</td><td class="num">${pct(r.avg_capacity)}</td><td class="num">${r.high_pct}%</td>
      <td><ul class="plain-list">${r.top.slice(0, compact ? 1 : 3).map((t) => `<li><span class="chip">${esc(t.question_id)}</span> ${esc(t.question_text)} <span class="meta">(${t.orgs})</span></li>`).join("")}</ul></td></tr>`).join("");
  return `${compact ? "" : `<ul class="bars" role="list">${bars}</ul>`}${table(id, caption, thead, tbody)}`;
}

export function gapsPanel(d: Bi, group: GroupBy | "none") {
  const names = d.stage_names;
  const legend = `<ul class="legend" aria-label="Stage colors">${names.map((s, i) => `<li><span class="swatch s${i + 1}" aria-hidden="true"></span>${i + 1}. ${esc(s)}</li>`).join("")}</ul>`;
  const picker = `<div class="field group-by"><label for="group-by">Group by</label><select class="input" id="group-by">${(Object.keys(GROUP_LABEL) as (GroupBy | "none")[]).map((g) => `<option value="${g}"${g === group ? " selected" : ""}>${GROUP_LABEL[g]}</option>`).join("")}</select></div>`;
  const areas = d.gaps_by_domain;
  let body: string;
  if (!areas.length) body = empty("No assessments match these filters.");
  else if (group === "none") {
    body = statsBlock(areas.map((a) => ({ ...a, label: a.domain_name })), names, "gbd-caption", "Organizations at each stage, share with a High priority growth priority, and the most common growth priorities, by capacity area (same data as the bars)", "Area");
  } else {
    body = areas.map((a, i) => `<details class="about-card group-area"${i ? "" : " open"}><summary>${icon("chart")}<span>${esc(a.domain_name)}</span><span class="meta">${plural(a.assessed, "organization", "organizations")}</span>${icon("chevron-down", "about-card__chevron")}</summary>
      <div class="about-card__body">${statsBlock(a.groups[group].map((g) => ({ ...g, label: g.name })), names, `gbd-cap-${esc(a.domain_id)}`, `${esc(a.domain_name)} by ${esc(GROUP_LABEL[group].toLowerCase())}: organizations at each stage`, GROUP_LABEL[group], true)}</div></details>`).join("");
  }
  const note = group === "program_model" ? `<p class="hint">An organization with two program models counts in both groups.</p>`
    : group === "role" ? `<p class="hint">Who answered each area: the leader's role, or a teammate's role for areas they were sent.</p>` : "";
  return `${head("gaps-title", "By area", "Gaps by capacity area")}
    <p>Where organizations are in each area, how many have a High priority growth priority there, and the three most common growth priorities. Group by program model, size, budget or who answered to compare like with like.</p>
    <div class="toolbar toolbar--slim">${picker}</div>${note}${legend}${body}`;
}

// ---------- 3. most common gaps ----------

export function commonPanel(d: Bi) {
  const gaps = d.common_gaps;
  const rows = gaps.map((g, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td><span class="chip">${esc(g.question_id)}</span> ${esc(g.question_text)}
        <details class="by-model"><summary>By program model</summary><ul class="plain-list">${g.by_model.map((m) => `<li>${share(m.assessed ? (100 * m.orgs) / m.assessed : 0, `${esc(m.name)}: ${m.orgs} of ${m.assessed}`)}</li>`).join("")}</ul></details></td>
      <td>${esc(g.domain_name)}</td><td>${esc(g.stage_name)}</td>
      <td>${share(g.share_pct, `${g.orgs} (${g.share_pct}%)`)}</td>
      <td class="nowrap">${briefButton(g.question_id, `gap-${i}`)}</td>
    </tr>
    <tr class="brief-row" hidden><td colspan="6"><div class="brief-slot" id="brief-gap-${i}"></div></td></tr>`).join("");
  return `${head("common-title", "Across the network", "Most common gaps across all grantees")}
    <p>The statements most often marked as a growth priority. Open "By program model" to see who has it, out of those assessed in that area.</p>
    <p class="hint">An organization with two program models counts in both groups.</p>
    ${gaps.length ? table("common-caption", "Most common growth priorities, with the number and share of organizations assessed in that area",
      `<tr><th scope="col" class="num">Rank</th><th scope="col">Statement</th><th scope="col">Area</th><th scope="col">Stage</th><th scope="col">Organizations</th><th scope="col">Training</th></tr>`, rows)
      : empty("No growth priorities yet.")}`;
}

// ---------- 4. change over time ----------

function rateLine(label: string, r: Rate) {
  return `<li><span class="rate__label">${esc(label)}</span>${r.rate == null ? `<span class="meta">No growth priorities to compare yet</span>`
    : share(r.rate, `${r.closed} of ${r.before} closed (${r.rate}%)`)}</li>`;
}

export function changePanel(d: Bi) {
  const c = d.change;
  const moves = (r: ChangeRow) => `<ul class="plain-list">${r.moves.map((m) => `<li>${icon(m.change > 0 ? "trending" : m.change < 0 ? "arrow-right" : "circle")}<span>${esc(m.domain_name)}: ${m.change === 0 ? `stayed ${esc(m.to)}` : `${esc(m.from)} to ${esc(m.to)}`}${m.change > 0 ? " (up)" : m.change < 0 ? " (down)" : ""}</span></li>`).join("")}</ul>`;
  return `${head("change-title", "Re-assessments", "Change over time")}
    <p>Organizations that took the assessment more than once: their latest assessment compared with the one before, over the areas both covered.</p>
    ${c.reassessed ? `<ul class="kpi-grid" role="list">
      <li class="card kpi"><span class="kpi__label">${icon("refresh")}Re-assessed</span><span class="kpi__num">${c.reassessed}</span><span class="kpi__context">organizations</span></li>
      <li class="card kpi"><span class="kpi__label">${icon("trending")}Areas up</span><span class="kpi__num">${c.areas_up}</span><span class="kpi__context">${c.areas_same} stayed, ${c.areas_down} down</span></li>
      <li class="card kpi"><span class="kpi__label">${icon("circle-check")}Closed</span><span class="kpi__num">${c.closed}</span><span class="kpi__context">growth priorities closed, ${c.new} new</span></li>
    </ul>
    <section class="card rate" aria-labelledby="help-title">
      <h3 id="help-title">Did support help? <span class="badge">Early signal, small numbers</span></h3>
      <p>Share of growth priorities closed by the next assessment, in areas where the organization had asked for help compared with its other areas.</p>
      <ul class="plain-list rate__list">${rateLine("Where they asked for help", c.training.asked)}${rateLine("Other areas", c.training.other)}</ul>
      <p class="hint">Asking for help is not the same as receiving training, and the numbers are small. Use this as a prompt for follow-up, not as proof.</p>
    </section>
    ${table("change-caption", "Stage moves and growth priorities closed since the previous assessment",
      `<tr><th scope="col">Organization</th><th scope="col">Assessed</th><th scope="col">Stage moves</th><th scope="col" class="num">Closed</th><th scope="col" class="num">New</th></tr>`,
      c.rows.map((r) => `<tr><th scope="row">${report(r)}</th><td class="nowrap">${esc(r.previous)} and ${esc(r.latest)}</td><td>${moves(r)}</td><td class="num">${r.closed}</td><td class="num">${r.new}</td></tr>`).join(""))}`
    : empty("No organization has taken the assessment twice yet. When one does, its stage moves and closed growth priorities show here.")}`;
}

// ---------- 6. peers ----------

const peerList = (peers: Peer[]) => `<ul class="plain-list peer-list">${peers.map((p) => `<li>${report(p.org)} <span class="chip">${Math.round(p.score * 100)}% similar</span><br><span class="meta">${p.reasons.map(esc).join(" · ")}</span></li>`).join("")}</ul>`;

export function peersPanel(d: Bi) {
  const reqs = d.peer_requests;
  const grouped = new Set(d.peer_groups.flatMap((g) => g.members.map((m) => m.id)));
  const left = d.organizations.filter((o) => !grouped.has(o.id)).length;
  return `${head("peers-title", "Peer learning", "Peer groups and requests to connect")}
    <p>Similarity is computed by code: program model (40%), size by staff or budget (30%) and shared growth priorities (30%). Peer percentiles in each organization's details compare it only with organizations of the same main program model. Organizations never see peer comparisons.</p>
    <h3 class="sub-head">Asked to be connected</h3>
    ${reqs.length ? `<ul class="cohorts" role="list">${reqs.map((r) => `<li class="card cohort">
        <span class="eyebrow">Asked ${esc(r.requested_at)}</span>
        <h4>${report(r.org)}</h4>
        ${r.suggestions.length ? `<p class="meta">Suggested matches</p>${peerList(r.suggestions)}` : `<p class="meta">No similar organization yet.</p>`}
      </li>`).join("")}</ul>` : empty("No organization has asked to be connected yet. Requests show here when a leader selects \"Ask to be connected\" on their report.")}
    <h3 class="sub-head">Peer groups: same main program model and staff size</h3>
    <p class="hint" id="peer-groups-note">A group needs at least 2 organizations.${left ? ` ${plural(left, "organization is", "organizations are")} not in a group: no other organization has the same main program model and staff size, or they did not share them.` : ""}</p>
    ${d.peer_groups.length ? `<ul class="cohorts" role="list">${d.peer_groups.map((g) => `<li class="card cohort">
        <span class="eyebrow">${esc(g.staff_size)} staff · ${plural(g.members.length, "organization", "organizations")}</span>
        <h4>${esc(g.program_model)}</h4>
        <ul>${g.members.map((m) => `<li><button type="button" class="link-btn" data-open-org="${esc(m.id)}">${esc(m.name)}</button></li>`).join("")}</ul>
        ${g.shared_gaps.length ? `<p class="meta">Growth priorities they share most</p><ul class="plain-list">${g.shared_gaps.map((s) => `<li><span class="chip">${esc(s.question_id)}</span> ${esc(s.question_text)} <span class="meta">(${s.orgs})</span></li>`).join("")}</ul>` : ""}
      </li>`).join("")}</ul>` : empty("No two organizations here have the same main program model and staff size yet.")}`;
}

// ---------- organization drawer ----------

/** One row of GET /api/staff/roadmaps (features/milestones.py): the org's newest assessment that has a roadmap. */
export interface Roadmap { org_id: string; assessment_id: string; weeks_done: number; weeks_total: number; tasks_done: number; total: number; pct: number; points: number; last_activity: string | null }

export function drawerHtml(o: OrgDetail, stateName: (c: string) => string) {
  const model = o.program_models[0];
  const facts = [["Program model", o.program_models.join(", ")], ["Staff size", o.staff_size ? `${o.staff_size} staff` : ""], ["Budget", o.budget ?? ""],
    [o.states.length > 1 ? "States" : "State", o.states.map(stateName).join(", ")], ["Completed by", o.role ?? ""], ["Latest assessment", `${o.assessed} (${plural(o.assessments, "assessment", "assessments")} in total)`]];
  return `<div class="drawer__head">
      <div><span class="eyebrow">Organization</span><h2 id="drawer-title" tabindex="-1">${esc(o.name)}</h2></div>
      <button type="button" class="btn btn-secondary btn-sm" data-close-drawer>${icon("circle-x")}<span>Close</span></button>
    </div>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="meta">Not shared</span>'}</dd></div>`).join("")}</dl>
    <p>${report(o, "Open the full report")}</p>${traceLinks(o.trace_url, o.trace_cloudwatch_url)}
    <h3>Stage by area</h3>
    ${table("drawer-stages", `Stages and needs for ${esc(o.name)}`,
      `<tr><th scope="col">Area</th><th scope="col">Stage</th><th scope="col" class="num">Capacity</th><th scope="col" class="num">High priority</th><th scope="col">Asked for help</th><th scope="col" class="num preview-col">Peer percentile</th></tr>`,
      o.stages.map((s) => `<tr><th scope="row">${esc(s.domain_name)}</th><td>${esc(s.stage)}</td><td class="num">${pct(s.score)}</td><td class="num">${s.high}</td><td>${o.asked.includes(s.domain_id) ? "Yes" : "No"}</td><td class="num preview-col">${s.percentile == null ? '<span class="meta">Too few peers</span>' : `${s.percentile}`}</td></tr>`).join(""))}
    <p class="hint">${icon("shield")} Peer percentile (0 to 100) is a staff-only preview, ranked only among organizations with the same main program model${model ? ` (${esc(model)})` : ""}, when there are 3 or more. Grantees never see it.</p>
    <h3>Top growth priorities</h3>
    <ol class="drawer__gaps">${o.top_gaps.map((g) => `<li><span class="chip">${esc(g.question_id)}</span> ${esc(g.question_text)} <span class="meta">(${esc(g.domain_name)}, ${esc(g.priority)})</span></li>`).join("")}</ol>
    <h3>Support request</h3>
    <p>${o.asked.length ? `Asked for help in ${esc(o.stages.filter((s) => o.asked.includes(s.domain_id)).map((s) => s.domain_name).join(", ") || o.asked.join(", "))}${o.asked_at ? ` on ${esc(o.asked_at)}` : ""}.` : "No support request yet."}</p>
    <h3>Roadmap progress</h3>
    <div id="drawer-roadmap"><p class="loading">${icon("loader", "spin")}Loading</p></div>
    <h3>Similar grantees</h3>
    <div id="drawer-peers" data-org="${esc(o.id)}"><p class="loading">${icon("loader", "spin")}Finding similar organizations</p></div>`;
}

export const peersHtml = (peers: Peer[]) => (peers.length ? peerList(peers) : `<p class="meta">No similar organization yet.</p>`);

export function roadmapHtml(r: Roadmap | undefined) {
  if (!r || !r.total) return `<p class="meta">No roadmap opened yet.</p>`;
  return `<p>${share(r.pct, `${r.tasks_done} of ${r.total} steps done (${r.pct}%)`)}</p>
    <p class="meta">${r.weeks_done} of ${r.weeks_total} weeks complete · ${r.points} points${r.last_activity ? ` · last activity ${esc(r.last_activity)}` : ""}</p>
    <p><a href="/plan/?id=${encodeURIComponent(r.assessment_id)}">Open the roadmap</a></p>`;
}
