import { test } from '@e2e-dev/web';
import { expect, type App, type Screen } from 'e2e';

// v1.8 "Phone first" promises, measured in the page. Runs on both targets; phone-only promises skip above 599 px
// (the app's phone breakpoint). Read-only except a local questionnaire draft; never submits a questionnaire.
const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09'; // shared Riverbend sample
const ORG = 'QA Phone Flow Org';
const PHONE_MAX = 599;
const VIEWS = ['One at a time', 'Yes / No for each', "Checklist: tick what's true"] as const;

type Layout = { width: number; overflow: number; smallFields: string[] };
// Sideways scroll in px (0 = none) and visible text fields under 16 px (iOS zooms the page when one gets focus).
const layout = (): Layout => ({
  width: innerWidth,
  overflow: document.documentElement.scrollWidth - innerWidth,
  smallFields: [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]), select, textarea')]
    .filter((e) => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16)
    .map((e) => `${e.id || e.getAttribute('name')} ${getComputedStyle(e).fontSize}`),
});

async function startQuestionnaire({ app, screen }: { app: App; screen: Screen }) {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill(ORG);
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
}

test('the sign-in page fits the screen and its fields are 16 px or more', async ({ app, screen, browser }) => {
  await app.open('/login/');
  await expect(screen.getByLabel('Username')).toBeVisible();
  expect(await browser.evaluate(layout)).toMatchObject({ overflow: 0, smallFields: [] });
});

test('the start page, resume page and every questionnaire view never scroll sideways', { session: 'demo' }, async ({ app, screen, browser }) => {
  for (const path of ['/resume/', '/']) {
    await app.open(path);
    await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await browser.evaluate(layout), path).toMatchObject({ overflow: 0, smallFields: [] });
  }
  await startQuestionnaire({ app, screen });
  for (const view of VIEWS) {
    await screen.getByRole('radio', view).check();
    await expect(screen.getByRole('radio', view)).toBeChecked();
    expect(await browser.evaluate(layout), view).toMatchObject({ overflow: 0, smallFields: [] });
  }
});

test('phone: the start page shows Start questionnaire on the first screen and folds only optional parts', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await expect(screen.getByRole('button', 'Start questionnaire')).toBeVisible();
  const page = await browser.evaluate(() => {
    const start = [...document.querySelectorAll<HTMLElement>('#org-form button[type=submit]')].find((b) => b.innerText.includes('Start questionnaire'))!;
    const r = start.getBoundingClientRect();
    return {
      width: innerWidth,
      startOnFirstScreen: scrollY === 0 && r.top >= 0 && r.bottom <= innerHeight,
      openOptional: [...document.querySelectorAll<HTMLDetailsElement>('details.m-more')].filter((d) => d.open).map((d) => d.id || d.className),
      // Required fields must never sit in a folded group.
      foldedRequired: [...document.querySelectorAll<HTMLElement>('#org-form [required], #org-form input[name=respondent_role]')]
        .filter((e) => e.closest('details:not([open])')).map((e) => e.id || e.getAttribute('name')),
    };
  });
  test.skip(page.width > PHONE_MAX, 'phone layout only');
  expect(page).toMatchObject({ startOnFirstScreen: true, openOptional: [], foldedRequired: [] });
  // The default path: the required fields only (role, job title, name, organization name).
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill(ORG);
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
});

test('phone: One at a time shows the first statement with Yes and No above the sticky bar', { session: 'demo' }, async ({ app, screen, browser }) => {
  await startQuestionnaire({ app, screen });
  await expect(screen.getByRole('radio', 'One at a time')).toBeChecked();
  await expect(screen.getByRole('button', /^Yes/)).toBeVisible();
  const first = await browser.evaluate(() => {
    scrollTo(0, 0);
    const bar = document.querySelector('#q-bar')!.getBoundingClientRect();
    const answers = [...document.querySelectorAll('.quick__answers button')].map((b) => Math.round(b.getBoundingClientRect().bottom));
    return { width: innerWidth, answers, barTop: Math.round(Math.min(bar.top, innerHeight)) };
  });
  test.skip(first.width > PHONE_MAX, 'phone layout only');
  expect(first.answers).toHaveLength(2);
  for (const bottom of first.answers) expect(bottom).toBeLessThanOrEqual(first.barTop);
});

test('the sticky bar never covers the focused answer', { session: 'demo' }, async ({ app, screen, browser }) => {
  await startQuestionnaire({ app, screen });
  await screen.getByRole('radio', 'Yes / No for each').check();
  await expect(screen.getByRole('radio', 'Yes / No for each')).toBeChecked();
  const covered: string[] = [];
  let answers = 0;
  // Tab through the first 15 statements as a keyboard or switch user would (each Yes / No pair is one tab stop).
  for (let i = 0; i < 40 && answers < 15; i++) {
    await browser.keyboard.press('Tab');
    const f = await browser.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const row = el?.matches('#area-form .question input[type=radio]') ? el.closest('label')! : null;
      if (!row) return null;
      const r = row.getBoundingClientRect(), bar = document.querySelector('#q-bar')!.getBoundingClientRect();
      return { id: (el as HTMLInputElement).name, covered: r.bottom > bar.top + 1 && r.top < bar.bottom };
    });
    if (!f) continue;
    answers++;
    if (f.covered) covered.push(f.id);
  }
  expect(answers).toBeGreaterThanOrEqual(15);
  expect(covered).toEqual([]);
});

test('every answer target is at least 44 by 44 px in all three views', { session: 'demo' }, async ({ app, screen, browser }) => {
  await startQuestionnaire({ app, screen });
  for (const view of VIEWS) {
    await screen.getByRole('radio', view).check();
    await expect(screen.getByRole('radio', view)).toBeChecked();
    // One at a time buttons, or the label around each radio / checkbox (the label is the target).
    const targets = await browser.evaluate(() => [...document.querySelectorAll<HTMLElement>('.quick__answers button, #area-form input[type=radio], #area-form input[type=checkbox]')]
      .map((e) => e.closest<HTMLElement>('label, button') ?? e)
      .filter((e) => e.getClientRects().length)
      .map((e) => { const r = e.getBoundingClientRect(); return { name: e.innerText.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }));
    expect(targets.length, view).toBeGreaterThanOrEqual(2);
    expect(targets.filter((t) => t.w < 44 || t.h < 44), view).toEqual([]);
  }
});

test('report and roadmap fit the screen; each Start here step row is one tap target', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  // The label around each checkbox is the target: 44 px on phones (48 px rows), WCAG 2.2 AA's 24 px elsewhere.
  const results = await browser.evaluate(() => {
    const min = innerWidth > 599 ? 24 : 44;
    const rows = [...document.querySelectorAll<HTMLElement>('#focus-body input[type=checkbox]')].map((e) => (e.closest('label') ?? e).getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      rows: rows.length,
      small: rows.filter((r) => r.height < min || r.width < min).map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
    };
  });
  expect(results.rows).toBeGreaterThan(0);
  expect(results).toMatchObject({ overflow: 0, small: [] });
  await app.open(`/plan/?id=${ID}`);
  await expect(screen.getByRole('heading', /roadmap$/, { level: 1 })).toBeVisible({ timeout: 15_000 });
  expect(await browser.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('phone: the Start here link on the report lands the section below the sticky bar', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  test.skip((await browser.evaluate(() => innerWidth)) > PHONE_MAX, 'phone layout only');
  await screen.getByRole('link', 'Start here').tap();
  const landed = await browser.evaluate(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 800); // smooth scroll settles
    await promise;
    const h = document.querySelector('#focus-title')!.getBoundingClientRect();
    const bar = document.querySelector('.toc__jump')!.closest<HTMLElement>('nav, .toc')!.getBoundingClientRect();
    return { focused: document.activeElement?.id, headingTop: Math.round(h.top), barBottom: Math.round(bar.bottom), vh: innerHeight };
  });
  expect(landed.focused).toBe('focus-title');
  expect(landed.headingTop).toBeGreaterThanOrEqual(landed.barBottom);
  expect(landed.headingTop).toBeLessThan(landed.vh / 2);
});
