import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// #27: in One at a time, Previous goes back through the cards in the order they were shown (it stepped back one place in
// the full list), and Next after Previous walks forward through them again (it jumped to the next unanswered card).
// #24: an answered card moves on with "Next" (was "Keep my answer"). Read-only except a local questionnaire draft.
test('Previous retraces the cards seen in Planning and Next walks them again', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA History Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('radio', 'One at a time')).toBeChecked();

  // A card's heading plus the first "we recorded" statement (both multiple-choice questions share the heading).
  const card = () => browser.evaluate(() => {
    const c = document.querySelector('#quick-card')!;
    const kind = c.querySelector('.quick__choices') ? 'choose' : c.querySelector('.ladder-list') ? 'confirm' : 'stmt';
    return { kind, text: `${c.querySelector('#quick-focus')?.textContent?.trim()} | ${c.querySelector('.ladder-item__text')?.textContent?.trim() ?? ''}`.slice(0, 120) };
  });
  const next = async (click: () => Promise<unknown>) => {
    const before = (await card()).text;
    await click();
    await expect.poll(async () => (await card()).text).not.toBe(before);
  };
  const press = (sel: string) => () => browser.evaluate((s: string) => document.querySelector<HTMLElement>(s)!.click(), sel);

  // Forward through 7 card steps: Yes on statements, the first choice on the two multiple-choice questions, then
  // "Looks right, continue" on their "Based on your choice" steps.
  const seen = [await card()];
  for (let i = 0; i < 6; i++) {
    await next(press('#quick-card :is(.quick__answers button, .quick__choice, #quick-continue)'));
    seen.push(await card());
  }
  expect(seen.filter((c) => c.kind === 'confirm')).toHaveLength(2);
  expect(seen.at(-1)!.kind).toBe('stmt');
  // Going back, a multiple-choice question shows its "Based on your choice" step, the step that was shown last.
  const shown = seen.filter((c) => c.kind !== 'choose').map((c) => c.text);

  // Previous, card by card, in reverse; nothing to go back to on the first card.
  for (let i = shown.length - 2; i >= 0; i--) {
    await next(press('#quick-prev'));
    expect((await card()).text).toBe(shown[i]);
  }
  expect(await browser.evaluate(() => !!document.querySelector('#quick-prev'))).toBe(false);

  // Forward again through the same cards: Next on an answered statement, "Looks right, continue" on a recorded choice.
  for (let i = 1; i < shown.length; i++) {
    const { kind } = await card();
    if (kind === 'stmt') await next(() => screen.getByRole('button', /^(Next|Siguiente)$/).tap());
    else await next(() => screen.getByRole('button', 'Looks right, continue').tap());
    expect((await card()).text).toBe(shown[i]);
  }
});
