// Small shared behaviors for the results and roadmap pages: readable API errors and PDF downloads that can fail politely.
import { ApiError } from "./api";
import { esc } from "./dom";
import { icon } from "./icons";

/** The server's own message when it sent one; never "Request failed (500)". A lapsed sign-in says how to recover. */
export function errorText(ex: unknown, fallback: string): string {
  if (ex instanceof ApiError && ex.status === 401) return "Your sign-in has ended. Reload the page to sign in again.";
  return ex instanceof ApiError && ex.body.error ? ex.body.error : fallback;
}

/** PDF links ([data-download]) stay plain links without JS. With JS the file is fetched first, so a slow PDF shows
 *  "Preparing" and a failed one shows an inline error instead of saving a broken file. */
export function wireDownloads(root: ParentNode) {
  root.addEventListener("click", async (e) => {
    const ev = e as MouseEvent;
    const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>("a[data-download]");
    if (!a || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    if (a.getAttribute("aria-disabled") === "true") return;
    let msg = a.nextElementSibling as HTMLElement | null;
    if (!msg?.classList.contains("download-msg")) {
      msg = document.createElement("span");
      msg.className = "download-msg";
      msg.setAttribute("role", "status");
      a.after(msg);
    }
    const say = (html: string, error = false) => { msg!.className = `download-msg${error ? " field-error" : ""}`; msg!.innerHTML = html; };
    a.setAttribute("aria-disabled", "true");
    say(`${icon("loader", "spin")}<span>Preparing your PDF…</span>`);
    try {
      const res = await fetch(a.href, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch { /* not JSON */ }
        throw new ApiError(res.status, body);
      }
      const url = URL.createObjectURL(await res.blob());
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] || a.getAttribute("download") || "report.pdf";
      const tmp = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(tmp);
      tmp.click();
      tmp.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(`${icon("circle-check")}<span>PDF downloaded.</span>`);
    } catch (ex) {
      say(`${icon("alert")}<span>${esc(errorText(ex, "We could not make the PDF right now. Please try again in a minute."))}</span>`, true);
    } finally {
      a.removeAttribute("aria-disabled");
    }
  });
}
