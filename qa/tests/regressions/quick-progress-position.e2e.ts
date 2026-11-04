import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// #26: in One at a time the area line and bar follow the card on screen ("Question N of M"): a multiple-choice question
// is one card (its answer used to add 5 at once), Previous lowers both (they never went down), and on phones the bar
// gets most of the row (it was about 140 px of 390). Read-only except a local questionnaire draft.
test('One at a time progress follows the card, also back with Previous', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Progress Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await screen.getByRole('button', 'One at a time').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();

  const where = () => browser.evaluate(() => {
    const bar = document.querySelector<HTMLProgressElement>('#area-progress')!;
    const m = document.querySelector<HTMLElement>('#quick-count')!.textContent!.match(/^Question (\d+) of (\d+) in Planning$/);
    return { n: m ? Number(m[1]) : -1, m: m ? Number(m[2]) : -1, value: bar.value, max: bar.max, width: bar.getBoundingClientRect().width, screen: innerWidth };
  });
  const press = (sel: string) => browser.evaluate((s: string) => document.querySelector<HTMLElement>(s)!.click(), sel);
  const at = async (n: number) => {
    await expect.poll(async () => (await where()).n).toBe(n);
    const w = await where();
    expect(w.value).toBe(n);
    expect(w.max).toBe(w.m);
  };

  await at(1);
  const first = await where();
  expect(first.m).toBeGreaterThan(5);
  expect(first.m).toBeLessThan(15); // the multiple-choice questions count as one card each
  if (first.screen < 600) expect(first.width).toBeGreaterThan(first.screen / 2);

  await press('#quick-card .quick__answers button'); // Yes
  await at(2);
  await expect(screen.getByRole('button', 'Looks right, continue')).toBeHidden();
  await press('#quick-card .quick__choice'); // one multiple-choice answer records several statements...
  await expect(screen.getByRole('button', 'Looks right, continue')).toBeVisible();
  await at(2);
  await screen.getByRole('button', 'Looks right, continue').tap(); // ...and moves on by one card
  await at(3);

  await screen.getByRole('button', 'Previous').tap();
  await at(2);
  await screen.getByRole('button', 'Previous').tap();
  await at(1);
  // The answered total stays in the bottom bar: one Yes plus the statements the multiple-choice answer recorded.
  const saved = await browser.evaluate(() => document.querySelector('.q-bar__short')!.textContent!);
  expect(Number(saved.match(/^Saved: (\d+) of 15$/)?.[1])).toBeGreaterThanOrEqual(3);
});
