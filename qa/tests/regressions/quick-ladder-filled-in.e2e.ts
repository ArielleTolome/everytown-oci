import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// #29: after a multiple-choice question, "Based on your choice, we recorded:" listed a plain "No" and a "Change to Yes"
// button, which read like defaults nobody chose. Now the step says the choice filled the answers in and shows each one as
// the questionnaire's own Yes / No pair, already selected and flippable. Read-only except a local questionnaire draft.
test('answers filled in from a multiple-choice question are selected Yes / No pairs that flip', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Filled In Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await screen.getByRole('button', 'One at a time').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  // Yes on statements until the first multiple-choice question, then its first choice.
  await expect.poll(() => browser.evaluate(() => {
    const c = document.querySelector<HTMLElement>('#quick-card :is(.quick__choice, .quick__answers button)')!;
    if (c.matches('.quick__choice')) { c.click(); return true; }
    c.click();
    return false;
  }), { timeout: 15_000 }).toBe(true);
  await expect(screen.getByRole('heading', 'Your choice filled in these answers', { level: 2 })).toBeVisible();

  // Every statement has exactly one selected answer, and there is no separate "Change to" button.
  const items = () => browser.evaluate(() => [...document.querySelectorAll('#quick-card .ladder-item')].map((li) => ({
    id: li.querySelector<HTMLInputElement>('input[data-lad]')!.dataset.lad!,
    checked: [...li.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter((r) => r.checked).map((r) => r.value),
  })));
  const before = await items();
  expect(before.length).toBeGreaterThanOrEqual(2);
  for (const it of before) expect(it.checked).toHaveLength(1);
  await expect(screen.getByRole('button', /^Change to/)).toBeHidden();

  // Flip the first one with its own Yes / No pair: the draft saves the new answer.
  const { id, checked: [was] } = before[0];
  const flip = was === 'yes' ? 'No' : 'Yes';
  await browser.evaluate(({ id, v }) => document.querySelector<HTMLInputElement>(`input[data-lad="${id}"][value="${v}"]`)!.click(), { id, v: flip.toLowerCase() });
  await expect.poll(() => browser.evaluate((q: string) => JSON.parse(localStorage.getItem('oci-draft')!).answers[q], id)).toBe(flip.toLowerCase());
  expect((await items())[0].checked).toEqual([flip.toLowerCase()]);
  await expect(screen.getByRole('button', 'Looks right, continue')).toBeVisible();
  await browser.evaluate(() => { localStorage.removeItem('oci-draft'); localStorage.removeItem('oci-draft-sync'); });
});
