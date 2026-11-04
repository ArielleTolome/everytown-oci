// "Ask the data" (v1.0): staff type a question; the server picks one pre-built analysis, code computes the table,
// and the AI words a short answer from that table only. The table and chart are the source of truth.
import { api, ApiError } from "./api";
import { $, $$, announce, esc, focusEl } from "./dom";
import { icon } from "./icons";
import { downloadCsv, expired, failHtml, markScroll } from "./staff-bi";

interface AskResult {
  question: string; analysis: string; analysis_label: string; area: string | null; area_name: string | null; filters: Record<string, string>; org_name: string | null;
  answer: string; answer_source: "ai" | "code";
  table: { title: string; columns: string[]; rows: (string | number)[][] };
  chart_hint: { type: "bar"; label: number; value: number } | null;
}

const SUGGESTIONS = [
  "Which organizations need fundraising training?",
  "How do hospital-based programs compare on financial management?",
  "Who improved since their last assessment?",
  "What are the most common gaps for street outreach programs?",
  "Which areas did organizations ask for help with?",
  "Which organizations are most similar to Northside Peacekeepers?",
];
const MAX_BARS = 12;
// Answers usually take about 10 s but up to about 60 s when Bedrock is slow; give up a little after that.
const SLOW_MS = 15_000;
const TIMEOUT_MS = 75_000;

export function askPanel() {
  return `<div class="section-head"><div><span class="eyebrow">Questions in plain words</span><h2 id="ask-title">Ask the data</h2></div></div>
    <p class="measure">Ask a question in your own words. The AI only picks one of our pre-built analyses; code computes the numbers from the assessment results, and the AI then sums up that table in 2 or 3 sentences. Filters at the top of the page do not apply here: name a program model or area in the question instead.</p>
    <form id="ask-form" class="ask-form" novalidate>
      <div class="field">
        <label for="ask-q">Your question</label>
        <div class="ask-form__row">
          <input class="input" id="ask-q" name="q" maxlength="300" autocomplete="off" aria-describedby="ask-hint ask-error">
          <button type="submit" class="btn btn-primary" id="ask-btn">${icon("message")}<span>Ask</span></button>
        </div>
        <p class="hint" id="ask-hint">For example: which organizations need training, how program models compare in one area, who improved, or who is similar to an organization.</p>
        <p class="field-error" id="ask-error" hidden></p>
        <p class="ask-retry" id="ask-retry" hidden><button type="button" class="btn btn-secondary btn-sm" id="ask-retry-btn">${icon("refresh")}<span>Ask again</span></button></p>
      </div>
    </form>
    <h3 class="sub-head" id="suggest-title">Try a question</h3>
    <ul class="suggest" role="list" aria-labelledby="suggest-title">${SUGGESTIONS.map((s) => `<li><button type="button" class="btn btn-secondary btn-sm" data-suggest="${esc(s)}">${esc(s)}</button></li>`).join("")}</ul>
    <div id="ask-status" role="status" class="ask-status"></div>
    <div id="ask-results"></div>`;
}

function chart(r: AskResult) {
  const h = r.chart_hint;
  if (!h) return "";
  const rows = r.table.rows.slice(0, MAX_BARS);
  const max = Math.max(1, ...rows.map((row) => Number(row[h.value]) || 0));
  // The table below holds the same numbers, so the chart is hidden from screen readers to avoid reading it twice.
  return `<figure class="ask-chart" aria-hidden="true">
    <figcaption>${esc(r.table.columns[h.value])}${r.table.rows.length > MAX_BARS ? ` (first ${MAX_BARS})` : ""}</figcaption>
    <ul class="plain-list">${rows.map((row) => `<li class="ask-chart__row"><span class="ask-chart__label">${esc(row[h.label])}</span>
      <span class="ask-chart__track"><span class="ask-chart__fill" style="width:${(100 * (Number(row[h.value]) || 0)) / max}%"></span></span>
      <span class="ask-chart__value">${esc(row[h.value])}</span></li>`).join("")}</ul>
  </figure>`;
}

function resultHtml(r: AskResult, n: number) {
  const id = `ask-${n}`;
  const scope = [r.area_name ? `Area: ${r.area_name}` : "", r.org_name ? `Organization: ${r.org_name}` : "",
    ...Object.entries(r.filters).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1).replace("_", " ")}: ${v}`)].filter(Boolean);
  const t = r.table;
  return `<article class="ask-result card" aria-labelledby="${id}-q">
    <h3 id="${id}-q" tabindex="-1">${esc(r.question)}</h3>
    <p class="ask-result__answer">${esc(r.answer)}</p>
    <p class="meta">${icon(r.answer_source === "ai" ? "info" : "check")}${r.answer_source === "ai" ? "Summary written by AI from the table below; the numbers come from the assessment data." : "Summary written by code."}
      Analysis used: <span class="chip">${esc(r.analysis_label)}</span>${scope.map((s) => ` <span class="chip">${esc(s)}</span>`).join("")}</p>
    ${t.rows.length ? `${chart(r)}
    <div class="scroll-frame"><p class="scroll-hint" aria-hidden="true">Scroll sideways to see every column.</p><div class="table-wrap" role="region" aria-labelledby="${id}-cap" tabindex="0"><table>
      <caption id="${id}-cap">${esc(t.title)}</caption>
      <thead><tr>${t.columns.map((c, i) => `<th scope="col"${i && typeof t.rows[0][i] === "number" ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${t.rows.map((row) => `<tr>${row.map((c, i) => (i ? `<td${typeof c === "number" ? ' class="num"' : ""}>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join("")}</tr>`).join("")}</tbody>
    </table></div></div>
    <button type="button" class="btn btn-secondary btn-sm" data-ask-csv="${n}">${icon("download")}<span>Download as CSV</span></button>` : ""}
  </article>`;
}

export function wireAsk(panel: HTMLElement) {
  const form = $<HTMLFormElement>("#ask-form", panel)!;
  const input = $<HTMLInputElement>("#ask-q", panel)!;
  const err = $("#ask-error", panel)!;
  const retry = $("#ask-retry", panel)!;
  const status = $("#ask-status", panel)!;
  const results = $("#ask-results", panel)!;
  const done: AskResult[] = [];
  let busy = false;
  let last = "";
  /** `invalid` marks the question itself as the problem; `canRetry` offers "Ask again" with the same question. */
  const showError = (html: string, invalid: boolean, canRetry = false) => {
    err.hidden = !html;
    err.innerHTML = html;
    retry.hidden = !canRetry;
    input.setAttribute("aria-invalid", String(invalid));
  };
  // One question at a time: the Ask button and the suggestions wait for the answer.
  const setBusy = (on: boolean) => {
    busy = on;
    $$<HTMLButtonElement>("#ask-btn, [data-suggest], #ask-retry-btn", panel).forEach((b) => { b.disabled = on; });
  };

  async function ask(question: string) {
    if (busy) return;
    if (question.trim().length < 3) { showError(`${icon("alert")}<span>Type a question first.</span>`, true); input.focus(); return; }
    last = question.trim();
    showError("", false);
    setBusy(true);
    status.innerHTML = `<p class="loading">${icon("loader", "spin")}Looking at the data. This usually takes about 10 seconds.</p>`;
    const slow = window.setTimeout(() => {
      status.innerHTML = `<p class="loading">${icon("loader", "spin")}Still working. When the AI service is busy, an answer can take up to a minute.</p>`;
    }, SLOW_MS);
    const timeout = Promise.withResolvers<never>();
    const timer = window.setTimeout(() => timeout.reject(new Error("timeout")), TIMEOUT_MS);
    try {
      const r = await Promise.race([api.post<AskResult>("/staff/ask", { question: last }), timeout.promise]);
      done.push(r);
      status.innerHTML = "";
      results.insertAdjacentHTML("afterbegin", resultHtml(r, done.length - 1));
      markScroll(results);
      announce("Answer ready.");
      focusEl(document.getElementById(`ask-${done.length - 1}-q`));
    } catch (e) {
      status.innerHTML = "";
      // 400 and 422 are about the question itself (the server's message says how to fix it); anything else can be retried as is.
      const aboutQuestion = e instanceof ApiError && (e.status === 400 || e.status === 422);
      const text = e instanceof Error && e.message === "timeout"
        ? "No answer after more than a minute. The AI service may be busy. Ask again, or try a suggested question."
        : e instanceof ApiError ? (e.message && e.status < 500 ? e.message : "We could not answer that right now. Please ask again.")
        : "We could not reach the server. Check your connection and ask again.";
      showError(failHtml(e, text), aboutQuestion, !aboutQuestion && !expired(e));
      input.focus();
    } finally {
      window.clearTimeout(slow);
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  panel.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#ask-retry-btn")) { input.value = last; ask(last); return; }
    const s = t.closest<HTMLButtonElement>("[data-suggest]");
    if (s) { input.value = s.dataset.suggest!; ask(input.value); return; }
    const c = t.closest<HTMLButtonElement>("[data-ask-csv]");
    if (c) {
      const r = done[Number(c.dataset.askCsv)];
      downloadCsv(`oci-ask-${r.analysis}`, [r.table.columns, ...r.table.rows]);
      announce("Table downloaded as CSV.");
    }
  });
}
