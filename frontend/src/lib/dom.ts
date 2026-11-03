// Small DOM helpers for client scripts: escaping, querying, announcements.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = <T extends Element = HTMLElement>(sel: string, ctx: ParentNode = document) => ctx.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, ctx: ParentNode = document) => Array.from(ctx.querySelectorAll<T>(sel));

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Host part of a URL, shown next to external links so people see where they are going. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** Only allow http(s) links from API data. */
export function safeUrl(url: string): string {
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#"; } catch { return "#"; }
}

/** Move focus to a heading or container (adds tabindex=-1 when needed). */
export function focusEl(el: HTMLElement | null) {
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus();
}

/** Polite status announcement through the shared live region in the layout. */
export function announce(text: string) {
  const live = document.getElementById("live-status");
  if (!live) return;
  live.textContent = "";
  window.setTimeout(() => { live.textContent = text; }, 50);
}
