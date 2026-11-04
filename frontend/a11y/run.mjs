// Accessibility check of the real pages: axe-core (WCAG 2.0/2.1/2.2 A and AA) at 1280 and 375 px, in the default
// and the "larger text + high contrast" display modes, plus keyboard checks axe cannot do.
// Starts the stub API (a11y/stub_api.py, no AWS needed) and the Astro dev server, unless OCI_A11Y_BASE is set.
// Run: npm run a11y   (PYTHON=../.venv/bin/python if Flask is not on the default python3)
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const WIDTHS = [1280, 375];
const MODES = { default: {}, "large+contrast": { text: true, contrast: true } };
const BASE = process.env.OCI_A11Y_BASE || "http://127.0.0.1:4321";
const children = [];

async function up(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* not yet */ }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function start(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "inherit"], ...opts });
  children.push(child);
  return child;
}

if (!process.env.OCI_A11Y_BASE) {
  start(process.env.PYTHON || "python3", ["a11y/stub_api.py"]);
  start("npx", ["astro", "dev", "--host", "127.0.0.1", "--port", "4321"]);
  await up("http://127.0.0.1:8000/api/healthz");
  await up(BASE + "/login/");
}

const failures = [];
const fail = (where, msg) => { failures.push(`${where}: ${msg}`); };

const browser = await chromium.launch();
try {
  // One organization session: sign in, submit a sample so results and roadmap pages have a real report.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/login/");
  const login = (u) => page.evaluate((u) => fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: u }) }), u);
  await login("demo");
  const meta = await page.evaluate(() => fetch("/api/meta").then((r) => r.json()));
  const { id } = await page.evaluate((s) => fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sample: s }) }).then((r) => r.json()), meta.samples[0].id);
  const ids = meta.default_domains;
  const draft = { org_name: "Sample Org", org_url: "", language: "en", domain_ids: ids, answers: {} };

  const orgPages = [
    ["organization", "/"], ["questionnaire", "/questionnaire/#1"], ["results", `/results/?id=${id}`],
    ["roadmap", `/plan/?id=${id}`], ["resume", "/resume/"], ["not found", "/no-such-page/"],
  ];

  async function scan(p, name, path, ready) {
    for (const [mode, prefs] of Object.entries(MODES)) {
      for (const width of WIDTHS) {
        await p.setViewportSize({ width, height: 900 });
        if (!p.url().startsWith(BASE)) await p.goto(BASE + "/login/");
        await p.evaluate(([prefs, draft]) => {
          localStorage.setItem("oci-display", JSON.stringify(prefs));
          localStorage.setItem("oci-draft", JSON.stringify(draft));
        }, [prefs, draft]);
        await p.goto(BASE + path, { waitUntil: "networkidle" });
        if (ready) await ready(p);
        const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
        const where = `${name} @${width} ${mode}`;
        for (const v of r.violations) {
          fail(where, `${v.id} (${v.impact}): ${v.help} [${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}]`);
        }
        console.log(`${r.violations.length ? "FAIL" : "ok  "}  ${where}  (${r.passes.length} rules passed)`);
      }
    }
  }

  // Signed out
  const anon = await (await browser.newContext()).newPage();
  await scan(anon, "login", "/login/");

  for (const [name, path] of orgPages) {
    await scan(page, name, path, name === "results"
      ? (p) => p.waitForSelector("text=Your report is ready", { timeout: 15000 }).catch(() => fail(name, "report never became ready"))
      : null);
  }

  // Keyboard: skip link is first, works, and lands on main content.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute("href") }));
  if (!/skip/i.test(skip.text || "")) fail("keyboard", `first Tab stop is "${skip.text}", not a skip link`);
  else {
    await page.keyboard.press("Enter");
    const target = await page.evaluate(() => document.activeElement?.id || location.hash);
    if (!target || !skip.href?.endsWith(target.replace(/^#/, ""))) fail("keyboard", `skip link did not move focus to ${skip.href} (focus on ${target})`);
  }

  // Keyboard: Y / N answer the focused statement only (WCAG 2.1.4), in both the one-at-a-time and the Yes/No views,
  // and do nothing when focus is in a text field.
  const answers = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("oci-draft") || "{}").answers || {}));
  for (const [view, statement] of [["quick", "#quick-card .quick__btn"], ["yn", "fieldset.question input"]]) {
    await page.evaluate(([d, v]) => { localStorage.setItem("oci-draft", JSON.stringify(d)); localStorage.setItem("oci-q-view", v); }, [draft, view]);
    await page.goto(`${BASE}/questionnaire/?view=${view}#1`, { waitUntil: "networkidle" }); // a new URL forces a reload
    const target = page.locator(statement).first();
    if (!(await target.count())) { fail("keyboard", `${view} view: no statement control found (${statement})`); continue; }
    await target.focus();
    await page.keyboard.press("y");
    await sleep(200);
    if (!(await answers()).includes('"yes"')) fail("keyboard", `${view} view: pressing Y in a statement did not record a yes`);
    const text = page.locator("input[type=search], input[type=text], textarea").first();
    if (await text.count() && await text.isVisible()) {
      const before = await answers();
      await text.focus();
      await page.keyboard.press("n");
      await sleep(200);
      if (before !== (await answers())) fail("keyboard", `${view} view: pressing N while typing in a text field changed an answer`);
    }
  }
  await page.evaluate(() => localStorage.removeItem("oci-q-view"));

  // Keyboard: the Display menu opens from the keyboard and Escape closes it, returning focus to its button.
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const summary = page.locator("summary", { hasText: "Display" }).first();
  await summary.focus();
  await page.keyboard.press("Enter");
  const open = await summary.evaluate((s) => s.parentElement.open);
  await page.keyboard.press("Escape");
  const closed = await summary.evaluate((s) => !s.parentElement.open && document.activeElement === s);
  if (!open || !closed) fail("keyboard", `Display menu: opened=${open}, Escape closes and refocuses=${closed}`);

  // Staff
  await login("staff");
  await scan(page, "staff", "/staff/");
} finally {
  await browser.close();
  for (const c of children) c.kill();
}

if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n` + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("\nNo accessibility problems found.");
