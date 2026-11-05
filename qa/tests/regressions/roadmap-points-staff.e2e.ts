import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// Nov 5 request: the roadmap shows the points at the top right of its title band (computer and phone), the same
// number as the points chip below it. Read-only.
test('the roadmap shows its points at the top right', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/plan/?id=${ID}`);
  await expect(screen.getByRole('heading', /roadmap$/, { level: 1 })).toBeVisible({ timeout: 15_000 });
  const m = await browser.evaluate(() => {
    const score = document.querySelector<HTMLElement>('.title-band .rm-score')!, band = document.querySelector('.title-band')!.getBoundingClientRect();
    const s = score.getBoundingClientRect(), title = document.querySelector('#plan-title')!.getBoundingClientRect();
    const chip = [...document.querySelectorAll('.rm-summary .rm-chip')].map((c) => c.textContent!).find((t) => /points?$/.test(t.trim()));
    return {
      top: s.top < title.top, right: Math.abs(band.right - s.right) < 2, beside: s.left >= title.right - 2,
      same: score.querySelector('.rm-score__num')!.textContent!.trim() === chip?.trim().replace(/ points?$/, ''),
    };
  });
  expect(m).toEqual({ top: true, right: true, beside: true, same: true });
});

// Staff see, per organization, where it is on its roadmap: the week it is on, its points and level, the same numbers
// its own roadmap page shows (milestones.progress on the stored task rows). Read-only.
test('staff follow-through shows each organization\'s week, points and level', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open('/staff/');
  await screen.getByRole('tab', 'Quality and follow-through').tap();
  await expect(screen.getByRole('heading', 'Follow-through')).toBeVisible({ timeout: 15_000 });
  const t = await browser.evaluate(() => {
    const table = document.querySelector('table:has(#sq-follow-table)')!;
    const head = [...table.querySelectorAll('thead th')].map((h) => h.textContent!.trim());
    const rows = [...table.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent!.trim()));
    const started = rows.filter((r) => r[1] !== 'Not started');
    return {
      head,
      weeks: started.every((r) => /^Week \d+ of 12$|^All weeks done$/.test(r[2])),
      points: started.every((r) => /^\d+$/.test(r[3]) && Number(r[3]) > 0),
      levels: started.every((r) => ['Getting started', 'Building', 'Growing', 'Leading'].includes(r[4])),
      any: started.length > 0,
    };
  });
  expect(t).toEqual({ head: ['Organization', 'Status', 'Now on', 'Points', 'Level', 'Weeks done', 'Steps done', 'Last step'], weeks: true, points: true, levels: true, any: true });
});
