// "One at a time" questionnaire view: one statement per card, big Yes / No buttons, auto-advance.
// Laddered statements (public/content/ladders.json) are asked as one multiple-choice question that records an explicit
// yes or no for every statement in the group by a fixed cumulative rule; the person sees and can change each one.
// Nothing here scores: the engine still receives one yes or no per statement.

import type { Domain, Question } from "./api";
import { $, announce, esc, focusEl, plural } from "./dom";
import { icon } from "./icons";

export interface Ladder {
  id: string; question: string; question_es: string; statements: string[];
  choices: { label: string; label_es: string; yes: string[] }[];
}
type Step = { kind: "stmt"; q: Question } | { kind: "ladder"; l: Ladder };
type Answer = "yes" | "no";

export interface QuickCtx {
  domain: Domain;
  /** The area name in the question language. */
  name: string;
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
const CHEERS_ES = ["Muy bien, sigamos.", "Paso a paso. Siga así.", "Va avanzando muy bien.", "Gracias por ir una afirmación a la vez."];

/** Code-written encouragement, shown about every 5 answers. It never depends on whether the answers were Yes or No. */
function cheerLine(done: number, total: number, area: string, shown: number, es: boolean): string {
  const left = total - done;
  if (left <= 3) return es ? `Ya casi. ${plural(left, "afirmación pendiente", "afirmaciones pendientes")} en ${area}.` : `Almost there. ${plural(left, "statement", "statements")} left in ${area}.`;
  if (done * 10 >= total * 4 && done * 10 <= total * 6) return es ? `Va a la mitad de ${area}. Sigamos.` : `Halfway through ${area}. Let's keep going.`;
  return (es ? CHEERS_ES : CHEERS)[shown % CHEERS.length];
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
  // Cards in the order they were shown: Previous pops `seen`; Next after Previous walks `ahead` again before the next
  // unanswered card. An area opened part way starts as if its answered cards before this one had just been walked.
  const seen: number[] = steps.slice(0, pos).map((_, i) => i);
  const ahead: number[] = [];
  let reviewing = false; // "Look over this area": Next walks every card in order
  // Spanish questions get Spanish controls; `sp` is trusted HTML (escape any data put in it).
  const tr = (en: string, sp: string) => (ctx.spanish() ? `<span lang="es">${sp}</span>` : en);
  const yesNo = (v: Answer) => tr(v === "yes" ? "Yes" : "No", v === "yes" ? "Sí" : "No");

  host.innerHTML = `<section class="quick" aria-label="One statement at a time">
      <div class="quick__meter">
        <p class="quick__count" id="quick-count"></p>
        <progress id="area-progress" max="${steps.length}" value="0" aria-labelledby="quick-count"></progress>
      </div>
      <div class="quick__card" id="quick-card"></div>
    </section>`;
  const card = $("#quick-card", host)!;

  /** Where the person is: the current card's position among the area's cards (the area-complete card is the last). */
  function meter() {
    const m = steps.length;
    const n = Math.min(pos + 1, m);
    const count = $("#quick-count", host)!;
    // The area name is its own span: under 380px it is left for screen readers (the heading above names the area).
    count.innerHTML = ctx.spanish() ? `Pregunta ${n} de ${m}<span class="quick__count-area"> en ${esc(ctx.name)}</span>`
      : `Question ${n} of ${m}<span class="quick__count-area"> in ${esc(ctx.name)}</span>`;
    if (ctx.spanish()) count.lang = "es"; else count.removeAttribute("lang");
    const bar = $<HTMLProgressElement>("#area-progress", host)!;
    bar.value = n;
    bar.textContent = `${Math.round((n / m) * 100)}%`;
  }

  /** #30: every question card has Previous on the left and Next on the right. One with nowhere to go yet stays in its
   * place, marked unavailable (aria-disabled, so it is still focusable and its reason is its description); pressing it
   * shows the reason. `next` is the forward button's HTML for cards that move on another way. */
  function nav(fwdWhy: string | null, next?: string): string {
    const why = (id: string, text: string | null) => (text ? ` aria-disabled="true" aria-describedby="${id}-why"` : "");
    const prevWhy = seen.length ? null : tr("This is the first question in this area.", "Esta es la primera pregunta de esta área.");
    return `<div class="quick__nav">
        <button type="button" class="btn btn-secondary btn-sm" id="quick-prev"${why("quick-prev", prevWhy)}>${icon("arrow-left")}<span>${tr("Previous", "Anterior")}</span></button>
        ${next ?? `<button type="button" class="btn btn-secondary btn-sm" id="quick-fwd"${why("quick-fwd", fwdWhy)}><span>${tr("Next", "Siguiente")}</span>${icon("arrow-right")}</button>`}
      </div>
      ${prevWhy ? `<p class="quick__why" id="quick-prev-why" hidden>${icon("info")}<span>${prevWhy}</span></p>` : ""}
      ${fwdWhy ? `<p class="quick__why" id="quick-fwd-why" hidden>${icon("info")}<span>${fwdWhy}</span></p>` : ""}`;
  }

  function stmtStep(q: Question): string {
    const cur = a[q.id];
    const btn = (v: Answer) => `<button type="button" class="quick__btn" data-answer="${v}" aria-pressed="${cur === v}">
        <span class="quick__btn-label">${yesNo(v)}</span>
        <span class="answer__tag quick__tag" aria-hidden="true">${icon("check")}${tr("Selected", "Seleccionada")}</span>
        <kbd class="quick__key" aria-hidden="true">${v === "no" ? "N" : ctx.spanish() ? "S" : "Y"}</kbd>
      </button>`;
    return `
      <p class="quick__kicker"><span class="stage-badge">Stage ${q.stage}</span> ${esc(q.stage_name)}</p>
      <h2 class="quick__stmt" id="quick-focus" tabindex="-1">${ctx.stmt(q)}</h2>
      ${q.reverse ? `<p class="check-item__note">${icon("info")}<span>${tr("A Yes here counts as a growth priority.", "Un Sí aquí cuenta como prioridad de crecimiento.")}</span></p>` : ""}
      ${ctx.helpFor(q)}
      <div class="quick__answers" role="group" aria-labelledby="quick-focus">${btn("yes")}${btn("no")}</div>
      ${nav(cur ? null : tr("Choose Yes or No to go on.", "Elija Sí o No para seguir."))}
      <p class="quick__keys">${tr("Keyboard: press Y for Yes, N for No, or the left arrow to go back.", "Teclado: pulse S para Sí, N para No, o la flecha izquierda para volver.")}</p>`;
  }

  function chooseStep(l: Ladder): string {
    const yes = l.statements.filter((id) => a[id] === "yes").sort().join();
    // The current answers match at most one choice we mark as selected (two choices can record the same answers).
    const picked = l.statements.every((id) => a[id]) ? l.choices.findIndex((c) => [...c.yes].sort().join() === yes) : -1;
    const areas = [...new Set(l.statements.map((id) => ctx.byId.get(id)!.area))].join(" and ");
    const es = ctx.spanish() ? ' lang="es"' : "";
    return `
      <p class="quick__kicker"><span class="stage-badge">${tr("One question", "Una pregunta")}</span> ${tr(`Answers ${l.statements.length} statements`, `Responde ${l.statements.length} afirmaciones`)}</p>
      <h2 class="quick__stmt" id="quick-focus" tabindex="-1"${es}>${esc(ctx.spanish() ? l.question_es : l.question)}</h2>
      ${ctx.spanish() ? `<details class="q-help" lang="es"><summary>Ver el original en inglés</summary><p lang="en">${esc(l.question)}</p></details>` : ""}
      <p class="hint" id="quick-ladder-hint">${tr(`Your choice answers ${l.statements.length} statements in ${esc(areas)}. Next, you will see each answer and can change any of them.`,
        `Su elección responde ${l.statements.length} afirmaciones en ${esc(areas)}. Después verá cada respuesta y podrá cambiar cualquiera.`)}</p>
      <div class="quick__choices" role="group" aria-labelledby="quick-focus" aria-describedby="quick-ladder-hint"${es}>
        ${l.choices.map((c, i) => `<button type="button" class="quick__choice" data-choice="${i}" aria-pressed="${i === picked}">
          <span>${esc(ctx.spanish() ? c.label_es : c.label)}</span><span class="answer__tag quick__tag" aria-hidden="true">${icon("check")}${tr("Selected", "Seleccionada")}</span></button>`).join("")}
      </div>
      ${nav(l.statements.every((id) => a[id]) ? null : tr("Choose one answer to go on.", "Elija una respuesta para seguir."))}`;
  }

  /** #29: the answers a choice filled in, each as the same Yes / No pair as the rest of the questionnaire, already selected. */
  function confirmStep(l: Ladder): string {
    return `
      <h2 class="quick__stmt" id="quick-focus" tabindex="-1">${tr("Your choice filled in these answers", "Su elección llenó estas respuestas")}</h2>
      <p class="hint">${tr("We picked Yes or No for each statement below from your choice. Most groups grow through these in order, but not all do. If one is not right for you, choose the other answer.",
        "Marcamos Sí o No en cada afirmación según su elección. La mayoría de los grupos avanzan en este orden, pero no todos. Si alguna no es correcta para ustedes, elija la otra respuesta.")}</p>
      <ul class="ladder-list" role="list">${l.statements.map((id) => {
        const { q, area } = ctx.byId.get(id)!;
        return `<li class="ladder-item"><fieldset class="ladder-item__set">
          <legend class="ladder-item__text"><span class="ladder-item__area">${esc(area)}</span> ${ctx.stmt(q)}</legend>
          <div class="answer-row">${(["yes", "no"] as const).map((v) => `
            <label class="answer">
              <input type="radio" name="lad-${esc(id)}" value="${v}" data-lad="${esc(id)}"${a[id] === v ? " checked" : ""}>
              <span class="answer__text">${yesNo(v)}</span>
              <span class="answer__tag" aria-hidden="true">${icon("check")}${tr("Selected", "Seleccionada")}</span>
            </label>`).join("")}
          </div>
        </fieldset></li>`;
      }).join("")}</ul>
      <p class="quick__alt"><button type="button" class="btn btn-secondary btn-sm" id="quick-rechoose">${icon("refresh")}<span>${tr("Choose a different answer", "Elegir otra respuesta")}</span></button></p>
      ${nav(null, `<button type="button" class="btn btn-primary" id="quick-continue"><span>${tr("Looks right, continue", "Está bien, continuar")}</span>${icon("arrow-right")}</button>`)}`;
  }

  function doneStep(): string {
    return `<div class="quick-done">
        <span class="quick-done__badge" aria-hidden="true">${icon("circle-check")}</span>
        <h2 class="quick__stmt" id="quick-focus" tabindex="-1">${tr(`${esc(d.name)} complete`, `Área de ${esc(ctx.name)} completa`)}</h2>
        <p class="quick-done__cheer"${ctx.spanish() ? ' lang="es"' : ""}>${esc(ctx.cheer)}</p>
        <p class="hint">${tr(`All ${d.questions.length} statements in this area are answered. You can look back over them any time.`,
          `Las ${d.questions.length} afirmaciones de esta área están respondidas. Puede revisarlas cuando quiera.`)}</p>
        <div class="quick__nav">
          <button type="button" class="btn btn-secondary btn-sm" id="quick-review">${icon("arrow-left")}<span>${tr("Look over this area", "Revisar esta área")}</span></button>
          <button type="button" class="btn btn-primary" id="quick-next">${ctx.nextHtml}${icon("arrow-right")}</button>
        </div>
      </div>`;
  }

  function show(focus: boolean) {
    meter();
    const s = steps[pos];
    card.innerHTML = `${cheer ? `<p class="quick__cheer">${icon("sprout")}<span${ctx.spanish() ? ' lang="es"' : ""}>${esc(cheer)}</span></p>` : ""}${
      !s ? doneStep() : s.kind === "stmt" ? stmtStep(s.q) : confirm ? confirmStep(s.l) : chooseStep(s.l)}`;
    cheer = "";
    if (focus) focusEl($("#quick-focus", card));
  }

  /** Show card `i`; an answered multiple-choice question shows its "Based on your choice" step. */
  function at(i: number) {
    pos = i;
    confirm = steps[i]?.kind === "ladder" && answered(steps[i]);
    show(true);
  }

  /** Forward: the cards left by Previous first, then the next unanswered one after this, then any earlier one, else the area-complete card. */
  function advance() {
    seen.push(pos);
    if (ahead.length) { at(ahead.pop()!); return; }
    const after = steps.findIndex((s, i) => i > pos && !answered(s));
    at(reviewing ? pos + 1 : after >= 0 ? after : firstOpen());
  }

  /** A jump (error summary, "Look over this area") starts a new path: Previous returns to the card left. */
  function jump(i: number) {
    ahead.length = 0;
    if (i !== pos) seen.push(pos);
    at(i);
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
    if (since >= 5 && done < d.questions.length) { cheer = cheerLine(done, d.questions.length, ctx.name, shown++, ctx.spanish()); since = 0; }
    ctx.change(() => { a[s.q.id] = v; }, ctx.spanish() ? `Registramos ${v === "yes" ? "Sí" : "No"}. ${cheer ? `${cheer} ` : ""}` : `${v === "yes" ? "Yes" : "No"} recorded. ${cheer ? `${cheer} ` : ""}`);
    card.querySelectorAll<HTMLElement>("[data-answer]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.answer === v)));
    leave(advance);
  }

  function choose(i: number) {
    const s = steps[pos];
    if (busy || s?.kind !== "ladder") return;
    const c = s.l.choices[i];
    since += s.l.statements.length;
    ctx.change(() => { s.l.statements.forEach((id) => { a[id] = c.yes.includes(id) ? "yes" : "no"; }); },
      ctx.spanish() ? `Registramos ${c.yes.length} Sí y ${s.l.statements.length - c.yes.length} No según su elección. ` : `Recorded ${c.yes.length} Yes and ${s.l.statements.length - c.yes.length} No from your choice. `);
    leave(() => { confirm = true; show(true); });
  }

  function back() {
    if (busy || !seen.length) return;
    ahead.push(pos);
    at(seen.pop()!);
  }

  card.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>("button");
    if (!el) return;
    const why = el.getAttribute("aria-disabled") === "true" && document.getElementById(`${el.id}-why`);
    if (why) { why.hidden = false; announce(why.textContent ?? ""); return; }
    if (el.dataset.answer) answer(el.dataset.answer as Answer);
    else if (el.dataset.choice) choose(Number(el.dataset.choice));
    else if (el.id === "quick-prev") back();
    // Next on a multiple-choice question picked again shows what its answers are now, like a new choice does.
    else if (el.id === "quick-fwd" && steps[pos]?.kind === "ladder") { confirm = true; show(true); }
    else if (el.id === "quick-fwd" || el.id === "quick-continue") leave(advance);
    else if (el.id === "quick-rechoose") { confirm = false; show(true); }
    else if (el.id === "quick-review") { reviewing = true; jump(0); }
    // A real submit, so the teammate hand-off in draft.ts can take over.
    else if (el.id === "quick-next") $<HTMLFormElement>("#area-form")?.requestSubmit();
  });
  // A recorded answer flipped on "Your choice filled in these answers".
  card.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const id = input.dataset.lad;
    if (!id) return;
    const v = input.value as Answer;
    ctx.change(() => { a[id] = v; }, ctx.spanish() ? `Cambiado a ${v === "yes" ? "Sí" : "No"}. ` : `Changed to ${v === "yes" ? "Yes" : "No"}. `);
  });

  // Single-key shortcuts work only while focus is inside the card (WCAG 2.1.4).
  card.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "y" || k === "n" || (k === "s" && ctx.spanish())) {
      if (steps[pos]?.kind !== "stmt") return;
      e.preventDefault();
      answer(k === "n" ? "no" : "yes");
    } else if (e.key === "ArrowLeft" && !(e.target as HTMLElement).matches("input")) { // arrows move between radios
      e.preventDefault();
      back();
    }
  });

  show(false);

  return {
    goTo(id: string) {
      const i = steps.findIndex((s) => (s.kind === "stmt" ? s.q.id === id : s.l.statements.includes(id)));
      if (i < 0) return;
      jump(i);
    },
  };
}
