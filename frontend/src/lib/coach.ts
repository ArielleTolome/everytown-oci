// "Ask about your report" (v0.9). Questions go to POST /api/assessments/<id>/ask, where one fixed AI step answers from
// the report and the CVI library. Starter questions are written by code from the report. Answers never change scores.
import { api, ApiError, type Assessment, type Resource } from "./api";
import { esc, hostOf, safeUrl } from "./dom";
import { icon } from "./icons";
import { errorText, fold } from "./report-ui";

interface Turn { question: string; answer: string; gap_ids: string[]; resources: Resource[] }
interface AskResponse extends Turn { remaining: number }
const MAX_CHARS = 500;

/** Four starter questions built from the report itself, in the report's language. */
export function starters(sub: Assessment): string[] {
  const es = sub.language === "es";
  const bare = (t: string) => t.trim().replace(/[.?!:]+$/, "");
  const focus = sub.report?.focus?.[0];
  const first = sub.report?.plan?.[0];
  const domainId = sub.gaps.find((g) => focus?.gap_ids.includes(g.question_id))?.domain_id;
  const area = sub.domains.find((d) => d.domain_id === domainId) ?? sub.domains[0];
  const out: string[] = [];
  if (focus) out.push(es ? `¿Cómo empiezo con: ${bare(focus.title)}?` : `How do I start: ${bare(focus.title)}?`);
  if (area) out.push(es ? `¿Qué significa la etapa ${area.estimated_stage} en ${area.domain_name}?` : `What does ${area.estimated_stage} mean for ${area.domain_name}?`);
  if (first) out.push(es ? `¿Quién debería encargarse de: ${bare(first.title)}?` : `Who should own this: ${bare(first.title)}?`);
  out.push(es ? "¿Cuál es el primer paso esta semana?" : "What is the first step this week?");
  return out;
}

/** Inner markup of the section (results.ts adds the section heading). */
export function coachBody(sub: Assessment): string {
  const lang = esc(sub.language || "en");
  return `<p class="notice">${icon("shield")}<span>Answers are written with AI from your report and the CVI library, so check them with your team. Asking never changes your scores.</span></p>
    <div class="coach-log" id="coach-log" role="log" aria-live="polite" aria-label="Your questions and answers"></div>
    ${fold("Ask a question", `<form class="card coach-form" id="coach-form" novalidate>
      <p class="mini-label" id="coach-starters-label">Try one of these</p>
      <ul class="coach-starters" role="list" aria-labelledby="coach-starters-label" lang="${lang}">${starters(sub).map((q) => `
        <li><button type="button" class="btn btn-secondary btn-sm coach-starter" data-question="${esc(q)}">${esc(q)}</button></li>`).join("")}
      </ul>
      <div class="field">
        <label for="coach-question">Your question</label>
        <p class="hint" id="coach-hint">Up to ${MAX_CHARS} characters. <span id="coach-remaining"></span></p>
        <p class="field-error" id="coach-error" role="alert" hidden></p>
        <textarea class="input coach-form__input" id="coach-question" name="question" rows="3" maxlength="${MAX_CHARS}" aria-describedby="coach-hint" enterkeyhint="send"></textarea>
      </div>
      <div class="actions actions--start">
        <button type="submit" class="btn btn-primary">${icon("message")}<span>Ask</span></button>
        <p class="coach-form__status" id="coach-status" role="status"></p>
      </div>
    </form>`)}`;
}

function turnHtml(t: Turn, sub: Assessment): string {
  const lang = esc(sub.language || "en");
  const gaps = new Map(sub.gaps.map((g) => [g.question_id, g]));
  const paras = t.answer.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return `<div class="coach-turn">
    <div class="coach-turn__q"><p class="mini-label">You asked</p><p>${esc(t.question)}</p></div>
    <div class="coach-turn__a"><p class="mini-label mini-label--blue">Answer</p><div class="coach-turn__text" lang="${lang}">${paras}</div>
      ${t.gap_ids.length ? `<div class="basis" lang="en"><p class="mini-label">Based on your answers to</p><ul class="basis__list" role="list">${t.gap_ids.map((id) =>
        `<li>${icon("circle-dashed")}<span><span class="chip">${esc(id)}</span> ${esc(gaps.get(id)?.question_text ?? "")}</span></li>`).join("")}</ul></div>` : ""}
      ${t.resources.map((r) => `<p class="resource-link">${icon("book")}<span><span class="visually-hidden">Resource: </span><a href="${esc(safeUrl(r.url))}" rel="noopener">${esc(r.title)}</a> <span class="url-domain">(${esc(hostOf(r.url))})</span></span></p>`).join("")}
    </div>
  </div>`;
}

export function wireCoach(sub: Assessment, root: ParentNode) {
  const form = root.querySelector<HTMLFormElement>("#coach-form");
  const log = root.querySelector<HTMLElement>("#coach-log");
  if (!form || !log) return;
  const url = `/assessments/${encodeURIComponent(sub.id)}/ask`;
  const input = form.querySelector<HTMLTextAreaElement>("#coach-question")!;
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const status = form.querySelector<HTMLElement>("#coach-status")!;
  const err = form.querySelector<HTMLElement>("#coach-error")!;
  let busy = false;

  const showError = (msg: string) => {
    err.innerHTML = `${icon("alert")}<span>${esc(msg)}</span>`;
    err.hidden = !msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    input.setAttribute("aria-describedby", msg ? "coach-hint coach-error" : "coach-hint");
  };
  const closed = (msg: string) => {
    const hadFocus = form.contains(document.activeElement);
    (form.closest("[data-fold]") ?? form).outerHTML = `<p class="notice" id="coach-closed" tabindex="-1">${icon("info")}<span>${esc(msg)}</span></p>`;
    if (hadFocus) root.querySelector<HTMLElement>("#coach-closed")?.focus();
  };
  const setRemaining = (n: number) => {
    form.querySelector("#coach-remaining")!.textContent = `You can ask ${n} more ${n === 1 ? "question" : "questions"} about this report.`;
    if (n <= 0) closed("You have used all your questions for this report. Talk the rest through with your team, or ask the Community Safety Fund for support.");
  };

  // Earlier questions from this report; filled quietly so screen readers don't hear the whole history again.
  log.setAttribute("aria-live", "off");
  api.get<{ messages: Turn[]; remaining: number }>(url).then((res) => {
    log.innerHTML = res.messages.map((t) => turnHtml(t, sub)).join("");
    setRemaining(res.remaining);
  }).catch((ex) => {
    if (ex instanceof ApiError && ex.status === 403) closed("Only the person who submitted this assessment, or Everytown staff, can ask about it.");
  }).finally(() => window.setTimeout(() => log.setAttribute("aria-live", "polite"), 100));

  form.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-question]");
    if (!chip) return;
    input.value = chip.dataset.question!;
    form.requestSubmit();
  });

  // On-screen keyboards: the Send key sends (Shift+Enter still breaks a line), and Ask stays above the keyboard.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: coarse)").matches) { e.preventDefault(); form.requestSubmit(); }
  });
  input.addEventListener("focus", () => window.visualViewport?.addEventListener("resize", () => {
    const vv = window.visualViewport!;
    const below = submit.getBoundingClientRect().bottom + 8 - (vv.offsetTop + vv.height);
    if (below > 0) window.scrollBy(0, below);
  }, { once: true }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const question = input.value.trim();
    if (!question) { showError("Type a question first."); input.focus(); return; }
    showError("");
    busy = true;
    submit.setAttribute("aria-disabled", "true");
    status.innerHTML = `${icon("loader", "spin")}<span>Looking at your report…</span>`;
    try {
      const res = await api.post<AskResponse>(url, { question });
      log.insertAdjacentHTML("beforeend", turnHtml({ ...res, question }, sub));
      input.value = "";
      status.textContent = "";
      setRemaining(res.remaining);
    } catch (ex) {
      status.textContent = "";
      const msg = errorText(ex, "We could not answer right now. Please try again in a minute.");
      if (ex instanceof ApiError && (ex.status === 429 || ex.status === 403)) { closed(msg); return; }
      showError(msg);
      input.focus();
    } finally {
      busy = false;
      submit.removeAttribute("aria-disabled");
    }
  });
}
