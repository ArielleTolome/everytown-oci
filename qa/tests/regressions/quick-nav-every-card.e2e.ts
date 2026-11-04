import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// #30: "Some have Next, some don't": Next showed only once a card was answered, and Previous not on the first card.
// Now every question card in One at a time has Previous on the left and Next (or "Looks right, continue") on the right,
// in the same place; one with nowhere to go yet is unavailable and says why when pressed. Walks Planning.
// Read-only except a local questionnaire draft.
test('every One at a time question card has Previous and Next in the same place', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Same Next Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await screen.getByRole('button', 'One at a time').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();

  const cards: { kind: string; prevLeft: number; nextRight: number; row: boolean; prevOff: boolean; nextOff: boolean }[] = [];
  for (let i = 0; i < 30; i++) {
    const c = await browser.evaluate(async () => {
      const card = document.querySelector<HTMLElement>('#quick-card')!;
      if (card.querySelector('.quick-done')) return null;
      await Promise.all(card.getAnimations().map((a) => a.finished)); // the card slides back in after each answer
      const kind = card.querySelector('.quick__choices') ? 'choose' : card.querySelector('.ladder-list') ? 'confirm' : 'stmt';
      const prev = card.querySelector<HTMLElement>('#quick-prev')!, next = card.querySelector<HTMLElement>('#quick-fwd, #quick-continue')!;
      const p = prev.getBoundingClientRect(), n = next.getBoundingClientRect();
      return { kind, prevLeft: Math.round(p.left), nextRight: Math.round(n.right), row: Math.abs(p.top + p.bottom - n.top - n.bottom) < 4,
        prevOff: prev.getAttribute('aria-disabled') === 'true', nextOff: next.getAttribute('aria-disabled') === 'true' };
    });
    if (!c) break;
    cards.push(c);
    if (c.nextOff) {
      // An unanswered card: Next stays put; pressing it explains instead of moving on.
      const why = await browser.evaluate(() => {
        const t = document.querySelector('#quick-focus')!.textContent;
        document.querySelector<HTMLElement>('#quick-fwd')!.click();
        const w = document.querySelector<HTMLElement>('#quick-fwd-why')!;
        return { same: document.querySelector('#quick-focus')!.textContent === t, shown: !w.hidden, text: w.textContent!.trim() };
      });
      expect(why).toMatchObject({ same: true, shown: true });
      expect(why.text).toMatch(/^Choose (Yes or No|one answer) to go on\.$/);
    }
    const before = await browser.evaluate(() => document.querySelector('#quick-focus')!.textContent);
    await browser.evaluate(() => document.querySelector<HTMLElement>('#quick-card :is(.quick__answers button, .quick__choice, #quick-continue)')!.click());
    await expect.poll(() => browser.evaluate(() => document.querySelector('#quick-focus')?.textContent)).not.toBe(before);
  }
  expect(cards.length).toBeGreaterThanOrEqual(11);
  expect(cards.map((c) => c.kind)).toContain('confirm');
  expect(cards.filter((c) => !c.row)).toEqual([]);
  expect(new Set(cards.map((c) => c.prevLeft)).size).toBe(1);
  expect(new Set(cards.map((c) => c.nextRight)).size).toBe(1);
  // Only the first card has nowhere to go back to; every new card starts unanswered except a "filled in" step.
  expect(cards.map((c) => c.prevOff)).toEqual(cards.map((_, i) => i === 0));
  expect(cards.filter((c) => c.kind !== 'confirm').every((c) => c.nextOff)).toBe(true);
  await browser.evaluate(() => { localStorage.removeItem('oci-draft'); localStorage.removeItem('oci-draft-sync'); });
});
