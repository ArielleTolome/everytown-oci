// "Stay connected with the Community Safety Fund" (v1.7): optional sign-up for CSF trainings and occasional updates,
// open to any CVI organization (GET/POST /api/assessments/<id>/optin). Unticking both withdraws. Owner and staff only.
import { api, ApiError, type ApiErrorBody, type Assessment } from "./api";
import { esc, focusEl, announce } from "./dom";
import { icon } from "./icons";
import { errorText, fold } from "./report-ui";

export interface Optin { training: boolean; updates: boolean; name: string | null; email: string | null; created: string; updated: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EN = {
  eyebrow: "Trainings and news", title: "Stay connected with the Community Safety Fund",
  intro: "The Community Safety Fund runs trainings and shares news for community violence intervention groups. Any organization can sign up, not only grantees.",
  legend: "What would you like?", privacy: "Optional. We only use this to invite you to what you picked. You can change it any time.",
  training: "Invite me to CSF trainings", updates: "Send me occasional updates",
  name: "Your name", optional: "(optional)", email: "Email",
  emailBad: "Enter an email address, like name@example.org.",
  save: "Save", cancel: "Cancel", change: "Change", show: "Sign up for trainings or updates",
  items: ["CSF trainings", "occasional updates"], and: " and ",
  saved: (list: string, email: string) => `You signed up for ${list}. We will write to ${email}.`,
  withdrawn: "Saved. You are not signed up, so we will not write to you.",
  forbidden: "Only the person who submitted this assessment can sign up here.",
  fail: "We could not save this. Please try again.",
};
const ES: typeof EN = {
  eyebrow: "Capacitaciones y noticias", title: "Manténgase en contacto con el Community Safety Fund",
  intro: "El Community Safety Fund ofrece capacitaciones y comparte noticias para grupos de intervención comunitaria contra la violencia. Cualquier organización puede inscribirse, no solo las que reciben fondos.",
  legend: "¿Qué le gustaría recibir?", privacy: "Es opcional. Solo usamos estos datos para invitarle a lo que eligió. Puede cambiarlo cuando quiera.",
  training: "Invítenme a las capacitaciones del CSF", updates: "Envíenme noticias de vez en cuando",
  name: "Su nombre", optional: "(opcional)", email: "Correo electrónico",
  emailBad: "Escriba un correo electrónico, por ejemplo nombre@example.org.",
  save: "Guardar", cancel: "Cancelar", change: "Cambiar", show: "Inscribirse para capacitaciones o noticias",
  items: ["capacitaciones del CSF", "noticias de vez en cuando"], and: " y ",
  saved: (list: string, email: string) => `Se inscribió para recibir ${list}. Le escribiremos a ${email}.`,
  withdrawn: "Guardado. No está inscrito, así que no le escribiremos.",
  forbidden: "Solo la persona que envió esta evaluación puede inscribirse aquí.",
  fail: "No pudimos guardar. Inténtelo de nuevo.",
};

const picked = (t: typeof EN, o: Optin) => [o.training && t.items[0], o.updates && t.items[1]].filter(Boolean).join(t.and);

/** Hidden until the GET answers: owners get the form, staff a read-only line when the organization signed up. */
export function optinSection(sub: Assessment, staff: boolean): string {
  const es = sub.language === "es" && !staff;
  const t = es ? ES : EN;
  return `<section class="section optin" id="optin-section" aria-labelledby="optin-title" data-no-print hidden${es ? ' lang="es"' : ""}>
    <div class="section-head"><div><span class="eyebrow">${esc(t.eyebrow)}</span><h2 id="optin-title">${esc(t.title)}</h2></div></div>
    <div class="card peers__card">
      <div class="peers__intro">${icon("calendar", "peers__icon")}<div><p>${esc(t.intro)}</p></div></div>
      <div id="optin-body"></div>
    </div>
  </section>`;
}

function formHtml(t: typeof EN, o: Optin | null, note = ""): string {
  const on = !!(o?.training || o?.updates);
  const box = (name: "training" | "updates") => `<label class="choice">
      <input type="checkbox" name="${name}"${o?.[name] ? " checked" : ""}>
      <span class="choice__text">${esc(t[name])}</span>${icon("check", "choice__check")}
    </label>`;
  return `${note ? `<p class="support__sent" id="optin-status" tabindex="-1">${icon("circle-check")}<span>${esc(note)}</span></p>` : ""}
  <form id="optin-form" novalidate>
    <fieldset aria-describedby="optin-privacy">
      <legend class="mini-label">${esc(t.legend)}</legend>
      <p class="hint" id="optin-privacy">${esc(t.privacy)}</p>
      <div class="choice-row">${box("training")}${box("updates")}</div>
    </fieldset>
    <div class="optin__contact" id="optin-contact"${on ? "" : " hidden"}>
      <div class="field">
        <label for="optin-name">${esc(t.name)} <span class="optional">${esc(t.optional)}</span></label>
        <input class="input" id="optin-name" name="name" type="text" maxlength="100" autocomplete="name" autocapitalize="words" enterkeyhint="next" value="${esc(o?.name ?? "")}">
      </div>
      <div class="field">
        <label for="optin-email">${esc(t.email)}</label>
        <p class="field-error" id="optin-email-error" hidden></p>
        <input class="input" id="optin-email" name="email" type="email" maxlength="200" autocomplete="email" autocapitalize="none" enterkeyhint="done" spellcheck="false" value="${esc(o?.email ?? "")}">
      </div>
    </div>
    <p class="field-error" id="optin-error" role="alert" hidden></p>
    <div class="actions actions--start">
      <button type="submit" class="btn btn-primary">${icon("check")}<span>${esc(t.save)}</span></button>
      ${on ? `<button type="button" class="btn btn-secondary" id="optin-cancel">${esc(t.cancel)}</button>` : ""}
    </div>
  </form>`;
}

function savedHtml(t: typeof EN, o: Optin): string {
  return `<p class="support__sent" id="optin-status" tabindex="-1">${icon("circle-check")}<span>${esc(t.saved(picked(t, o), o.email ?? ""))}</span></p>
    <button type="button" class="btn btn-secondary" id="optin-edit">${icon("pencil")}<span>${esc(t.change)}</span></button>`;
}

/** 400 bodies are {error} or {errors: {field: message}}; show the server's words either way. */
function serverMessage(ex: unknown, fallback: string): string {
  const errs = ex instanceof ApiError ? (ex.body as ApiErrorBody).errors : undefined;
  return errs && Object.keys(errs).length ? Object.values(errs).join(" ") : errorText(ex, fallback);
}

export function wireOptin(sub: Assessment, root: ParentNode, staff: boolean) {
  const section = root.querySelector<HTMLElement>("#optin-section");
  const body = root.querySelector<HTMLElement>("#optin-body");
  if (!section || !body) return;
  const t = sub.language === "es" && !staff ? ES : EN;
  const url = `/assessments/${encodeURIComponent(sub.id)}/optin`;
  let optin: Optin | null = null;

  api.get<{ optin: Optin | null }>(url).then((res) => {
    optin = res.optin ?? null;
    if (staff) {
      // Staff see the sign-up only when there is one; the staff dashboard lists everyone who opted in.
      if (!optin) { section.remove(); return; }
      body.innerHTML = `<p class="support__sent">${icon("circle-check")}<span>This organization signed up for ${esc(picked(EN, optin))}. Contact: ${esc([optin.name, optin.email].filter(Boolean).join(", "))}. Updated ${esc(optin.updated)}.</span></p>`;
    } else {
      body.innerHTML = optin ? savedHtml(t, optin) : fold(esc(t.show), formHtml(t, null));
    }
    section.hidden = false;
  }).catch(() => section.remove()); // 403: not the owner; 404 or offline: nothing to offer

  if (staff) return;
  const setError = (id: string, msg: string) => {
    const err = body.querySelector<HTMLElement>(`#${id}`)!;
    err.innerHTML = msg ? `${icon("alert")}<span>${esc(msg)}</span>` : "";
    err.hidden = !msg;
  };
  body.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (el.closest("#optin-edit")) { body.innerHTML = formHtml(t, optin); body.querySelector<HTMLInputElement>("input[name=training]")?.focus(); }
    if (el.closest("#optin-cancel") && optin) { body.innerHTML = savedHtml(t, optin); focusEl(body.querySelector("#optin-status")); }
  });
  body.addEventListener("change", (e) => {
    if (!(e.target as HTMLElement).matches("input[type=checkbox]")) return;
    body.querySelector<HTMLElement>("#optin-contact")!.hidden = !body.querySelector("input[type=checkbox]:checked");
  });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const training = form.querySelector<HTMLInputElement>("input[name=training]")!.checked;
    const updates = form.querySelector<HTMLInputElement>("input[name=updates]")!.checked;
    const name = form.querySelector<HTMLInputElement>("#optin-name")!.value.trim();
    const emailEl = form.querySelector<HTMLInputElement>("#optin-email")!;
    const email = emailEl.value.trim();
    setError("optin-error", "");
    const bad = (training || updates) && (!EMAIL.test(email) || email.length > 200);
    setError("optin-email-error", bad ? t.emailBad : "");
    if (bad) {
      emailEl.setAttribute("aria-invalid", "true");
      emailEl.setAttribute("aria-describedby", "optin-email-error");
      emailEl.focus();
      return;
    }
    emailEl.removeAttribute("aria-invalid");
    emailEl.removeAttribute("aria-describedby");
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    if (btn.getAttribute("aria-disabled") === "true") return;
    btn.setAttribute("aria-disabled", "true");
    try {
      const res = await api.post<{ optin: Optin | null }>(url, training || updates ? { training, updates, name, email } : { training, updates });
      optin = res.optin ?? null;
      body.innerHTML = optin ? savedHtml(t, optin) : formHtml(t, null, t.withdrawn);
      focusEl(body.querySelector("#optin-status"));
      announce(optin ? t.saved(picked(t, optin), optin.email ?? "") : t.withdrawn);
    } catch (ex) {
      btn.removeAttribute("aria-disabled");
      setError("optin-error", ex instanceof ApiError && ex.status === 403 ? t.forbidden : serverMessage(ex, t.fail));
    }
  });
}
