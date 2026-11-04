// "Quality and follow-through" staff tab (v1.7, CSF director demo): report feedback and the staff review queue,
// roadmap follow-through with check-in notes, opt-ins to trainings and updates, and where people stop the assessment.
// Every number comes from the server; this file only lays it out. Each section loads, fails and retries on its own.
import { api, ApiError } from "./api";
import { $, announce, esc, focusEl, plural } from "./dom";
import { icon } from "./icons";
import { downloadCsv, expired, failHtml, markScroll, type Bi, type Roadmap } from "./staff-bi";

interface Quality {
  summary: { reports: number; with_feedback: number; helpful_pct: number | null; flagged: number; reviewed: number };
  by_section: { section: string; helpful: number; not_helpful: number }[];
  recent: { assessment_id: string; org_name: string; section: string; helpful: boolean; comment: string | null; created: string }[];
  queue: { assessment_id: string; org_name: string; created: string; not_helpful: number; status: "flagged" | "reviewed" | null; issue: string | null }[];
  issues: { issue: string; count: number }[];
}
interface Optin {
  assessment_id: string; org_id: string; org_name: string; program_models: string[]; states: string[];
  training: boolean; updates: boolean; name: string | null; email: string; updated: string;
}
interface Funnel {
  started: number; submitted: number; abandoned: number;
  by_area: { domain_id: string; domain_name: string; started: number; finished: number }[];
  last_area: { domain_id: string; domain_name: string; count: number }[];
}
interface Ctx { bi: () => Bi; stateName: (code: string) => string }

const SECTION: Record<string, string> = {
  overall: "Whole report", truths: "Summary about your organization", start_here: "Start here", plan: "Your plan", roadmap: "Roadmap", coach: "Chat about your report",
};
const ISSUE: Record<string, string> = {
  wrong_facts: "Wrong facts", too_big_for_size: "Too big for their size", unclear: "Unclear", tone: "Tone", other: "Other",
};
const STALL_DAYS = 14;

// Same markup as staff-bi.ts's private table/empty helpers, so markScroll and the v1.5 styles apply unchanged.
const table = (id: string, caption: string, thead: string, tbody: string) =>
  `<div class="scroll-frame"><p class="scroll-hint" aria-hidden="true">Scroll sideways to see every column.</p><div class="table-wrap" role="region" aria-labelledby="${id}" tabindex="0"><table><caption id="${id}">${caption}</caption><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div></div>`;
const th = (cols: string[]) => cols.map((c) => `<th scope="col"${c.startsWith("#") ? ' class="num"' : ""}>${esc(c.replace(/^#/, ""))}</th>`).join("");
const empty = (text: string) => `<p class="notice">${icon("info")}<span>${esc(text)}</span></p>`;
const kpis = (items: [string, string | number, string][]) =>
  `<ul class="kpi-grid sq-kpis" role="list">${items.map(([label, n, ctx]) => `<li class="card kpi"><span class="kpi__label">${esc(label)}</span><span class="kpi__num">${esc(n)}</span><span class="kpi__context">${esc(ctx)}</span></li>`).join("")}</ul>`;
const reportLink = (sid: string, name: string) => `<a href="/results/?id=${encodeURIComponent(sid)}">${esc(name)}<span class="visually-hidden"> report</span></a>`;
const issueName = (i: string | null) => (i ? ISSUE[i] ?? i : "");

/** Whole days since a "YYYY-MM-DD" date (UTC), or null. */
const daysSince = (d: string | null) => (d ? Math.max(0, Math.floor((Date.now() - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 864e5)) : null);

export function qualityPanel() {
  const sec = (id: string, eyebrow: string, title: string, intro: string) => `<section class="sq-section" aria-labelledby="sqh-${id}">
      <div class="section-head"><div><span class="eyebrow">${eyebrow}</span><h2 id="sqh-${id}" tabindex="-1">${title}</h2></div></div>
      <p class="measure">${intro}</p>
      <div id="sq-${id}"><p class="loading">${icon("loader", "spin")}Loading</p></div>
    </section>`;
  return [
    sec("quality", "Human review", "Report quality",
      "Organizations can tell us whether their report feels right. Read what they said, then mark each report reviewed or flag a mistake, so the team can spot one the AI keeps making."),
    sec("follow", "Roadmaps", "Follow-through",
      `Who is taking steps on their 12-week roadmap. On track means a step was ticked in the last ${STALL_DAYS} days; stalled means ${STALL_DAYS} days or more. The filters above apply to this section.`),
    sec("optins", "Stay connected", "Opted in to trainings and updates",
      "Only organizations that chose to share appear here. Use this list only for what each one picked."),
    sec("funnel", "Drop-off", "Where people stop",
      "How far people get in the assessment. Only drafts saved on our server are counted (Save and finish later, or an area sent to a teammate); answers kept only in a browser are not."),
  ].join("");
}

export function mountQuality(panel: HTMLElement, ctx: Ctx) {
  let quality: Quality | null = null;
  let roadmaps: Roadmap[] | null = null;
  let optins: Optin[] = [];
  let funnelData: Funnel | null = null;
  let shown = false;
  let flagOpener: HTMLElement | null = null;

  // ---------- 1. report quality ----------

  function qualityHtml(q: Quality) {
    const s = q.summary;
    const rows = q.by_section.filter((r) => r.helpful || r.not_helpful);
    const comments = q.recent.filter((r) => r.comment);
    const queue = q.queue.map((r) => `<tr>
        <th scope="row">${reportLink(r.assessment_id, r.org_name)}</th><td class="sq-nowrap">${esc(r.created)}</td><td class="num">${r.not_helpful}</td>
        <td>${r.status === "flagged" ? `Flagged: ${esc(issueName(r.issue))}` : r.status === "reviewed" ? "Reviewed" : '<span class="meta">Not reviewed</span>'}</td>
        <td><div class="sq-row-actions">
          ${r.status === "reviewed" ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-q-review="${esc(r.assessment_id)}">Mark reviewed<span class="visually-hidden">: ${esc(r.org_name)}</span></button>`}
          <button type="button" class="btn btn-secondary btn-sm" data-q-flag="${esc(r.assessment_id)}" data-q-org="${esc(r.org_name)}">${r.status === "flagged" ? "Change flag" : "Flag"}<span class="visually-hidden">: ${esc(r.org_name)}</span></button>
        </div></td></tr>`).join("");
    return `${kpis([
        ["Reports", s.reports, "reports made"],
        ["With feedback", s.with_feedback, "organizations answered"],
        ["Helpful", s.helpful_pct == null ? "None yet" : `${s.helpful_pct}%`, "of answers said it feels right"],
        ["Flagged", s.flagged, "by staff"],
        ["Reviewed", s.reviewed, "by staff"],
      ])}
      <h3 class="sub-head" id="sq-queue-title">Review queue</h3>
      <p class="hint">Reports where an organization said something felt off, or that staff flagged. Not reviewed comes first.</p>
      ${q.queue.length ? table("sq-queue", "Reports to review", th(["Organization", "Report date", "#Not helpful", "Status", "Actions"]), queue) : empty("Nothing to review. Reports show up here when an organization says a part does not feel right.")}
      <div id="sq-review-status" class="sq-status" role="status"></div>
      <form id="sq-flag" class="card sq-flag" hidden novalidate aria-labelledby="sq-flag-title">
        <h4 id="sq-flag-title" tabindex="-1">Flag this report</h4>
        <div class="field"><label for="sq-issue">What is wrong?</label>
          <select class="input" id="sq-issue" name="issue" required>${Object.entries(ISSUE).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        <div class="field"><label for="sq-note">Note for the team (optional)</label>
          <textarea class="input" id="sq-note" name="note" rows="3" maxlength="1000" aria-describedby="sq-note-hint"></textarea>
          <p class="hint" id="sq-note-hint">Up to 1,000 characters. Organizations do not see flags or notes.</p></div>
        <div id="sq-flag-error"></div>
        <div class="actions actions--start"><button type="submit" class="btn btn-primary">Save flag</button><button type="button" class="btn btn-secondary" data-q-cancel>Cancel</button></div>
      </form>
      <h3 class="sub-head">Feedback by part of the report</h3>
      ${rows.length ? table("sq-by-section", "Answers to Does this feel right, by part of the report", th(["Part of the report", "#Feels right", "#Not quite"]),
        rows.map((r) => `<tr><th scope="row">${esc(SECTION[r.section] ?? r.section)}</th><td class="num">${r.helpful}</td><td class="num">${r.not_helpful}</td></tr>`).join("")) : empty("No feedback yet.")}
      <h3 class="sub-head">Issues staff flagged</h3>
      ${q.issues.length ? table("sq-issues", "Flags by issue, most common first", th(["Issue", "#Reports"]),
        q.issues.map((r) => `<tr><th scope="row">${esc(issueName(r.issue))}</th><td class="num">${r.count}</td></tr>`).join("")) : empty("No flags yet.")}
      <h3 class="sub-head">Recent comments</h3>
      ${comments.length ? `<ul class="plain-list sq-comments">${comments.map((r) => `<li>
          <p>${reportLink(r.assessment_id, r.org_name)} <span class="meta">${esc(SECTION[r.section] ?? r.section)} · ${r.helpful ? "Feels right" : "Not quite"} · ${esc(r.created)}</span></p>
          <p class="sq-comment">${esc(r.comment)}</p></li>`).join("")}</ul>` : empty("No comments yet.")}`;
  }

  // ---------- 2. follow-through ----------

  type Follow = { id: string; name: string; status: "On track" | "Stalled" | "Not started"; r?: Roadmap; days: number | null };
  const ORDER = { Stalled: 0, "On track": 1, "Not started": 2 };

  function follows(): Follow[] {
    const byOrg = new Map((roadmaps ?? []).map((r) => [r.org_id, r]));
    return ctx.bi().organizations.map((o) => {
      const r = byOrg.get(o.id);
      const days = daysSince(r?.last_activity ?? null);
      const status: Follow["status"] = !r || !r.tasks_done || days == null ? "Not started" : days >= STALL_DAYS ? "Stalled" : "On track";
      return { id: o.id, name: o.name, status, r, days };
    }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.days ?? 0) - (a.days ?? 0) || (b.r?.pct ?? 0) - (a.r?.pct ?? 0) || a.name.localeCompare(b.name));
  }

  function followHtml() {
    const rows = follows();
    if (!rows.length) return empty("No organizations to show. If filters are on, try clearing them.");
    const count = (s: Follow["status"]) => rows.filter((f) => f.status === s).length;
    const stalled = rows.filter((f) => f.status === "Stalled");
    return `${kpis([
        ["On track", count("On track"), `a step in the last ${STALL_DAYS} days`],
        ["Stalled", count("Stalled"), `no step for ${STALL_DAYS} days or more`],
        ["Not started", count("Not started"), "no step ticked yet"],
      ])}
      <h3 class="sub-head">Check-in list</h3>
      <p class="hint">This tool does not send email. Copy a short note and send it yourself, so a person stays in the loop.</p>
      ${stalled.length ? `<ul class="plain-list sq-checkins">${stalled.map((f) => `<li>
          <p><button type="button" class="link-btn" data-open-org="${esc(f.id)}">${esc(f.name)}</button><br>
          <span class="meta">${f.r!.weeks_done} of ${f.r!.weeks_total} weeks done · last step ${esc(f.r!.last_activity)} (${plural(f.days ?? 0, "day", "days")} ago)</span></p>
          <button type="button" class="btn btn-secondary btn-sm" data-q-note="${esc(f.id)}">${icon("clipboard")}<span>Copy check-in note<span class="visually-hidden"> for ${esc(f.name)}</span></span></button>
          <div class="sq-note-slot" id="sq-note-${esc(f.id)}"></div></li>`).join("")}</ul>` : empty("No stalled roadmaps. Nobody needs a check-in right now.")}
      <p class="sq-csv"><button type="button" class="btn btn-secondary btn-sm" data-q-csv="follow">${icon("download")}<span>Download as CSV</span></button></p>
      ${table("sq-follow-table", "Roadmap follow-through by organization, stalled first", th(["Organization", "Status", "#Weeks done", "#Steps done", "Last step"]),
        rows.map((f) => `<tr><th scope="row"><button type="button" class="link-btn" data-open-org="${esc(f.id)}">${esc(f.name)}</button></th><td>${f.status}</td>
          <td class="num">${f.r ? `${f.r.weeks_done} of ${f.r.weeks_total}` : '<span class="meta">No roadmap</span>'}</td>
          <td class="num">${f.r?.total ? `${f.r.tasks_done} of ${f.r.total} (${f.r.pct}%)` : ""}</td>
          <td>${f.r?.last_activity ? `${esc(f.r.last_activity)} <span class="meta">(${plural(f.days ?? 0, "day", "days")} ago)</span>` : '<span class="meta">None yet</span>'}</td></tr>`).join(""))}`;
  }

  function note(f: Follow) {
    const link = f.r ? ` You can pick up where you left off here: ${location.origin}/plan/?id=${f.r.assessment_id}` : "";
    return `Hi ${f.name},\n\nWe are checking in on your 12-week roadmap. You have done ${f.r ? plural(f.r.tasks_done, "step", "steps") : "some steps"} so far, and that work counts. `
      + `Is anything getting in the way of the next step? If a step is too big for your team right now, reply and we can help you pick a smaller one.${link}\n\n`
      + `When you are ready, taking the assessment again after 90 days shows how far you have come.\n\nThe Community Safety Fund team`;
  }

  async function copyNote(id: string, btn: HTMLElement) {
    const f = follows().find((x) => x.id === id);
    const slot = $(`#sq-note-${CSS.escape(id)}`, panel);
    if (!f || !slot) return;
    const text = note(f);
    try {
      await navigator.clipboard.writeText(text);
      slot.innerHTML = `<p class="meta">${icon("circle-check")} Copied. Paste it into your email.</p>`;
      announce(`Check-in note for ${f.name} copied.`);
    } catch {
      // Clipboard can be blocked by the browser: show the note so staff can copy it by hand.
      slot.innerHTML = `<label class="sq-note-label" for="sq-note-text-${esc(id)}">We could not copy automatically. Select the note and copy it.</label>
        <textarea class="input" id="sq-note-text-${esc(id)}" rows="8" readonly>${esc(text)}</textarea>`;
      const area = $<HTMLTextAreaElement>("textarea", slot)!;
      area.focus();
      area.select();
      return;
    }
    btn.focus();
  }

  // ---------- 3. opted in ----------

  function optinsHtml(rows: Optin[]) {
    if (!rows.length) return empty("Nobody has opted in yet. Organizations choose this on their report.");
    const yes = (b: boolean) => (b ? "Yes" : "No");
    return `<p class="sq-csv"><button type="button" class="btn btn-secondary btn-sm" data-q-csv="optins">${icon("download")}<span>Download as CSV</span></button></p>
      ${table("sq-optins-table", `${plural(rows.length, "organization", "organizations")} opted in`, th(["Organization", "Program model", "State", "Trainings", "Updates", "Name", "Email", "Date"]),
        rows.map((r) => `<tr><th scope="row">${reportLink(r.assessment_id, r.org_name)}</th><td>${esc(r.program_models.join(", "))}</td><td>${esc(r.states.map(ctx.stateName).join(", "))}</td>
          <td>${yes(r.training)}</td><td>${yes(r.updates)}</td><td>${esc(r.name ?? "")}</td><td class="sq-nowrap">${esc(r.email)}</td><td class="sq-nowrap">${esc(r.updated.slice(0, 10))}</td></tr>`).join(""))}`;
  }

  // ---------- 4. where people stop ----------

  function funnelHtml(f: Funnel) {
    const bar = (n: number, of: number) => {
      if (!of) return '<span class="meta">None started</span>';
      const p = Math.round((100 * n) / of);
      return `<span class="share"><span class="share__track" aria-hidden="true"><span class="share__fill" style="width:${p}%"></span></span><span>${n} of ${of} (${p}%)</span></span>`;
    };
    return `${kpis([
        ["Started", f.started, "saved drafts"],
        ["Submitted", f.submitted, "finished the assessment"],
        ["Abandoned", f.abandoned, "no change for 3 days or more, never submitted"],
      ])}
      <h3 class="sub-head">Started and finished, by area</h3>
      ${f.by_area.length ? table("sq-funnel-areas", "Saved drafts that started and finished each area", th(["Area", "#Started", "Finished"]),
        f.by_area.map((a) => `<tr><th scope="row">${esc(a.domain_name)}</th><td class="num">${a.started}</td><td class="sq-share">${bar(a.finished, a.started)}</td></tr>`).join("")) : empty("No saved drafts yet.")}
      <h3 class="sub-head">Most common last area</h3>
      <p class="hint">The area people were in when they stopped, for abandoned drafts.</p>
      ${f.last_area.length ? `<ol class="sq-last">${f.last_area.map((a) => `<li>${esc(a.domain_name)}: ${plural(a.count, "draft", "drafts")}</li>`).join("")}</ol>` : empty("No abandoned drafts.")}`;
  }

  // ---------- loading, errors, retry ----------

  const SECTIONS: Record<string, { what: string; load: () => Promise<void>; html: () => string }> = {
    quality: { what: "report quality", load: async () => { quality = await api.get<Quality>("/staff/quality"); }, html: () => qualityHtml(quality!) },
    follow: { what: "roadmap follow-through", load: async () => { roadmaps = (await api.get<{ roadmaps: Roadmap[] }>("/staff/roadmaps")).roadmaps; }, html: followHtml },
    optins: { what: "the opt-in list", load: async () => { optins = (await api.get<{ optins: Optin[] }>("/staff/optins")).optins; }, html: () => optinsHtml(optins) },
    funnel: { what: "where people stop", load: async () => { funnelData = await api.get<Funnel>("/staff/funnel"); }, html: () => funnelHtml(funnelData!) },
  };

  async function load(id: string) {
    const el = $(`#sq-${id}`, panel)!;
    const s = SECTIONS[id];
    el.setAttribute("aria-busy", "true");
    el.innerHTML = `<p class="loading">${icon("loader", "spin")}Loading ${s.what}</p>`;
    try {
      await s.load();
      el.innerHTML = s.html();
      markScroll(el);
      return true;
    } catch (e) {
      el.innerHTML = `<p class="field-error" role="alert">${failHtml(e, `We could not load ${s.what}. The server may be busy for a moment.`)}</p>
        ${expired(e) ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-q-retry="${id}">${icon("refresh")}<span>Try again</span></button>`}`;
      return false;
    } finally {
      el.removeAttribute("aria-busy");
    }
  }

  // ---------- review actions ----------

  async function review(sid: string, body: { status: "reviewed" | "flagged"; issue?: string; note?: string }, errSlot: HTMLElement) {
    const org = quality?.queue.find((r) => r.assessment_id === sid)?.org_name ?? "the report";
    panel.querySelectorAll<HTMLButtonElement>("[data-q-review], [data-q-flag], #sq-flag button").forEach((b) => { b.disabled = true; });
    errSlot.innerHTML = `<p class="loading">${icon("loader", "spin")}Saving</p>`;
    try {
      await api.post(`/staff/reviews/${encodeURIComponent(sid)}`, body);
    } catch (e) {
      panel.querySelectorAll<HTMLButtonElement>("[data-q-review], [data-q-flag], #sq-flag button").forEach((b) => { b.disabled = false; });
      const text = e instanceof ApiError && e.status === 400 && e.message ? e.message : "We could not save that. Please try again.";
      errSlot.innerHTML = `<p class="field-error" role="alert">${failHtml(e, text)}</p>`;
      return;
    }
    const done = body.status === "reviewed" ? `${org} marked reviewed.` : `${org} flagged: ${issueName(body.issue ?? null)}.`;
    if (await load("quality")) {
      $("#sq-review-status", panel)!.innerHTML = `<p class="meta">${icon("circle-check")} ${esc(done)}</p>`;
      announce(done);
    }
    focusEl($("#sq-queue-title", panel) ?? $("#sqh-quality", panel));
  }

  function openFlag(btn: HTMLElement) {
    const form = $<HTMLFormElement>("#sq-flag", panel)!;
    const cur = quality?.queue.find((r) => r.assessment_id === btn.dataset.qFlag);
    form.dataset.sid = btn.dataset.qFlag!;
    $("#sq-flag-title", form)!.textContent = `Flag the report for ${btn.dataset.qOrg}`;
    $<HTMLSelectElement>("#sq-issue", form)!.value = cur?.issue ?? "wrong_facts";
    $<HTMLTextAreaElement>("#sq-note", form)!.value = "";
    $("#sq-flag-error", form)!.innerHTML = "";
    form.hidden = false;
    flagOpener = btn;
    focusEl($("#sq-flag-title", form));
  }

  panel.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const retry = t.closest<HTMLElement>("[data-q-retry]");
    if (retry) { const id = retry.dataset.qRetry!; load(id).then(() => focusEl($(`#sqh-${id}`, panel))); return; }
    const rev = t.closest<HTMLElement>("[data-q-review]");
    if (rev) { review(rev.dataset.qReview!, { status: "reviewed" }, $("#sq-review-status", panel)!); return; }
    const flag = t.closest<HTMLElement>("[data-q-flag]");
    if (flag) { openFlag(flag); return; }
    if (t.closest("[data-q-cancel]")) { $("#sq-flag", panel)!.hidden = true; flagOpener?.focus(); return; }
    const n = t.closest<HTMLElement>("[data-q-note]");
    if (n) { copyNote(n.dataset.qNote!, n); return; }
    const csv = t.closest<HTMLElement>("[data-q-csv]");
    if (csv?.dataset.qCsv === "follow") {
      downloadCsv("oci-follow-through", [["Organization", "Status", "Weeks done", "Weeks total", "Steps done", "Steps total", "Percent of steps", "Last step", "Days since last step"],
        ...follows().map((f) => [f.name, f.status, f.r?.weeks_done ?? "", f.r?.weeks_total ?? "", f.r?.tasks_done ?? "", f.r?.total ?? "", f.r ? f.r.pct : "", f.r?.last_activity ?? "", f.days ?? ""])]);
      announce("Follow-through downloaded as CSV.");
    } else if (csv?.dataset.qCsv === "optins") {
      downloadCsv("oci-opt-ins", [["Organization", "Program model", "State", "Trainings", "Updates", "Name", "Email", "Date"],
        ...optins.map((r) => [r.org_name, r.program_models.join("; "), r.states.map(ctx.stateName).join("; "), r.training ? "Yes" : "No", r.updates ? "Yes" : "No", r.name ?? "", r.email, r.updated])]);
      announce("Opt-in list downloaded as CSV.");
    }
  });

  panel.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id !== "sq-flag") return;
    e.preventDefault();
    const note = $<HTMLTextAreaElement>("#sq-note", form)!.value.trim();
    review(form.dataset.sid!, { status: "flagged", issue: $<HTMLSelectElement>("#sq-issue", form)!.value, ...(note ? { note } : {}) }, $("#sq-flag-error", form)!);
  });

  return {
    /** First time the tab is shown: load every section in parallel. */
    show() {
      if (shown) return;
      shown = true;
      Promise.all(Object.keys(SECTIONS).map(load)).then((ok) => announce(ok.every(Boolean) ? "Quality and follow-through loaded." : "Some sections could not load."));
    },
    /** Filters changed the organization list: redraw follow-through from the roadmaps already loaded. */
    biChanged() {
      if (!roadmaps) return;
      const el = $("#sq-follow", panel)!;
      el.innerHTML = followHtml();
      markScroll(el);
    },
  };
}
