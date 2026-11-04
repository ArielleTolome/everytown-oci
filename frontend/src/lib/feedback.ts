// "Does this feel right?" (v1.7): one feedback card near the end of the report. The owner answers Yes / Not quite
// (GET/POST /api/assessments/<id>/feedback); staff see the answers read-only. Anyone else (403) sees nothing.
import { api, ApiError, type Assessment } from "./api";
import { esc, focusEl, announce } from "./dom";
import { icon } from "./icons";
import { errorText } from "./report-ui";

export type FeedbackSection = "overall" | "truths" | "start_here" | "plan" | "roadmap" | "coach";
export interface Feedback { section: FeedbackSection; helpful: boolean; comment: string | null; created: string }

const MAX = 1000;
const PARTS = ["truths", "start_here", "plan", "roadmap", "coach"] as const;
/** English names match the report headings; staff always read English. */
const PART_EN: Record<FeedbackSection, string> = {
  overall: "The report as a whole", truths: "Summary about your organization", start_here: "Start here",
  plan: "Your plan", roadmap: "Your 12-week roadmap", coach: "Chat about your report",
};
const PART_ES: Record<FeedbackSection, string> = {
  overall: "El informe en general", truths: "Resumen de su organización", start_here: "Por dónde empezar",
  plan: "Su plan", roadmap: "Su plan de 12 semanas", coach: "Chat sobre su informe",
};

const EN = {
  eyebrow: "Help us improve", title: "Does this feel right?",
  legend: "Does this report feel right for your organization?", yes: "Yes", no: "Not quite",
  partLegend: "Which part felt off?", optional: "(optional)", parts: PART_EN,
  comment: "What would make it fit better?", hint: "Up to 1000 characters. Please leave out the names of people you serve.",
  count: (n: number) => `${n} of ${MAX} characters`,
  send: "Send my answer", cancel: "Cancel", change: "Change my answer",
  needChoice: "Choose Yes or Not quite.",
  saidYes: "You said this report feels right for your organization.",
  saidNo: (part: string) => `You said this report does not quite fit${part ? `, mainly: ${part}` : ""}.`,
  thanks: "Thank you. Community Safety Fund staff read every answer and use them to check and improve these reports.",
  forbidden: "Only the person who submitted this assessment can answer here.",
  fail: "We could not send your answer. Please try again.",
};
const ES: typeof EN = {
  eyebrow: "Ayúdenos a mejorar", title: "¿Le parece acertado?",
  legend: "¿Este informe le parece acertado para su organización?", yes: "Sí", no: "No del todo",
  partLegend: "¿Qué parte no le pareció acertada?", optional: "(opcional)", parts: PART_ES,
  comment: "¿Qué haría que se ajuste mejor?", hint: "Hasta 1000 caracteres. Por favor, no incluya nombres de las personas a quienes sirven.",
  count: (n: number) => `${n} de ${MAX} caracteres`,
  send: "Enviar mi respuesta", cancel: "Cancelar", change: "Cambiar mi respuesta",
  needChoice: "Elija Sí o No del todo.",
  saidYes: "Usted dijo que este informe le parece acertado para su organización.",
  saidNo: (part: string) => `Usted dijo que este informe no se ajusta del todo${part ? `, sobre todo en: ${part}` : ""}.`,
  thanks: "Gracias. El personal del Community Safety Fund lee cada respuesta y las usa para revisar y mejorar estos informes.",
  forbidden: "Solo la persona que envió esta evaluación puede responder aquí.",
  fail: "No pudimos enviar su respuesta. Inténtelo de nuevo.",
};

const spanish = (sub: Assessment, staff: boolean) => sub.language === "es" && !staff;

/** Hidden until the GET answers, so viewers who may not answer never see a form flash by. */
export function feedbackSection(sub: Assessment, staff: boolean): string {
  const t = spanish(sub, staff) ? ES : EN;
  return `<section class="section feedback" id="feedback-section" aria-labelledby="feedback-title" data-no-print hidden${spanish(sub, staff) ? ' lang="es"' : ""}>
    <div class="section-head"><div><span class="eyebrow">${esc(t.eyebrow)}</span><h2 id="feedback-title">${esc(t.title)}</h2></div></div>
    <div class="card feedback__card" id="feedback-body"></div>
  </section>`;
}

/** The organization's current answer: the overall row, plus the newest "not helpful" part row (it carries the comment).
 *  The API lists rows oldest first. */
function current(rows: Feedback[]) {
  const overall = rows.find((r) => r.section === "overall") ?? null;
  const part = overall && !overall.helpful ? rows.filter((r) => r.section !== "overall" && !r.helpful).at(-1) ?? null : null;
  return { overall, part, comment: (part ?? overall)?.comment ?? "" };
}

function savedHtml(t: typeof EN, rows: Feedback[]): string {
  const { overall, part } = current(rows);
  return `<p class="support__sent" id="feedback-status" tabindex="-1">${icon("circle-check")}<span>${esc(overall?.helpful ? t.saidYes : t.saidNo(part ? t.parts[part.section] : ""))} ${esc(t.thanks)}</span></p>
    <button type="button" class="btn btn-secondary" id="feedback-edit">${icon("pencil")}<span>${esc(t.change)}</span></button>`;
}

function formHtml(t: typeof EN, es: boolean, rows: Feedback[]): string {
  const { overall, part, comment } = current(rows);
  const no = overall ? !overall.helpful : false;
  const picked = part?.section ?? "overall";
  const radio = (name: string, value: string, label: string, checked: boolean, meta = "") => `<label class="choice">
      <input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}>
      <span class="choice__text">${esc(label)}${meta ? `<span class="choice__meta" lang="en">${esc(meta)}</span>` : ""}</span>${icon("check", "choice__check")}
    </label>`;
  return `<form id="feedback-form" novalidate>
    <fieldset class="feedback__group">
      <legend class="legend-heading">${esc(t.legend)}</legend>
      <p class="field-error" id="feedback-error" role="alert" hidden></p>
      <div class="choice-row">
        ${radio("fb-helpful", "yes", t.yes, !!overall?.helpful)}
        ${radio("fb-helpful", "no", t.no, no)}
      </div>
    </fieldset>
    <div class="feedback__more" id="feedback-more"${no ? "" : " hidden"}>
      <fieldset class="feedback__group">
        <legend class="mini-label">${esc(t.partLegend)} <span class="optional">${esc(t.optional)}</span></legend>
        <div class="choice-row">
          ${(["overall", ...PARTS] as const).map((s) => radio("fb-part", s, t.parts[s], s === picked, es ? PART_EN[s] : "")).join("")}
        </div>
      </fieldset>
      <div class="field">
        <label for="feedback-comment">${esc(t.comment)} <span class="optional">${esc(t.optional)}</span></label>
        <p class="hint" id="feedback-hint">${esc(t.hint)}</p>
        <textarea class="input feedback__comment" id="feedback-comment" rows="4" maxlength="${MAX}" aria-describedby="feedback-hint feedback-count">${esc(comment)}</textarea>
        <p class="hint feedback__count" id="feedback-count">${esc(t.count(comment.length))}</p>
      </div>
    </div>
    <div class="actions actions--start">
      <button type="submit" class="btn btn-primary">${icon("message")}<span>${esc(t.send)}</span></button>
      ${overall ? `<button type="button" class="btn btn-secondary" id="feedback-cancel">${esc(t.cancel)}</button>` : ""}
    </div>
  </form>`;
}

/** Staff view: the organization's answers, read-only, plus the way to the Quality tab. */
function staffHtml(rows: Feedback[]): string {
  const list = rows.length
    ? `<ul class="feedback__list" role="list">${rows.map((r) => `<li>
        <span class="feedback__verdict">${icon(r.helpful ? "circle-check" : "circle-dashed")}<strong>${esc(PART_EN[r.section] ?? r.section)}: ${r.helpful ? "Feels right" : "Not quite"}</strong></span>
        ${r.comment ? `<p class="feedback__quote">${esc(r.comment)}</p>` : ""}
        <span class="meta">${esc(r.created)}</span>
      </li>`).join("")}</ul>`
    : `<p>This organization has not answered "Does this feel right?" yet.</p>`;
  return `${list}<p class="actions actions--start"><a class="btn btn-secondary" href="/staff/#quality">${icon("clipboard")}<span>Open the Quality tab</span></a></p>`;
}

export function wireFeedback(sub: Assessment, root: ParentNode, staff: boolean) {
  const section = root.querySelector<HTMLElement>("#feedback-section");
  const body = root.querySelector<HTMLElement>("#feedback-body");
  if (!section || !body) return;
  const es = spanish(sub, staff);
  const t = es ? ES : EN;
  const url = `/assessments/${encodeURIComponent(sub.id)}/feedback`;
  let rows: Feedback[] = [];
  const show = (editing: boolean) => { body.innerHTML = editing || !rows.some((r) => r.section === "overall") ? formHtml(t, es, rows) : savedHtml(t, rows); };
  const fail = (msg: string) => {
    const err = body.querySelector<HTMLElement>("#feedback-error")!;
    err.innerHTML = `${icon("alert")}<span>${esc(msg)}</span>`;
    err.hidden = false;
  };

  api.get<{ feedback: Feedback[] }>(url).then((res) => {
    rows = res.feedback ?? [];
    if (staff) body.innerHTML = staffHtml(rows);
    else show(false);
    section.hidden = false;
  }).catch(() => section.remove()); // 403: not the owner; 404 or offline: nothing to offer

  if (staff) return;
  body.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (el.closest("#feedback-edit")) { show(true); body.querySelector<HTMLInputElement>("input[name=fb-helpful]:checked")?.focus(); }
    if (el.closest("#feedback-cancel")) { show(false); focusEl(body.querySelector("#feedback-status")); }
  });
  body.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === "fb-helpful") {
      body.querySelector<HTMLElement>("#feedback-more")!.hidden = el.value !== "no";
      body.querySelector<HTMLElement>("#feedback-error")!.hidden = true;
    }
  });
  body.addEventListener("input", (e) => {
    const el = e.target as HTMLTextAreaElement;
    if (el.id === "feedback-comment") body.querySelector<HTMLElement>("#feedback-count")!.textContent = t.count(el.value.length);
  });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const verdict = form.querySelector<HTMLInputElement>("input[name=fb-helpful]:checked")?.value;
    if (!verdict) { fail(t.needChoice); form.querySelector<HTMLInputElement>("input[name=fb-helpful]")?.focus(); return; }
    const helpful = verdict === "yes";
    const part = helpful ? "overall" : form.querySelector<HTMLInputElement>("input[name=fb-part]:checked")?.value ?? "overall";
    const comment = helpful ? "" : form.querySelector<HTMLTextAreaElement>("#feedback-comment")!.value.trim().slice(0, MAX);
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    if (btn.getAttribute("aria-disabled") === "true") return;
    btn.setAttribute("aria-disabled", "true");
    try {
      // The whole-report answer goes first: the server then takes back older parts, and the part (with the
      // comment) comes last. Without a part the comment stays on the overall answer.
      let res = await api.post<{ feedback: Feedback[] }>(url, { section: "overall", helpful, comment: part === "overall" ? comment : "" });
      if (part !== "overall") res = await api.post<{ feedback: Feedback[] }>(url, { section: part, helpful: false, comment });
      rows = res.feedback ?? [];
      show(false);
      focusEl(body.querySelector("#feedback-status"));
      announce(t.thanks);
    } catch (ex) {
      btn.removeAttribute("aria-disabled");
      fail(ex instanceof ApiError && ex.status === 403 ? t.forbidden : errorText(ex, t.fail));
    }
  });
}
