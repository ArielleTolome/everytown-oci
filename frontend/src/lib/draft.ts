// The in-progress assessment lives in localStorage until it is submitted, so a reload never loses answers.

export interface Draft {
  org_name: string;
  org_url: string;
  language: "en" | "es";
  domain_ids: string[];
  answers: Record<string, "yes" | "no">;
}

const KEY = "oci-draft";

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (!d || typeof d !== "object") return null;
    return {
      org_name: String(d.org_name || ""),
      org_url: String(d.org_url || ""),
      language: d.language === "es" ? "es" : "en",
      domain_ids: Array.isArray(d.domain_ids) ? d.domain_ids.map(String) : [],
      answers: d.answers && typeof d.answers === "object" ? d.answers : {},
    };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or disabled */ }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
