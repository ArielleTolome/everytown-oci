// AI training brief on the staff dashboard (aggregated counts only; the server never sends organization names to the model).
import { api, ApiError } from "./api";
import { esc, focusEl, hostOf, plural, safeUrl } from "./dom";
import { icon } from "./icons";

interface Brief {
  question_id: string; statement: string; domain_name: string; title: string; why_it_matters: string;
  session_outline: string[]; pre_work: string; follow_up: string; resources: { title: string; url: string }[]; generated: string;
  who: { orgs: number; high_priority: number; assessed: number; not_given: number;
    program_models: { name: string; orgs: number }[]; staff_sizes: { name: string; orgs: number }[] };
}
const briefs = new Map<string, Promise<Brief>>();

/** Toggle button; `slot` is the id suffix of an element `brief-<slot>` (or a hidden `.brief-row` containing it). */
export const briefButton = (qid: string, slot: string, label = "Draft a training brief") =>
  `<button type="button" class="btn btn-secondary btn-sm" data-brief="${esc(qid)}" aria-expanded="false" aria-controls="brief-${slot}">${icon("book")}<span>${esc(label)}</span></button>`;

function whoList(b: Brief) {
  const w = b.who;
  const by = (rows: { name: string; orgs: number }[], label = (n: string) => n) => rows.map((r) => `${esc(label(r.name))}: ${r.orgs}`).join(", ");
  return `<ul>
    <li>${plural(w.orgs, "organization", "organizations")} of ${w.assessed} assessed in ${esc(b.domain_name)} have this growth priority${w.high_priority ? `, ${w.high_priority} of them as High priority` : ""}.</li>
    ${w.program_models.length ? `<li>By program model: ${by(w.program_models)}.</li>` : ""}
    ${w.staff_sizes.length ? `<li>By staff size: ${by(w.staff_sizes, (n) => `${n} staff`)}.</li>` : ""}
    ${w.not_given ? `<li>${plural(w.not_given, "organization has", "organizations have")} not shared program or size details.</li>` : ""}
  </ul>`;
}

function briefHtml(b: Brief, h: number) {
  const id = `bt-${Math.random().toString(36).slice(2, 8)}`;
  return `<article class="brief" aria-labelledby="${id}">
    <span class="eyebrow">Training brief · ${esc(b.domain_name)}</span>
    <h${h} id="${id}" tabindex="-1">${esc(b.title)}</h${h}>
    <p class="notice brief__ai">${icon("info")}<span>Draft generated with AI from aggregated results; review before sharing. Counts come from the assessment data, not the AI.</span></p>
    <p><span class="chip">${esc(b.question_id)}</span> ${esc(b.statement)}</p>
    <h${h + 1}>Why it matters</h${h + 1}><p>${esc(b.why_it_matters)}</p>
    <h${h + 1}>Who it is for</h${h + 1}>${whoList(b)}
    <h${h + 1}>Session outline</h${h + 1}><ol>${b.session_outline.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <h${h + 1}>Before the session</h${h + 1}><p>${esc(b.pre_work)}</p>
    ${b.resources.length ? `<h${h + 1}>Resources</h${h + 1}><ul>${b.resources.map((r) => `<li><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">${esc(r.title)}<span class="visually-hidden"> (opens in a new tab)</span></a> <span class="meta">${esc(hostOf(r.url))}</span></li>`).join("")}</ul>` : ""}
    <h${h + 1}>Follow-up</h${h + 1}><p>${esc(b.follow_up)}</p>
    <p class="meta">Drafted ${esc(b.generated)}.</p>
    <button type="button" class="btn btn-secondary btn-sm" data-print-brief>${icon("download")}<span>Print this brief</span></button>
  </article>`;
}

async function openBrief(btn: HTMLButtonElement) {
  const slot = document.getElementById(btn.getAttribute("aria-controls")!)!;
  const holder = slot.closest<HTMLElement>(".brief-row") ?? slot;
  const open = btn.getAttribute("aria-expanded") !== "true";
  btn.setAttribute("aria-expanded", String(open));
  holder.hidden = !open;
  if (!open || slot.dataset.loaded) return;
  const qid = btn.dataset.brief!;
  slot.innerHTML = `<p class="loading" role="status">${icon("loader", "spin")}Writing a training brief. This takes about 20 seconds.</p>`;
  if (!briefs.has(qid)) briefs.set(qid, api.post<Brief>("/staff/briefs", { question_id: qid }));
  try {
    const b = await briefs.get(qid)!;
    slot.innerHTML = briefHtml(b, Number(slot.dataset.level || 3));
    slot.dataset.loaded = "1";
    focusEl(slot.querySelector("h3, h4"));
  } catch (e) {
    briefs.delete(qid);
    slot.innerHTML = `<p class="field-error" role="alert">${icon("alert")}<span>${esc(e instanceof ApiError && e.message ? e.message : "We could not write the brief. Please try again.")}</span></p>`;
    btn.setAttribute("aria-expanded", "false");
    holder.hidden = false; // keep the message visible; the next click retries
  }
}

/** Print only one brief: copy it into a top-level print area that the print stylesheet shows alone. */
function printBrief(article: HTMLElement) {
  const area = document.createElement("div");
  area.id = "print-area";
  area.innerHTML = article.outerHTML;
  document.body.append(area);
  document.documentElement.classList.add("print-brief");
  const done = () => { area.remove(); document.documentElement.classList.remove("print-brief"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

/** Delegated clicks for every brief button and print button inside `root`. */
export function wireBriefs(root: HTMLElement) {
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLButtonElement>("[data-brief]");
    if (btn) { openBrief(btn); return; }
    const print = t.closest<HTMLElement>("[data-print-brief]");
    if (print) printBrief(print.closest<HTMLElement>(".brief")!);
  });
}
