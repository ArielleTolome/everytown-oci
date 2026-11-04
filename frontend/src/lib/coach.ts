// "Chat about your report" (v1.10, #37; was "Ask about your report", v0.9). Questions go to POST /api/assessments/<id>/ask,
// where one fixed AI step answers from the whole report and the CVI library. Starter questions are written by code from
// the report. Answers never change scores. The chat is a native modal <dialog>: the page behind is inert, Escape closes it
// and focus returns to the button that opened it.
import { api, ApiError, type Assessment, type Resource } from "./api";
import { esc, hostOf, safeUrl } from "./dom";
import { icon } from "./icons";
import { errorText } from "./report-ui";

interface Turn { question: string; answer: string; gap_ids: string[]; resources: Resource[] }
interface AskResponse extends Turn { remaining: number }
const MAX_CHARS = 500;
const SCOPE = "your summary, your top priorities, your roadmap, your 90-day plan or any area";

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

/** The short in-page card on "Your plan"; it opens the same chat as the floating button. */
export function coachCard(): string {
  return `<section class="section coach" aria-labelledby="coach-title" data-no-print>
    <div class="section-head"><div><span class="eyebrow">Questions and answers</span><h2 id="coach-title">Chat about your report</h2></div></div>
    <div class="card chat-card">
      <p>Ask about ${SCOPE}, in your own words, like you would ask a coach.</p>
      <button type="button" class="btn btn-primary" data-chat-open aria-haspopup="dialog">${icon("message")}<span>Open the chat</span></button>
    </div>
  </section>`;
}

/** Floating button plus the chat dialog (side panel from 600px, full-height sheet on phones). */
export function coachChat(sub: Assessment): string {
  const lang = esc(sub.language || "en");
  return `<button type="button" class="chat-fab" data-chat-open aria-haspopup="dialog" data-no-print>${icon("message")}<span>Chat about your report</span></button>
  <dialog class="drawer chat" id="chat-panel" aria-labelledby="chat-title">
    <div class="chat__head">
      <div>
        <h2 id="chat-title" tabindex="-1">Chat about your report</h2>
        <p class="source-tag source-tag--ai">${icon("pencil")}<span>Written by AI from your report. Check answers with your team.</span></p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm chat__close" data-chat-close>${icon("x")}<span>Close</span></button>
    </div>
    <div class="chat__scroll" id="chat-scroll">
      <div class="coach-turn__a chat__hello"><p>Hi. I can answer questions about ${SCOPE}. Asking never changes your scores.</p></div>
      <p class="mini-label" id="coach-starters-label">Try one of these</p>
      <ul class="coach-starters" role="list" aria-labelledby="coach-starters-label" lang="${lang}">${starters(sub).map((q) => `
        <li><button type="button" class="btn btn-secondary btn-sm coach-starter" data-question="${esc(q)}">${esc(q)}</button></li>`).join("")}
      </ul>
      <div class="coach-log" id="coach-log" role="log" aria-live="polite" aria-label="Your conversation"></div>
      <p class="chat__status" id="coach-status" role="status"></p>
    </div>
    <form class="chat__composer" id="coach-form" novalidate>
      <p class="field-error" id="coach-error" role="alert" hidden></p>
      <label class="visually-hidden" for="coach-question">Your question</label>
      <div class="chat__row">
        <textarea class="input chat__input" id="coach-question" name="question" rows="2" maxlength="${MAX_CHARS}" placeholder="Type your question" aria-describedby="coach-hint" enterkeyhint="send"></textarea>
        <button type="submit" class="btn btn-primary chat__send">${icon("arrow-right")}<span>Send</span></button>
      </div>
      <p class="hint" id="coach-hint">Enter sends. Shift and Enter starts a new line.</p>
    </form>
  </dialog>`;
}

function turnHtml(t: Turn, sub: Assessment): string {
  const lang = esc(sub.language || "en");
  const gaps = new Map(sub.gaps.map((g) => [g.question_id, g]));
  const paras = t.answer.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return `<div class="coach-turn">
    <div class="coach-turn__q"><p class="visually-hidden">You asked:</p><p>${esc(t.question)}</p></div>
    <div class="coach-turn__a"><p class="visually-hidden">Answer:</p><div class="coach-turn__text" lang="${lang}">${paras}</div>
      ${t.gap_ids.length ? `<div class="basis" lang="en"><p class="mini-label">Based on your answers to</p><ul class="basis__list" role="list">${t.gap_ids.map((id) =>
        `<li>${icon("circle-dashed")}<span><span class="chip">${esc(id)}</span> ${esc(gaps.get(id)?.question_text ?? "")}</span></li>`).join("")}</ul></div>` : ""}
      ${t.resources.map((r) => `<p class="resource-link">${icon("book")}<span><span class="visually-hidden">Resource: </span><a href="${esc(safeUrl(r.url))}" rel="noopener">${esc(r.title)}</a> <span class="url-domain">(${esc(hostOf(r.url))})</span></span></p>`).join("")}
    </div>
  </div>`;
}

export function wireCoach(sub: Assessment, root: ParentNode) {
  const dialog = root.querySelector<HTMLDialogElement>("#chat-panel");
  if (!dialog) return;
  const form = dialog.querySelector<HTMLFormElement>("#coach-form")!;
  const log = dialog.querySelector<HTMLElement>("#coach-log")!;
  const scroller = dialog.querySelector<HTMLElement>("#chat-scroll")!;
  const input = form.querySelector<HTMLTextAreaElement>("#coach-question")!;
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const status = dialog.querySelector<HTMLElement>("#coach-status")!;
  const err = form.querySelector<HTMLElement>("#coach-error")!;
  const url = `/assessments/${encodeURIComponent(sub.id)}/ask`;
  let opener: HTMLElement | null = null;
  let loaded = false;
  let loading: Promise<void> = Promise.resolve();
  let busy = false;

  const showError = (msg: string) => {
    err.innerHTML = `${icon("alert")}<span>${esc(msg)}</span>`;
    err.hidden = !msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    input.setAttribute("aria-describedby", msg ? "coach-hint coach-error" : "coach-hint");
  };
  // A limit was hit (or this viewer may not ask): the composer and starters give way to one plain message.
  const closed = (msg: string) => {
    if (!form.isConnected) return;
    const hadFocus = form.contains(document.activeElement);
    dialog.querySelector(".coach-starters")?.remove();
    dialog.querySelector("#coach-starters-label")?.remove();
    form.outerHTML = `<p class="notice chat__closed" id="coach-closed" tabindex="-1">${icon("info")}<span>${esc(msg)}</span></p>`;
    if (hadFocus) dialog.querySelector<HTMLElement>("#coach-closed")?.focus();
  };
  const LIMIT = "You have used all your questions for this report. Talk the rest through with your team, or ask the Community Safety Fund for support.";

  // The conversation so far, loaded on first open and filled quietly so screen readers don't hear it all again.
  const load = () => {
    if (loaded) return;
    loaded = true;
    log.setAttribute("aria-live", "off");
    loading = api.get<{ messages: Turn[]; remaining: number }>(url).then((res) => {
      log.innerHTML = res.messages.map((t) => turnHtml(t, sub)).join("");
      scroller.scrollTop = scroller.scrollHeight;
      if (res.remaining <= 0) closed(LIMIT);
    }).catch((ex) => {
      if (ex instanceof ApiError && ex.status === 403) closed("Only the person who submitted this assessment, or Everytown staff, can ask about it.");
      else loaded = false; // try again on the next open
    }).finally(() => window.setTimeout(() => log.setAttribute("aria-live", "polite"), 100));
  };

  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-chat-open]");
    if (!btn) return;
    opener = btn;
    dialog.showModal();
    // Touch screens: land on the heading, so the on-screen keyboard does not cover the starters at once.
    const field = dialog.querySelector<HTMLTextAreaElement>("#coach-question");
    (field && !matchMedia("(pointer: coarse)").matches ? field : dialog.querySelector<HTMLElement>("#chat-title")!).focus();
    load();
  });
  dialog.querySelector("[data-chat-close]")!.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => opener?.focus());
  dialog.addEventListener("click", (e) => {
    // A click on the backdrop (the dialog box itself, outside its content) closes it, like Escape.
    if (e.target === dialog) { dialog.close(); return; }
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-question]");
    if (!chip || !dialog.contains(form)) return;
    input.value = chip.dataset.question!;
    form.requestSubmit();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const question = input.value.trim();
    if (!question) { showError("Type a question first."); input.focus(); return; }
    showError("");
    busy = true;
    // A question asked while the conversation is still loading waits for it; otherwise the history replaced the log
    // under the new question and its answer (already saved) showed as "could not answer".
    await loading;
    if (!form.isConnected) { busy = false; return; }
    submit.setAttribute("aria-disabled", "true");
    // The question shows at once as the reader's bubble; the typing dots stand in for the answer.
    log.insertAdjacentHTML("beforeend", `<div class="coach-turn" data-pending><div class="coach-turn__q"><p class="visually-hidden">You asked:</p><p>${esc(question)}</p></div></div>`);
    const pending = log.lastElementChild as HTMLElement;
    input.value = "";
    status.innerHTML = `<span class="chat__typing" aria-hidden="true"><i></i><i></i><i></i></span><span>Looking at your report…</span>`;
    status.scrollIntoView({ block: "nearest" });
    try {
      const res = await api.post<AskResponse>(url, { question });
      pending.outerHTML = turnHtml({ ...res, question }, sub);
      status.textContent = "";
      // Bring the start of the new turn into view, so a long answer is read from its first line.
      log.lastElementChild!.scrollIntoView({ block: "start" });
      if (res.remaining <= 0) closed(LIMIT);
    } catch (ex) {
      pending.remove();
      status.textContent = "";
      input.value = question;
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
