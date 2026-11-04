import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8.1 #10: in One at a time on a phone, every card of an area (statements, the multiple-choice questions, their
// "Based on your choice" step and the area-complete card) shows its heading and first answer above the sticky bar on the
// first screen. Walks Planning with Yes and the first choice. Read-only except a local questionnaire draft.
test('phone: every Planning card shows its first answer above the sticky bar', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  test.skip((await browser.evaluate(() => innerWidth)) > 599, 'phone layout only');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Organization name').fill('QA Phone Cards Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('radio', 'One at a time')).toBeChecked();
  const under: string[] = [];
  let cards = 0;
  for (; cards < 30; cards++) {
    const card = await browser.evaluate(() => {
      scrollTo(0, 0);
      const q = (s: string) => document.querySelector<HTMLElement>(`#quick-card ${s}`);
      const heading = q('#quick-focus')!;
      const answer = q('.quick__answers') ?? q('.quick__choice') ?? q('.ladder-item__flip') ?? q('#quick-next')!;
      const bar = document.querySelector('#q-bar')!.getBoundingClientRect().top;
      const over = Math.max(heading.getBoundingClientRect().bottom, answer.getBoundingClientRect().bottom) - bar;
      return { text: heading.innerText.slice(0, 40), done: !!q('.quick-done'), over: Math.round(over) };
    });
    if (card.over > 0) under.push(`${card.text}: ${card.over} px under the bar`);
    if (card.done) break;
    await browser.evaluate(() => document.querySelector<HTMLElement>('#quick-card :is(.quick__answers button, .quick__choice, #quick-continue)')!.click());
    await expect.poll(() => browser.evaluate(() => document.querySelector<HTMLElement>('#quick-focus')?.innerText.slice(0, 40))).not.toBe(card.text);
  }
  expect(cards).toBeGreaterThanOrEqual(11);
  expect(under).toEqual([]);
});
