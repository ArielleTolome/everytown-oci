// The in-progress assessment lives in localStorage (the fast path), so a reload never loses answers.
// Once a resume link exists, every save also syncs to the server (debounced 1 s), so the person can resume on any
// device and send one area to a teammate. Teammate links (?d=<share token>&area=<ID>) answer only that area.

import { api, ApiError, getMeta } from "./api";
import { $, announce, esc, focusEl } from "./dom";
import { icon } from "./icons";

export interface OrgMeta { program_models: string[]; staff_size: string | null; state: string | null }

export interface Draft {
  org_name: string;
  org_url: string;
  language: "en" | "es";
  domain_ids: string[];
  answers: Record<string, "yes" | "no">;
  org_meta?: OrgMeta | null;
}

/** Where a draft syncs to. `area` is set only for a teammate link. `dirty` = local changes not yet on the server. */
interface Sync { token: string; area: string | null; dirty: boolean }

const LEADER = { draft: "oci-draft", sync: "oci-draft-sync" };
// A teammate on the same browser must not overwrite the leader's own draft.
const TEAM = { draft: "oci-draft-team", sync: "oci-draft-team-sync" };
const SAVED_LOCAL = "Saved on this device";
const SAVED_SERVER = "Saved. You can resume on any device";
const SAVED_TEAM = "Saved and shared with your team";

let slot = LEADER;
let current: Draft | null = null;
let teamArea: { name: string; ids: string[] } | null = null; // the teammate's area, known once its screen is mounted
let timer: number | undefined;

const read = <T>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const write = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or disabled */ }
};
const sync = () => read<Sync>(slot.sync);
const team = () => sync()?.area ?? null;

function normalize(d: Partial<Draft> | null): Draft | null {
  if (!d || typeof d !== "object") return null;
  const m = d.org_meta;
  return {
    org_name: String(d.org_name || ""),
    org_url: String(d.org_url || ""),
    language: d.language === "es" ? "es" : "en",
    domain_ids: Array.isArray(d.domain_ids) ? d.domain_ids.map(String) : [],
    answers: d.answers && typeof d.answers === "object" ? d.answers : {},
    org_meta: m && typeof m === "object"
      ? { program_models: Array.isArray(m.program_models) ? m.program_models.map(String) : [], staff_size: m.staff_size ?? null, state: m.state ?? null }
      : null,
  };
}

/** Server copy plus local copy: unsynced local edits win; otherwise the server (which has teammates' answers) wins. */
function combine(server: Draft, local: Draft | null, dirty: boolean): Draft {
  if (!local) return server;
  return dirty
    ? { ...local, answers: { ...server.answers, ...local.answers } }
    : { ...server, answers: { ...local.answers, ...server.answers } };
}

/** The draft for this page. With ?d=<token> it is loaded from the server (resume or teammate link). */
export async function loadDraft(): Promise<Draft | null> {
  const params = new URLSearchParams(location.search);
  const token = params.get("d");
  if (token) {
    let res: { data: Draft; area: string | null };
    try {
      res = await api.get(`/drafts/${encodeURIComponent(token)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { location.replace("/resume/?missing=1"); return new Promise(() => {}); }
      throw e;
    }
    slot = res.area ? TEAM : LEADER;
    const s = sync();
    const same = s?.token === token;
    current = combine(normalize(res.data)!, same ? normalize(read(slot.draft)) : null, same && !!s?.dirty);
    write(slot.draft, current);
    write(slot.sync, { token, area: res.area, dirty: same && !!s?.dirty });
    if (same && s?.dirty) schedule();
    // The resume token now lives on this device; a teammate keeps the link so a reload stays in teammate mode.
    if (!res.area) history.replaceState(null, "", location.pathname + location.hash);
    return current;
  }
  slot = LEADER;
  current = normalize(read(LEADER.draft));
  const s = sync();
  if (current && s) {
    try {
      const res = await api.get<{ data: Draft }>(`/drafts/${encodeURIComponent(s.token)}`);
      current = combine(normalize(res.data)!, current, s.dirty);
      write(LEADER.draft, current);
      if (s.dirty) schedule();
    } catch { /* offline or expired: keep working from this device */ }
  }
  return current;
}

export function saveDraft(d: Draft) {
  current = d;
  write(slot.draft, d);
  const s = sync();
  if (!s) return;
  write(slot.sync, { ...s, dirty: true });
  schedule();
}

export function clearDraft() {
  window.clearTimeout(timer);
  try { localStorage.removeItem(slot.draft); localStorage.removeItem(slot.sync); } catch { /* ignore */ }
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { push().catch(() => setStatus(false)); }, 1000);
}

/** Send local changes now. A teammate sends only their area's answers; the server merges and never deletes. */
async function push(): Promise<void> {
  window.clearTimeout(timer);
  const s = sync();
  if (!s || !current) return;
  const body = s.area ? { area: s.area, data: { answers: current.answers } } : { data: current };
  const res = await api.post<{ data: Draft }>(`/drafts/${encodeURIComponent(s.token)}`, body);
  // Pick up answers a teammate added meanwhile (same object the questionnaire renders from).
  for (const [id, v] of Object.entries(normalize(res.data)!.answers)) if (!(id in current.answers)) current.answers[id] = v;
  write(slot.draft, current);
  write(slot.sync, { ...s, dirty: false });
  setStatus(true);
}

/** Reuse the questionnaire's own status line ("Saved on this device ...") instead of a second live region. */
function setStatus(online: boolean) {
  const el = $("#save-status span");
  if (!el?.textContent) return;
  const label = team() ? SAVED_TEAM : SAVED_SERVER;
  el.textContent = online
    ? el.textContent.replace(SAVED_LOCAL, label)
    : el.textContent.replace(SAVED_TEAM, SAVED_LOCAL).replace(SAVED_SERVER, SAVED_LOCAL);
}

async function ensureToken(): Promise<string> {
  const s = sync();
  if (s) return s.token;
  const { token } = await api.post<{ token: string }>("/drafts", { data: current });
  write(slot.sync, { token, area: null, dirty: false });
  return token;
}

/** First 8 characters, grouped: a human check that a saved link is the right one (never used to look it up). */
export const resumeCode = (token: string) => token.slice(0, 8).toUpperCase().replace(/^(.{4})/, "$1-");

const ROLE: Record<string, string> = {
  FM: "your bookkeeper", PL: "your director", FR: "the person who leads fundraising", GV: "your board chair",
  HR: "the person who handles hiring", ML: "the person who tracks your data", CE: "the person who leads partnerships",
  TI: "the person who looks after your computers",
};

function linkBlock(id: string, label: string, url: string) {
  return `<label class="draft-panel__label" for="${id}">${esc(label)}</label>
    <div class="input-group">
      <input class="input" id="${id}" type="text" readonly value="${esc(url)}" spellcheck="false">
      <button type="button" class="btn btn-primary btn-sm" data-copy="${id}">${icon("clipboard")}<span>Copy link</span></button>
    </div>`;
}

async function copy(input: HTMLInputElement, status: HTMLElement) {
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand("copy"); }
  status.textContent = "Link copied.";
}

async function fillPanel(panel: HTMLElement, kind: "save" | "share", area: string, areaName: string) {
  panel.innerHTML = `<p class="loading">${icon("loader", "spin")}Making your link</p>`;
  try {
    const token = await ensureToken();
    await push();
    const base = `${location.origin}/questionnaire/`;
    if (kind === "save") {
      panel.innerHTML = `
        <p class="draft-panel__title" tabindex="-1">Finish later, on any device</p>
        <p>Your answers are saved. To keep going later, open this link and sign in with the demo login.</p>
        ${linkBlock("dt-save-link", "Your resume link", `${base}?d=${token}#1`)}
        <p>Resume code: <strong class="draft-panel__code">${esc(resumeCode(token))}</strong>. Use it to check you have the right link. You can also paste the link on the <a href="/resume/">Continue an assessment</a> page.</p>
        <p class="hint">Keep this link private. Anyone who signs in with it can see and change these answers.</p>
        <p class="draft-panel__status" role="status"></p>`;
    } else {
      const { token: share } = await api.post<{ token: string }>(`/drafts/${encodeURIComponent(token)}/share`, { area });
      panel.innerHTML = `
        <p class="draft-panel__title" tabindex="-1">Send ${esc(areaName)} to a teammate</p>
        <p>Someone else may know this area best, like ${esc(ROLE[area] ?? "a teammate")}. Send them this link. They sign in with the demo login and answer only ${esc(areaName)}. They cannot see or change your other areas. Their answers join this same assessment.</p>
        ${linkBlock("dt-share-link", `Teammate link for ${areaName}`, `${base}?d=${share}&area=${encodeURIComponent(area)}#1`)}
        <p class="draft-panel__status" role="status"></p>`;
    }
    const status = panel.querySelector<HTMLElement>(".draft-panel__status")!;
    panel.querySelector<HTMLButtonElement>("[data-copy]")!.addEventListener("click", (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.copy!;
      copy(panel.querySelector<HTMLInputElement>(`#${id}`)!, status);
    });
    focusEl(panel.querySelector(".draft-panel__title"));
  } catch {
    panel.innerHTML = `<p class="field-error" role="alert">${icon("alert")}<span>We could not make a link right now. Your answers are still saved on this device. Please try again.</span></p>`;
  }
}

/** Fills `<div id="draft-tools" data-area="ID">` that the questionnaire renders under the stepper on every area screen. */
export async function mountDraftTools(el: HTMLElement) {
  if (el.dataset.mounted) return;
  el.dataset.mounted = "1";
  const area = el.dataset.area || "";
  const meta = await getMeta();
  const areaName = meta.domains.find((d) => d.id === area)?.name ?? "this area";
  if (team()) {
    teamArea = { name: areaName, ids: meta.domains.find((d) => d.id === area)?.questions.map((q) => q.id) ?? [] };
    el.innerHTML = `<div class="notice draft-team">${icon("users")}<p>You are answering <strong>${esc(areaName)}</strong> for ${esc(current?.org_name || "your team")}. Answer every statement, then choose <strong>Send my answers back</strong>. Your answers join your team's assessment.</p></div>`;
    $("#back-btn")?.setAttribute("hidden", "");
    const next = $("#next-btn span");
    if (next) next.textContent = "Send my answers back";
    return;
  }
  el.innerHTML = `<div class="draft-tools">
      <div class="draft-tools__buttons">
        <button type="button" class="btn btn-secondary btn-sm" aria-expanded="false" aria-controls="dt-save">${icon("clock")}<span>Save and finish later</span></button>
        <button type="button" class="btn btn-secondary btn-sm" aria-expanded="false" aria-controls="dt-share">${icon("users")}<span>Send this area to a teammate</span></button>
      </div>
      <div class="draft-panel" id="dt-save" hidden></div>
      <div class="draft-panel" id="dt-share" hidden></div>
    </div>`;
  el.querySelectorAll<HTMLButtonElement>("[aria-controls]").forEach((btn) => btn.addEventListener("click", () => {
    const panel = el.querySelector<HTMLElement>(`#${btn.getAttribute("aria-controls")}`)!;
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) fillPanel(panel, panel.id === "dt-save" ? "save" : "share", area, areaName);
  }));
  if (sync() && !sync()!.dirty) setStatus(true);
}

/** Teammate mode: once the area is complete, "Send my answers back" syncs instead of submitting an assessment.
 * Runs in the capture phase so the questionnaire's own submit handler never sees it; an incomplete area falls
 * through to the questionnaire, which shows its usual "Please answer" errors. */
document.addEventListener("submit", async (e) => {
  const form = e.target as HTMLElement;
  // Decide synchronously: preventDefault and stopping propagation only work before the first await.
  if (!team() || !teamArea?.ids.length || form.id !== "area-form" || !current) return;
  if (!teamArea.ids.every((id) => current!.answers[id])) return;
  const { name } = teamArea;
  e.preventDefault();
  e.stopImmediatePropagation();
  const err = $("#submit-error");
  try {
    await push();
    const root = $("#q-root")!;
    root.innerHTML = `<div class="title-band"><span class="eyebrow">Thank you</span>
        <h1 id="sent-title" tabindex="-1">Your answers were sent back</h1></div>
      <div class="card stack">
        <p>${icon("circle-check")} Your ${esc(name)} answers are now part of ${esc(current.org_name)}'s assessment. The person who sent you the link will see them when they open it.</p>
        <p>You can close this page.</p>
      </div>`;
    try { localStorage.removeItem(TEAM.draft); localStorage.removeItem(TEAM.sync); } catch { /* ignore */ }
    document.title = "Answers sent · OCI Capacity Coach";
    focusEl($("#sent-title"));
    announce("Your answers were sent back.");
  } catch {
    if (err) { err.innerHTML = `${icon("alert")}<span>We could not send your answers. They are saved on this device. Please try again.</span>`; err.hidden = false; }
  }
}, true);

// The questionnaire re-renders each area screen; fill the placeholder whenever a new one appears.
new MutationObserver(() => {
  const el = document.getElementById("draft-tools");
  if (el && !el.dataset.mounted) mountDraftTools(el);
}).observe(document.body, { childList: true, subtree: true });
