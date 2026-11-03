// Typed client for the Flask JSON API (contract v0.5). Same origin: /api/* behind CloudFront, Vite proxy in dev.

export interface User { name: string; role: "org" | "staff" }
export interface Question { id: string; text: string; stage: number; stage_name: string; reverse: boolean }
export interface Domain { id: string; name: string; weight: number; about: string; connects: string; priority: boolean; questions: Question[] }
export interface Stage { n: number; name: string; description: string }
export interface Sample { id: string; name: string; summary: string }
export interface Meta { domains: Domain[]; stages: Stage[]; samples: Sample[]; languages: string[]; default_domains: string[] }

export interface Step { key: string; label: string; state: "pending" | "running" | "done" | "error" }
export interface DomainResult {
  domain_id: string; domain_name: string; total_questions: number; favorable_count: number;
  gap_count: number; score_pct: number; estimated_stage: string; high_count: number;
}
export interface Gap {
  question_id: string; domain_id: string; domain_name: string; stage: number; stage_name: string;
  question_text: string; next_steps: string[]; score: number; priority: "High" | "Medium" | "Low";
}
export interface Resource { title: string; url: string }
export interface Focus { title: string; why: string; gap_ids: string[]; steps: string[]; resource: Resource | null }
export interface PlanItem extends Focus { horizon: 30 | 60 | 90; owner: string }
export interface Report {
  summary: string; focus: Focus[]; strengths: string[]; plan: PlanItem[]; conversation: string[]; sources: Resource[];
  reading_grade?: number | null; simplified?: boolean;
}
export interface Progress {
  previous_id: string; previous_created: string;
  closed: { id: string; text: string }[]; new: { id: string; text: string }[];
  stages: { domain_id: string; domain_name: string; from: string; to: string }[];
}
export interface Assessment {
  id: string; created: string; org_name: string; org_url: string; language: "en" | "es"; domain_ids: string[];
  answers: Record<string, "yes" | "no">;
  overall: { total_questions: number; favorable: number; favorable_pct: number; total_gaps: number; high: number; medium: number; low: number } | null;
  domains: DomainResult[]; gaps: Gap[]; status: "running" | "done" | "error"; steps: Step[]; error: string | null;
  progress: Progress | null; pdf_kb: number | null; report: Report | null;
  /** Latest Community Safety Fund support request for this assessment (v0.8). */
  support?: Support | null;
}
export interface StatusResponse { status: Assessment["status"]; steps: Step[]; error: string | null }
export interface Support { domain_ids: string[]; requested_at: string }

export interface Analytics {
  totals: { organizations: number; assessments: number; last_30_days: number };
  domains: { domain_id: string; domain_name: string; assessed: number; avg_capacity: number; stages: Record<string, number> }[];
  top_gaps: { question_id: string; domain_id: string; domain_name: string; question_text: string; stage_name: string; orgs: number; share_pct: number }[];
  cohorts: { question_id: string; question_text: string; domain_name: string; priority_orgs: number; organizations: { id: string; name: string; assessment_id: string }[] }[];
  /** Latest support request per organization, grouped by area, sorted by orgs desc (v0.8). */
  support_requests?: { domain_id: string; domain_name: string; orgs: number; organizations: { id: string; name: string; assessment_id: string; requested_at: string }[] }[];
  organizations: {
    id: string; name: string; assessment_id: string; assessed: string; source: "web" | "demo" | "seed";
    gap_count: number; high_count: number;
    domains: { domain_id: string; estimated_stage: string; score_pct: number; percentile: number | null }[];
  }[];
}

/** Error bodies: {error} for 401/403/404, {errors, missing} for validation 400s. */
export interface ApiErrorBody { error?: string; errors?: Record<string, string>; missing?: string[] }

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.error || `Request failed (${status})`);
  }
}

/** Lowercase hex SHA-256 of the exact UTF-8 bytes sent. CloudFront OAC to a Lambda Function URL (AWS_IAM) requires it on requests with a body. */
async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: Uint8Array<ArrayBuffer> | undefined;
  if (body !== undefined) {
    payload = new TextEncoder().encode(JSON.stringify(body));
    headers["Content-Type"] = "application/json";
    headers["x-amz-content-sha256"] = await sha256Hex(payload);
  }
  const res = await fetch(`/api${path}`, { method, credentials: "same-origin", cache: "no-store", headers, body: payload });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, data && typeof data === "object" ? (data as ApiErrorBody) : {});
  return data as T; // trusted same-origin API; shapes defined by contract v0.5
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
};

/** Returns the signed-in user (and tells the header), or redirects to /login/ keeping where the user was going. */
export async function requireUser(): Promise<User> {
  try {
    const { user } = await api.get<{ user: User }>("/me");
    document.dispatchEvent(new CustomEvent("oci:user", { detail: user }));
    return user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const next = location.pathname + location.search + location.hash;
      location.replace(`/login/?next=${encodeURIComponent(next)}`);
      return new Promise<User>(() => {});
    }
    throw e;
  }
}

let metaCache: Promise<Meta> | null = null;
export const getMeta = () => (metaCache ??= api.get<Meta>("/meta"));
