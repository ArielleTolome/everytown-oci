import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// v1.8 phone bug bash (p-roadmap, owner check): finishing a week moved focus to the next week, but the "Week N done!
// +35 points" line stayed above the week list, off screen. It now sits at the top of the week that opens.
// The tick is answered in the page (the server's roadmap with the open week marked done), so the shared roadmap is unchanged.
test('the week-done message is on screen after the last step of a week', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/plan/?id=${ID}`);
  await expect(screen.getByRole('heading', /roadmap$/, { level: 1 })).toBeVisible({ timeout: 15_000 });
  const week = await browser.evaluate(() => {
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
      Object.assign(r, { current_week: next ? next.n : null, celebrate: { weeks: [w.n], opened: next ? [next.n] : [], points: 35, badges: [] } });
      return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const box = document.querySelector<HTMLInputElement>('.rm-week--open input[data-task]:not(:checked)')!;
    box.scrollIntoView({ block: 'center' });
    box.click();
    return box.dataset.week;
  });
  await expect(screen.getByText(new RegExp(`^Week ${week} done! \\+35 points`))).toBeVisible();
  const cheer = await browser.evaluate(() => {
    const r = document.querySelector('#rm-cheer')!.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
  });
  expect(cheer.top).toBeGreaterThanOrEqual(0);
  expect(cheer.bottom).toBeLessThanOrEqual(cheer.vh);
});
