// "One at a time" questionnaire view: one statement per card, big Yes / No buttons, auto-advance.
// Laddered statements (public/content/ladders.json) are asked as one multiple-choice question that records an explicit
// yes or no for every statement in the group by a fixed cumulative rule; the person sees and can change each one.
// Nothing here scores: the engine still receives one yes or no per statement.

import type { Domain, Question } from "./api";
import { $, esc, focusEl, plural } from "./dom";
import { icon } from "./icons";

export interface Ladder {
  id: string; question: string; question_es: string; statements: string[];
  choices: { label: string; label_es: string; yes: string[] }[];
}
type Step = { kind: "stmt"; q: Question } | { kind: "ladder"; l: Ladder };
type Answer = "yes" | "no";

export interface QuickCtx {
  domain: Domain;
  answers: Record<string, Answer>;
  ladders: Ladder[];
  /** Every statement of the chosen areas, with its area name (a ladder can span two areas). */
  byId: Map<string, { q: Question; area: string }>;
  spanish: () => boolean;
  stmt: (q: Question) => string;
  helpFor: (q: Question) => string;
  /** Apply answer changes, save the draft and update the status line (prefix is announced first). */
  change: (apply: () => void, prefix: string) => void;
  cheer: string;
  /** Label of the area-complete button, as escaped HTML (a `<span>`), so a long area name can be hidden on phones. */
  nextHtml: string;
}

/** Ladders limited to the chosen areas. A group with fewer than 2 statements left is asked statement by statement. */
export function scopeLadders(all: Ladder[], ids: Set<string>): Ladder[] {
  return all
    .map((l) => ({ ...l, statements: l.statements.filter((id) => ids.has(id)), choices: l.choices.map((c) => ({ ...c, yes: c.yes.filter((id) => ids.has(id)) })) }))
    .filter((l) => l.statements.length >= 2);
}

/** Area statements in stage order (same order and numbering as the other views); a ladder replaces its first statement. */
function stepsFor(d: Domain, ladders: Ladder[]): Step[] {
  const seen = new Set<string>();
  const out: Step[] = [];
  for (const q of [...d.questions].sort((a, b) => a.stage - b.stage)) {
    const l = ladders.find((x) => x.statements.includes(q.id));
    if (!l) out.push({ kind: "stmt", q });
    else if (!seen.has(l.id)) { seen.add(l.id); out.push({ kind: "ladder", l }); }
  }
  return out;
}

const CHEERS = ["Great job, let's keep going.", "Nice and steady. Keep it up.", "You are making good progress.", "Thank you for taking this one step at a time."];

/** Code-written encouragement, shown about every 5 answers. It never depends on whether the answers were Yes or No. */
function cheerLine(done: number, total: number, area: string, shown: number): string {
  const left = total - done;
  if (left <= 3) return `Almost there. ${plural(left, "statement", "statements")} left in ${area}.`;
  if (done * 10 >= total * 4 && done * 10 <= total * 6) return `Halfway through ${area}. Let's keep going.`;
  return CHEERS[shown % CHEERS.length];
}

/** Render the view into `host`; returns `goTo(statementId)` for the error summary links. */
export function mountQuick(host: HTMLElement, ctx: QuickCtx) {
  const d = ctx.domain;
  const steps = stepsFor(d, ctx.ladders);
  const a = ctx.answers;
  const answered = (s: Step) => (s.kind === "stmt" ? !!a[s.q.id] : s.l.statements.every((id) => a[id]));
  const firstOpen = () => { const i = steps.findIndex((s) => !answered(s)); return i < 0 ? steps.length : i; };
  let pos = firstOpen();
  let confirm = false; // ladder step: showing "Based on your choice, we recorded"
  let busy = false;
  let since = 0; // answers since the last encouragement line
  let shown = 0;
  let cheer = "";

  host.innerHTML = `<section class="quick" aria-label="One statement at a time">
      <div class="quick__meter">
        <p class="quick__count" id="quick-count"></p>
        <progress id="area-progress" max="${d.questions.length}" value="0" aria-labelledby="quick-count"></progress>
      </div>
      <div class="quick__card" id="quick-card"></div>
    </section>`;
  const card = $("#quick-card", host)!;

  function meter() {
    const done = d.questions.filter((q) => a[q.id]).length;
    $("#quick-count", host)!.textContent = `${done} of ${d.questions.length} answered in ${d.name}`;
    const bar = $<HTMLProgressElement>("#area-progress", host)!;
    bar.value = done;
    bar.textContent = `${Math.round((done / d.questions.length) * 100)}%`;
  }

  const prevBtn = () => (pos > 0 ? `<button type="button" class="btn btn-secondary btn-sm" id="quick-prev">${icon("arrow-left")}<span>Previous</span></button>` : "");

  function stmtStep(q: Question): string {
    const cur = a[q.id];
    const btn = (v: Answer) => `<button type="button" class="quick__btn" data-answer="${v}" aria-pressed="${cur === v}">
        <span class="quick__btn-label">${v === "yes" ? "Yes" : "No"}</span>
        <span class="answer__tag quick__tag" aria-hidden="true">${icon("check")}Selected</span>
        <kbd class="quick__key" aria-hidden="true">${v === "yes" ? "Y" : "N"}</kbd>
      </button>`;
    return `
      <p class="quick__kicker"><span class="stage-badge">Stage ${q.stage}</span> ${esc(q.stage_name)}</p>
      <h2 class="quick__stmt" id="quick-focus" tabindex="-1">${ctx.stmt(q)}</h2>
      ${q.reverse ? `<p class="check-item__note">${icon("info")}<span>A Yes here counts as a growth priority.</span></p>` : ""}
      ${ctx.helpFor(q)}
      <div class="quick__answers" role="group" aria-labelledby="quick-focus">${btn("yes")}${btn("no")}</div>
      <div class="quick__nav">${prevBtn()}${cur ? `<button type="button" class="btn btn-secondary btn-sm" id="quick-fwd"><span>Keep my answer</span>${icon("arrow-right")}</button>` : ""}</div>
      <p class="quick__keys">Keyboard: press Y for Yes, N for No, or the left arrow to go back.</p>`;
  }

  function chooseStep(l: Ladder): string {
    const yes = l.statements.filter((id) => a[id] === "yes").sort().join();
    // The current answers match at most one choice we mark as selected (two choices can record the same answers).
    const picked = l.statements.every((id) => a[id]) ? l.choices.findIndex((c) => [...c.yes].sort().join() === yes) : -1;
    const areas = [...new Set(l.statements.map((id) => ctx.byId.get(id)!.area))].join(" and ");
    const es = ctx.spanish() ? ' lang="es"' : "";
    return `
      <p class="quick__kicker"><span class="stage-badge">One question</span> Answers ${l.statements.length} statements</p>
      <h2 class="quick__stmt" id="quick-focus" tabindex="-1"${es}>${esc(ctx.spanish() ? l.question_es : l.question)}</h2>
      ${ctx.spanish() ? `<details class="q-help" lang="es"><summary>Ver el original en inglés</summary><p lang="en">${esc(l.question)}</p></details>` : ""}
      <p class="hint" id="quick-ladder-hint">Your choice answers ${l.statements.length} statements in ${esc(areas)}. Next, you will see each answer and can change any of them.</p>
      <div class="quick__choices" role="group" aria-labelledby="quick-focus" aria-describedby="quick-ladder-hint"${es}>
        ${l.choices.map((c, i) => `<button type="button" class="quick__choice" data-choice="${i}" aria-pressed="${i === picked}">
          <span>${esc(ctx.spanish() ? c.label_es : c.label)}</span><span class="answer__tag quick__tag" aria-hidden="true">${icon("check")}Selected</span></button>`).join("")}
      </div>
      <div class="quick__nav">${prevBtn()}</div>`;
  }

  const ansText = (id: string) => `${icon(a[id] === "yes" ? "circle-check" : "circle-x")}<strong>${a[id] === "yes" ? "Yes" : "No"}</strong>`;
  const flipText = (id: string) => `Change to ${a[id] === "yes" ? "No" : "Yes"}`;

  function confirmStep(l: Ladder): string {
    return `
      <h2 class="quick__stmt" id="quick-focus" tabindex="-1">Based on your choice, we recorded:</h2>
      <p class="hint">Most organizations grow through these in order, but not all do. If one is not true for you, change it.</p>
      <ul class="ladder-list" role="list">${l.statements.map((id) => {
        const { q, area } = ctx.byId.get(id)!;
        return `<li class="ladder-item">
          <p class="ladder-item__text" id="lt-${esc(id)}"><span class="ladder-item__area">${esc(area)}</span> ${ctx.stmt(q)}</p>
          <p class="ladder-item__ans is-${a[id]}" id="la-${esc(id)}">${ansText(id)}</p>
          <button type="button" class="btn btn-secondary btn-sm ladder-item__flip" data-flip="${esc(id)}" aria-describedby="lt-${esc(id)}">${icon("pencil")}<span>${flipText(id)}</span></button>
        </li>`;
      }).join("")}</ul>
      <div class="quick__nav">${prevBtn()}
        <button type="button" class="btn btn-secondary btn-sm" id="quick-rechoose">${icon("refresh")}<span>Choose a different answer</span></button>
        <button type="button" class="btn btn-primary" id="quick-continue"><span>Looks right, continue</span>${icon("arrow-right")}</button>
      </div>`;
  }

  function doneStep(): string {
    return `<div class="quick-done">
        <span class="quick-done__badge" aria-hidden="true">${icon("circle-check")}</span>
        <h2 class="quick__stmt" id="quick-focus" tabindex="-1">${esc(d.name)} complete</h2>
        <p class="quick-done__cheer">${esc(ctx.cheer)}</p>
        <p class="hint">All ${d.questions.length} statements in this area are answered. You can look back over them any time.</p>
        <div class="quick__nav">
          <button type="button" class="btn btn-secondary btn-sm" id="quick-review">${icon("arrow-left")}<span>Look over this area</span></button>
          <button type="button" class="btn btn-primary" id="quick-next">${ctx.nextHtml}${icon("arrow-right")}</button>
        </div>
      </div>`;
  }

  function show(focus: boolean) {
    meter();
    const s = steps[pos];
    card.innerHTML = `${cheer ? `<p class="quick__cheer">${icon("sprout")}<span>${esc(cheer)}</span></p>` : ""}${
      !s ? doneStep() : s.kind === "stmt" ? stmtStep(s.q) : confirm ? confirmStep(s.l) : chooseStep(s.l)}`;
    cheer = "";
    if (focus) focusEl($("#quick-focus", card));
  }

  /** Next unanswered step after this one, then any earlier one, else the area-complete screen. */
  function advance() {
    const after = steps.findIndex((s, i) => i > pos && !answered(s));
    pos = after >= 0 ? after : firstOpen();
    confirm = false;
    show(true);
  }

  /** Short exit transition (none under reduced motion), then the next card. */
  function leave(then: () => void) {
    busy = true;
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250;
    card.classList.add("is-leaving");
    window.setTimeout(() => { card.classList.remove("is-leaving"); busy = false; then(); }, ms);
  }

  function answer(v: Answer) {
    const s = steps[pos];
    if (busy || s?.kind !== "stmt") return;
    since++;
    const done = d.questions.filter((q) => a[q.id] || q.id === s.q.id).length;
    if (since >= 5 && done < d.questions.length) { cheer = cheerLine(done, d.questions.length, d.name, shown++); since = 0; }
    ctx.change(() => { a[s.q.id] = v; }, `${v === "yes" ? "Yes" : "No"} recorded. ${cheer ? `${cheer} ` : ""}`);
    card.querySelectorAll<HTMLElement>("[data-answer]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.answer === v)));
    leave(advance);
  }

  function choose(i: number) {
    const s = steps[pos];
    if (busy || s?.kind !== "ladder") return;
    const c = s.l.choices[i];
    since += s.l.statements.length;
    ctx.change(() => { s.l.statements.forEach((id) => { a[id] = c.yes.includes(id) ? "yes" : "no"; }); },
      `Recorded ${c.yes.length} Yes and ${s.l.statements.length - c.yes.length} No from your choice. `);
    leave(() => { confirm = true; show(true); });
  }

  function back() {
    if (busy || pos === 0) return;
    pos--;
    confirm = steps[pos].kind === "ladder" && answered(steps[pos]);
    show(true);
  }

  card.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>("button");
    if (!el) return;
    if (el.dataset.answer) answer(el.dataset.answer as Answer);
    else if (el.dataset.choice) choose(Number(el.dataset.choice));
    else if (el.dataset.flip) {
      const id = el.dataset.flip;
      const v: Answer = a[id] === "yes" ? "no" : "yes";
      ctx.change(() => { a[id] = v; }, `Changed to ${v === "yes" ? "Yes" : "No"}. `);
      const ans = document.getElementById(`la-${id}`)!;
      ans.className = `ladder-item__ans is-${v}`;
      ans.innerHTML = ansText(id);
      el.querySelector("span")!.textContent = flipText(id);
    } else if (el.id === "quick-prev") back();
    else if (el.id === "quick-fwd" || el.id === "quick-continue") leave(advance);
    else if (el.id === "quick-rechoose") { confirm = false; show(true); }
    else if (el.id === "quick-review") { pos = 0; confirm = answered(steps[0]) && steps[0].kind === "ladder"; show(true); }
    // A real submit, so the teammate hand-off in draft.ts can take over.
    else if (el.id === "quick-next") $<HTMLFormElement>("#area-form")?.requestSubmit();
  });

  // Single-key shortcuts work only while focus is inside the card (WCAG 2.1.4).
  card.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "y" || k === "n") {
      if (steps[pos]?.kind !== "stmt") return;
      e.preventDefault();
      answer(k === "y" ? "yes" : "no");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  });

  show(false);

  return {
    goTo(id: string) {
      const i = steps.findIndex((s) => (s.kind === "stmt" ? s.q.id === id : s.l.statements.includes(id)));
      if (i < 0) return;
      pos = i;
      confirm = steps[i].kind === "ladder" && answered(steps[i]);
      show(true);
    },
  };
}
