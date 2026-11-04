import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// #38 (v1.10 user test): the roadmap opens on all 12 weeks at a glance, with points, level and badges up top and no
// "0 of 43 steps done" count; picking a week on the timeline shows that week (a locked week says when it opens).
test('the roadmap shows a 12-week timeline and badges first; picking a week shows it', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/plan/?id=${ID}`);
  await expect(screen.getByRole('heading', /roadmap$/, { level: 1 })).toBeVisible({ timeout: 15_000 });
  const page = await browser.evaluate(() => {
    const picks = [...document.querySelectorAll<HTMLButtonElement>('#rm-timeline button[data-pick]')];
    const current = picks.filter((b) => b.getAttribute('aria-current') === 'step');
    const locked = picks.find((b) => b.closest('li')!.dataset.state === 'locked');
    return {
      weeks: picks.length,
      current: current.map((b) => ({ thisWeek: b.textContent!.includes('This week'), open: b.getAttribute('aria-expanded') })),
      locked: locked?.dataset.pick ?? null,
      counts: /\d+ of \d+ steps done|\d+%/.test(document.querySelector('.rm-summary')!.textContent!) || !!document.querySelector('#plan-root [role="progressbar"]'),
      medals: document.querySelectorAll('.rm-summary .rm-medal').length,
      badgesBeforeWeeks: !!(document.querySelector('.rm-medals')!.compareDocumentPosition(document.querySelector('#rm-timeline')!) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(page).toMatchObject({ weeks: 12, current: [{ thisWeek: true, open: 'true' }], counts: false, medals: 7, badgesBeforeWeeks: true });
  await expect(screen.getByText(/^Next badge:/)).toBeVisible();
  test.skip(!page.locked, 'no locked week left on this roadmap');
  await screen.getByRole('button', new RegExp(`^Week ${page.locked}\\b`)).tap();
  await expect(screen.getByRole('heading', new RegExp(`^Week ${page.locked}:`), { level: 3 })).toBeVisible();
  await expect(screen.getByText(/^Coming up\. Opens on /)).toBeVisible();
  expect(await browser.evaluate((n: string) => ({
    focused: document.activeElement?.id,
    open: [...document.querySelectorAll<HTMLElement>('button[aria-expanded="true"]')].map((b) => b.dataset.pick),
  }), page.locked!)).toEqual({ focused: `week-${page.locked}-title`, open: [page.locked] });
});

// #38: finishing a week's last step pops up a badge dialog (focus moves in, Escape closes it, focus returns to the
// week that opens), and only the first time that week is finished. The ticks are answered in the page (the server's
// roadmap with the open week marked done, like the server's own `celebrate`), so the shared roadmap is unchanged.
test('finishing a week shows the badge pop-up once', { session: 'staff' }, async ({ app, screen, browser }) => {
  await browser.addInitScript((id: string) => {
    localStorage.removeItem(`oci-roadmap-badge-${id}`);
    const real = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method !== 'POST' || !url.includes('/roadmap/tasks/')) return real(input, init);
      const r = await (await real(url.replace(/\/tasks\/.*$/, ''), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })).json();
      const w = r.weeks.find((x: { state: string }) => x.state === 'open');
      const next = r.weeks.find((x: { n: number }) => x.n === w.n + 1);
      Object.assign(w, { state: 'done', done_count: w.task_count });
      (w.tasks ?? []).forEach((t: { done: boolean }) => { t.done = true; });
      if (next) next.state = 'open';
      Object.assign(r, { current_week: next ? next.n : null, points: r.points + 35, celebrate: { weeks: [w.n], opened: next ? [next.n] : [], points: 35, badges: [] } });
      return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  }, ID);
  await app.open(`/plan/?id=${ID}`);
  await expect(screen.getByRole('heading', /roadmap$/, { level: 1 })).toBeVisible({ timeout: 15_000 });
  const tick = () => browser.evaluate(() => {
    const box = document.querySelector<HTMLInputElement>('.rm-week--open input[data-task]:not(:checked)')!;
    box.click();
    return box.dataset.week!;
  });
  const week = Number(await tick());
  const dialog = screen.getByRole('dialog', `Week ${week} done`);
  await expect(dialog).toBeVisible();
  expect(await browser.evaluate(() => ({
    points: document.querySelector('dialog[open]')!.textContent!.includes('+35 points.'),
    focusInside: !!document.activeElement?.closest('dialog[open]'),
  }))).toEqual({ points: true, focusInside: true });
  await browser.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(await browser.evaluate(() => document.activeElement?.id)).toBe(`week-${week + 1}-title`);
  // The visible "Week N done!" line stays (read it, not the hidden live region with the same words).
  const cheer = () => browser.evaluate(() => document.querySelector('#rm-cheer')?.textContent?.trim() ?? '');
  expect(await cheer()).toContain(`Week ${week} done! +35 points.`);
  // The server says the same week is done again (as after an untick and a tick): words only, no second pop-up.
  await browser.evaluate(() => { document.querySelector('#rm-cheer')!.textContent = ''; });
  await tick();
  await expect.poll(cheer).toContain(`Week ${week} done! +35 points.`);
  expect(await browser.evaluate(() => document.querySelectorAll('dialog.rm-pop').length)).toBe(0);
});

// #38: the report's roadmap card says in one line what this week is; the "0 of 43 steps done" count and its bar are gone.
test('the report roadmap card names this week without a step count', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  expect(await browser.evaluate(() => {
    const card = document.querySelector('[data-rm-teaser]')!;
    return { thisWeek: /This week: \S/.test(card.textContent!), count: /steps done/.test(card.textContent!), bar: !!card.querySelector('[role="progressbar"]') };
  })).toEqual({ thisWeek: true, count: false, bar: false });
});
