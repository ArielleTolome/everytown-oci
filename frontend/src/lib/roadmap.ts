// Your 12-week roadmap (W2): the /plan/ page and the teaser card on the results page.
// The server builds the weeks and computes progress, points and badges; this file only renders and sends ticks.
import { api, ApiError, type Assessment, type Resource } from "./api";
import { $, $$, announce, esc, focusEl, hostOf, plural, safeUrl } from "./dom";
import { icon } from "./icons";
import { errorText, fold, PHONE, wireDownloads } from "./report-ui";

export interface RoadmapTask { id: string; text: string; gap_ids: string[]; owner: string; lang: string; done: boolean; retake?: boolean }
export interface RoadmapWeek {
  n: number; title: string; lang: string; focus: boolean; state: "open" | "done" | "locked"; unlocks_on: string;
  done_count: number; task_count: number;
  /** Missing on locked weeks, except for Everytown staff. */
  why?: string; resource?: Resource | null; tasks?: RoadmapTask[];
}
export interface Badge { id: string; name: string; description: string; earned: boolean }
export interface Roadmap {
  assessment_id: string; org_name: string; language: string; ai: boolean; staff: boolean;
  weeks: RoadmapWeek[]; total_tasks: number; done_tasks: number; weeks_done: number; pct: number; points: number;
  level: string; next_level: { name: string; steps: number } | null; streak: number; best_streak: number;
  badges: Badge[]; current_week: number | null; next_unlock: { week: number; date: string } | null;
  statements: Record<string, string>;
  celebrate?: { weeks: number[]; opened: number[]; points: number; badges: string[] };
}

const path = (id: string) => `/assessments/${encodeURIComponent(id)}/roadmap`;
export const getRoadmap = (id: string) => api.get<Roadmap>(path(id));

// Badge medallions: Lucide paths (ISC), drawn like icons.ts.
const BADGE_PATHS: Record<string, string> = {
  "first-step": '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  "week-one": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  foundation: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  "on-a-roll": '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  halfway: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  complete: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  retake: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
};
const svg = (name: string, cls = "") => `<svg class="icon ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${BADGE_PATHS[name] ?? ""}</svg>`;

/** "2026-11-10" → "Tue, Nov 10" (local calendar date, no time zone shift). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function bar(pct: number, label: string): string {
  return `<div class="rm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(label)}"><span class="rm-bar__fill" style="width:${pct}%"></span></div>`;
}

const where = (r: Roadmap) => r.current_week ?? (r.weeks_done === r.weeks.length ? r.weeks.length : r.next_unlock?.week ?? 1);

// ---------- results page teaser (placed by results.ts inside its own <section> and <h2>) ----------

/** Placeholder for the "Your 12-week roadmap" card; "" when there is nothing to plan yet. */
export function roadmapTeaser(sub: Assessment): string {
  if (sub.status === "running" || !sub.gaps?.length) return "";
  return `<div class="card rm-teaser" data-rm-teaser aria-busy="true"><p class="loading">${icon("loader", "spin")}Loading your roadmap</p></div>`;
}

/** Fill the teaser from the API. A session that may not see the roadmap, or a failed load, gets a plain notice. */
export function wireRoadmapTeaser(root: HTMLElement, roadmap: Promise<Roadmap> | null): void {
  const box = $("[data-rm-teaser]", root);
  if (!box || !roadmap) return;
  roadmap.then((r) => fillRoadmapTeaser(root, r)).catch((ex) => {
    box.removeAttribute("aria-busy");
    box.innerHTML = ex instanceof ApiError && ex.status === 403
      ? `<p class="rm-teaser__note">${icon("lock")}<span>Only the person who submitted this assessment, or Everytown staff, can open its roadmap.</span></p>`
      : `<p class="rm-teaser__note">${icon("info")}<span>${esc(errorText(ex, "We could not load your roadmap right now. Reload the page to try again."))}</span></p>`;
  });
}

/** (Re)draw the teaser from roadmap state, also after a Start here tick on the same page. */
export function fillRoadmapTeaser(root: ParentNode, r: Roadmap): void {
  const box = $("[data-rm-teaser]", root);
  if (!box) return;
  const now = where(r);
  const week = r.weeks.find((w) => w.n === now);
  const todo = (week?.tasks ?? []).filter((t) => !t.done).slice(0, 3);
  const allDone = r.weeks_done === r.weeks.length;
  box.innerHTML = `
    <div class="rm-teaser__head">
      <h3>${allDone ? "All 12 weeks done" : `Week ${now} of ${r.weeks.length}`}<span class="visually-hidden">, </span><span class="rm-teaser__count">${r.done_tasks} of ${plural(r.total_tasks, "step", "steps")} done</span></h3>
      <span class="rm-chip">${svg("first-step")}${esc(r.level)} · ${r.points} points</span>
    </div>
    ${bar(r.pct, "Roadmap progress")}
    ${allDone ? `<p>You finished every step. Take the assessment again to see how far you have come.</p>`
      : r.current_week === null && r.next_unlock ? `<p class="rm-teaser__note">${icon("lock")}<span>This week is done. Week ${r.next_unlock.week} opens on ${esc(shortDate(r.next_unlock.date))}.</span></p>`
      : week?.focus && todo.length ? `<p>This week's steps are the ones in Start here, above. Tick them there or on your roadmap.</p>`
      : todo.length ? `<p class="mini-label">This week</p><ul class="rm-teaser__list" role="list">${todo.map((t) => `<li>${icon("circle-dashed")}<span lang="${esc(t.lang)}">${esc(t.text)}</span></li>`).join("")}</ul>` : ""}
    <p class="rm-teaser__cta"><a class="btn btn-primary" href="/plan/?id=${encodeURIComponent(r.assessment_id)}"><span>Open my roadmap</span>${icon("arrow-right")}</a></p>`;
  box.removeAttribute("aria-busy");
}

/** Mark one roadmap task done or not; returns the new roadmap state. */
export const setRoadmapTask = (id: string, task: string, done: boolean) =>
  api.post<Roadmap>(`${path(id)}/tasks/${encodeURIComponent(task)}`, { done });

// ---------- /plan/ page ----------

function weekHead(w: RoadmapWeek, current: boolean): string {
  const status = w.state === "done" ? `${icon("circle-check")}<span>Done · ${plural(w.task_count, "step", "steps")}</span>`
    : w.done_count ? `${icon("clock")}<span>${w.done_count} of ${plural(w.task_count, "step", "steps")} done</span>`
    : `${icon("circle-dashed")}<span>Not started · ${plural(w.task_count, "step", "steps")}</span>`;
  return `<div class="rm-week__head">
      <span class="rm-week__num" aria-hidden="true">${w.n}</span>
      <div>
        ${current ? `<span class="rm-tag">This week</span>` : w.focus ? `<span class="rm-tag rm-tag--plain">Start here priority</span>` : ""}
        <h3 id="week-${w.n}-title" tabindex="-1">Week ${w.n}: <span lang="${esc(w.lang)}">${esc(w.title)}</span></h3>
        <p class="rm-week__status" id="week-${w.n}-status" data-state="${w.done_count ? (w.state === "done" ? "done" : "some") : "none"}">${status}</p>
      </div>
    </div>`;
}

function taskItem(t: RoadmapTask, w: RoadmapWeek, r: Roadmap, editable: boolean): string {
  const based = t.gap_ids.filter((g) => r.statements[g]);
  const label = t.retake ? `${esc(t.text)} <a href="/">(start a new assessment)</a>` : esc(t.text);
  // The whole row (box and text) is one label, so a tap anywhere on the step ticks it.
  return `<li class="rm-task${t.done ? " is-done" : ""}${editable ? " rm-task--edit" : ""}">
      ${editable ? "" : `<span class="rm-task__mark">${icon(t.done ? "circle-check" : "circle")}<span class="visually-hidden">${t.done ? "Done" : "Not done"}</span></span>`}
      <div class="rm-task__body">
        ${editable ? `<label class="rm-task__check"><input type="checkbox" id="task-${esc(t.id)}" data-task="${esc(t.id)}" data-week="${w.n}" ${t.done ? "checked" : ""} aria-describedby="week-${w.n}-status"><span lang="${esc(t.lang)}">${label}</span></label>` : `<p lang="${esc(t.lang)}">${label}</p>`}
        <div class="rm-task__meta">
          <span class="role-chip">${icon("user")}<span class="visually-hidden">Owner: </span><span lang="${esc(w.lang)}">${esc(t.owner)}</span></span>
          ${based.length ? `<details class="about rm-basis"><summary>Based on your answers to ${plural(based.length, "statement", "statements")}</summary><ul class="basis__list" role="list" lang="en">${based.map((g) => `<li>${icon("circle-dashed")}<span>${esc(r.statements[g])}</span></li>`).join("")}</ul></details>` : ""}
        </div>
      </div>
    </li>`;
}

function weekBody(w: RoadmapWeek, r: Roadmap, editable: boolean): string {
  const tasks = w.tasks ?? [];
  const why = w.why ? `<div class="inset"><p class="mini-label">Why this matters</p><p lang="${esc(w.lang)}">${esc(w.why)}</p></div>` : "";
  const steps = `<fieldset class="rm-tasks">
      <legend class="mini-label">This week's steps</legend>
      <ul role="list">${tasks.map((t) => taskItem(t, w, r, editable)).join("")}</ul>
    </fieldset>`;
  // Phones: the steps come first, so this week's checkboxes are near the top of the screen.
  return `
    ${PHONE.matches ? steps + why : why + steps}
    <p class="field-error rm-week__error" id="week-${w.n}-error" role="alert" hidden></p>
    ${w.resource?.url ? `<p class="resource-link">${icon("book")}<span><span class="visually-hidden">Resource: </span><a href="${esc(safeUrl(w.resource.url))}" rel="noopener" lang="${esc(w.lang)}">${esc(w.resource.title)}</a> <span class="url-domain">(${esc(hostOf(w.resource.url))})</span></span></p>` : ""}
    <p class="rm-week__actions"><a class="btn btn-secondary btn-sm" href="/api${path(r.assessment_id)}/week/${w.n}.pdf" download data-download>${icon("download")}<span>Download week ${w.n} (PDF)</span></a></p>`;
}

function weekCard(w: RoadmapWeek, r: Roadmap): string {
  const current = w.n === r.current_week;
  if (w.state === "locked") {
    return `<li class="card rm-week rm-week--locked" data-week="${w.n}">
      <div class="rm-week__head">
        <span class="rm-week__num rm-week__num--locked" aria-hidden="true">${icon("lock")}</span>
        <div>
          <h3 id="week-${w.n}-title" tabindex="-1">Week ${w.n}: <span class="visually-hidden">coming up, </span><span lang="${esc(w.lang)}">${esc(w.title)}</span></h3>
          <p class="rm-week__status"><span class="rm-week__long">Coming up. Opens on ${esc(shortDate(w.unlocks_on))}, or sooner when you finish week ${w.n - 1}.</span><span class="rm-week__short" aria-hidden="true">Opens on ${esc(shortDate(w.unlocks_on))}</span></p>
        </div>
      </div>
      ${r.staff && w.tasks ? `<details class="about"><summary>Staff view: see the ${plural(w.task_count, "step", "steps")}</summary>${weekBody(w, r, false)}</details>` : ""}
    </li>`;
  }
  if (w.state === "done") {
    return `<li class="card rm-week rm-week--done" data-week="${w.n}">
      ${weekHead(w, false)}
      <details class="about"><summary>Show the ${plural(w.task_count, "step", "steps")}</summary>${weekBody(w, r, true)}</details>
    </li>`;
  }
  return `<li class="card rm-week rm-week--open${current ? " is-current" : ""}" data-week="${w.n}">${weekHead(w, current)}${weekBody(w, r, true)}</li>`;
}

function badges(list: Badge[]): string {
  const earned = list.filter((b) => b.earned).length;
  return `<p class="section-lead">You have earned ${earned} of ${list.length} badges.</p>
    ${fold(`Show all ${list.length} badges`, `<ul class="rm-badges" role="list">${list.map((b) => `
      <li class="rm-badge${b.earned ? " is-earned" : ""}">
        <span class="rm-badge__medal">${svg(b.id)}</span>
        <span class="rm-badge__name">${esc(b.name)}</span>
        <span class="rm-badge__state">${b.earned ? `${icon("check")}Earned` : "Not yet"}</span>
        <span class="rm-badge__desc">${esc(b.description)}</span>
      </li>`).join("")}
    </ul>`)}`;
}

function summary(r: Roadmap): string {
  const now = where(r);
  return `<div class="card rm-summary">
      <ul class="rm-chips" role="list">
        <li class="rm-chip">${svg("first-step")}<span><span class="visually-hidden">Level: </span>${esc(r.level)}</span></li>
        <li class="rm-chip">${icon("star")}<span>${r.points} points</span></li>
        ${r.streak ? `<li class="rm-chip">${svg("flame")}<span>${plural(r.streak, "week", "weeks")} in a row</span></li>` : ""}
      </ul>
      <p class="rm-summary__line"><strong>${r.weeks_done === r.weeks.length ? "All 12 weeks done" : `Week ${now} of ${r.weeks.length}`}</strong> · ${r.done_tasks} of ${plural(r.total_tasks, "step", "steps")} done (${r.pct}%)</p>
      ${bar(r.pct, "Roadmap progress")}
      <p class="rm-summary__hint">${r.next_level ? `${plural(r.next_level.steps, "more step", "more steps")} to reach <strong>${esc(r.next_level.name)}</strong>.` : "You reached the top level: Leading."}
        ${r.next_unlock ? ` Week ${r.next_unlock.week} opens on ${esc(shortDate(r.next_unlock.date))}.` : ""}</p>
    </div>`;
}

function page(r: Roadmap, cheer: string): string {
  const report = `/results/?id=${encodeURIComponent(r.assessment_id)}`;
  const who = r.staff ? "the" : "your";
  const head = `
    <div class="title-band">
      <p class="rm-back">${r.staff ? `<a href="/staff/">${icon("arrow-left")} Back to staff dashboard</a> · ` : ""}<a href="${report}">${icon("arrow-left")} Back to ${who} full report</a></p>
      <span class="eyebrow">${r.staff ? "12-week roadmap (staff view)" : "Your 12-week roadmap"}</span>
      <h1 id="plan-title" tabindex="-1">${esc(r.org_name)}: ${who} roadmap</h1>
      ${r.weeks.length ? `<p class="lead">One week at a time. A new week opens when you finish the one before, or 7 days after it opened.</p>` : ""}
    </div>`;
  const back = `<p class="section-gap"><a href="${report}">${icon("arrow-left")} Back to ${who} full report</a></p>`;
  if (!r.weeks.length) {
    return `${head}<p class="notice">${icon("circle-check")}<span>There is nothing on this roadmap yet. The answers show no growth priorities in the areas assessed, so there are no weekly steps to plan. Keep doing what works, and take the assessment again in 90 days.</span></p>${back}`;
  }
  // The work comes first; badges follow it, because they only count the steps. Phones put this week before the totals.
  const progress = `<section class="section rm-section" aria-labelledby="rm-progress-title">
      <h2 id="rm-progress-title" class="visually-hidden">Your progress</h2>
      ${summary(r)}
    </section>`;
  const weeks = `<section class="section rm-section" aria-labelledby="rm-weeks-title">
      <div class="section-head"><div><span class="eyebrow">${r.ai ? "From your report" : "From your answers"}</span><h2 id="rm-weeks-title">Week by week</h2></div></div>
      <div class="rm-cheer" id="rm-cheer" ${cheer ? "" : "hidden"}>${cheer}</div>
      <ol class="rm-weeks" role="list">${r.weeks.map((w) => weekCard(w, r)).join("")}</ol>
    </section>`;
  return `${head}
    ${PHONE.matches ? weeks + progress : progress + weeks}
    <section class="section rm-section" aria-labelledby="rm-badges-title">
      <div class="section-head"><div><span class="eyebrow">For follow-through</span><h2 id="rm-badges-title">Your badges</h2></div></div>
      ${badges(r.badges)}
    </section>
    <p class="notice section-gap">${icon("info")}<span>Points and badges count the steps you finish, never your answers or scores. Only your organization and Everytown staff can see this roadmap.</span></p>
    ${back}`;
}

/** Confetti for a finished week; skipped entirely when the reader prefers reduced motion (the glow stays static). */
function confetti(card: HTMLElement | null) {
  if (!card) return;
  card.classList.add("rm-glow");
  window.setTimeout(() => card.classList.remove("rm-glow"), 2400);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.className = "rm-confetti";
  layer.setAttribute("aria-hidden", "true");
  const colors = ["var(--et-navy)", "var(--et-royal)", "var(--color-csf-orange)", "var(--et-light)"];
  layer.innerHTML = Array.from({ length: 28 }, (_, i) =>
    `<span style="left:${(i * 37) % 100}%;background:${colors[i % 4]};animation-delay:${(i % 7) * 60}ms;--drift:${((i * 53) % 60) - 30}px"></span>`).join("");
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 2600);
}

export async function mountPlan(root: HTMLElement, id: string): Promise<void> {
  let state = await getRoadmap(id);
  let chain = Promise.resolve();
  const render = (cheer = "") => {
    document.title = `Your roadmap: ${state.org_name} · OCI Capacity Coach`;
    root.innerHTML = page(state, cheer);
    root.removeAttribute("aria-busy");
  };
  render();
  wireDownloads(root);

  root.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.matches("input[data-task]")) return;
    const task = box.dataset.task!, week = Number(box.dataset.week), done = box.checked;
    chain = chain.then(async () => {
      try {
        state = await setRoadmapTask(id, task, done);
      } catch (ex) {
        box.checked = !done;
        const err = $(`#week-${week}-error`, root);
        if (err) {
          err.innerHTML = `${icon("alert")}<span>${esc(errorText(ex, "We could not save that step. Please try again."))}</span>`;
          err.hidden = false;
        }
        return;
      }
      const c = state.celebrate;
      const finished = c?.weeks ?? [];
      const parts: string[] = [];
      if (finished.length) parts.push(`Week ${finished.join(" and ")} done! +${c!.points} points.`);
      if (c?.opened.length) parts.push(`Week ${c.opened.join(" and ")} is open.`);
      if (c?.badges.length) parts.push(`New badge: ${c.badges.join(", ")}.`);
      render(finished.length ? `${icon("circle-check")}<span>${esc(parts.join(" "))}</span>` : "");
      if (finished.length) {
        const next = c!.opened[0] ?? state.current_week;
        confetti($(`[data-week="${finished[0]}"]`, root));
        // The "Week N done!" line goes to the top of the week it points to, so it shows with that week's focused
        // heading; above the list it was off screen once a few weeks were done (on phones from week 1).
        const card = next ? $(`li[data-week="${next}"]`, root) : null;
        if (card) card.prepend($("#rm-cheer", root)!);
        focusEl($(next ? `#week-${next}-title` : "#rm-cheer", root));
        $("#rm-cheer", root)!.scrollIntoView({ block: "nearest" });
        announce(parts.join(" "));
      } else {
        $<HTMLInputElement>(`#task-${CSS.escape(task)}`, root)?.focus();
        const w = state.weeks.find((x) => x.n === week);
        announce(`${done ? "Step done" : "Step not done"}. ${w ? `${w.done_count} of ${w.task_count} steps done this week.` : ""}${parts.length ? " " + parts.join(" ") : ""}`);
      }
    });
  });
  // Keep the newest error from piling up once the reader acts again.
  root.addEventListener("focusin", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>(".rm-week");
    if (card) $$(".rm-week__error", card).forEach((el) => { el.hidden = true; });
  });
}
