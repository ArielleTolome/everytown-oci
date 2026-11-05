import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// #28: "How would you like to answer?" was a switcher above every area. Now a new draft first shows one statement in
// the three answer styles as choice cards; the pick sticks (no switcher in the question area, kept after a reload) and
// "Change how I answer" reopens the same choice. Read-only except a local questionnaire draft.
const view = () => document.querySelector<HTMLElement>('#q-root')!.dataset.view;

test('the answer style is picked once from three sample cards and sticks', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Answer Style Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'How would you like to answer?', { level: 1 })).toBeVisible();
  // One real statement, the same in all three previews.
  const previews = await browser.evaluate(() => [...document.querySelectorAll('.view-card .vp__stmt')].map((s) => s.textContent));
  expect(previews).toHaveLength(3);
  expect(new Set(previews).size).toBe(1);
  // Each card shows its estimated time; for the four default areas (72 statements) the totals agree with the start
  // page's 11 minutes, and the styles with fewer taps say what they save against Yes / No for each.
  expect(await browser.evaluate(() => [...document.querySelectorAll('.view-card__time')].map((e) => (e as HTMLElement).innerText.trim())))
    .toEqual(['About 11 minutes · saves under a minute', 'About 11 minutes', 'About 10 minutes · saves about 1 minute']);

  await screen.getByRole('button', 'Yes / No for each').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  expect(await browser.evaluate(view)).toBe('yn');
  expect(await browser.evaluate(() => document.querySelectorAll('input[name="q-view"]').length)).toBe(0);
  await browser.reload();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  expect(await browser.evaluate(view)).toBe('yn');

  await screen.getByRole('button', 'Change how I answer').tap();
  await expect(screen.getByRole('heading', 'How would you like to answer?', { level: 1 })).toBeVisible();
  expect(await browser.evaluate(() => document.querySelector<HTMLElement>('.view-card.is-current')?.dataset.pick)).toBe('yn');
  await screen.getByRole('button', "Checklist: tick what's true").tap();
  await expect(screen.getByRole('button', "Done: everything I didn't tick is a No")).toBeVisible();
  expect(await browser.evaluate(() => JSON.parse(localStorage.getItem('oci-draft')!).view)).toBe('check');
  await browser.evaluate(() => { localStorage.removeItem('oci-draft'); localStorage.removeItem('oci-draft-sync'); });
});
