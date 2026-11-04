import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression (reported by the team after the director demo): clicking an answer's label text focused <main>
// (tabindex -1), and the sticky-bar focus nudge then scrolled the page to the bottom on every other click.
test('focus landing on the page itself never scrolls the questionnaire', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Scroll Jump Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('radio', 'Yes / No for each').check();
  const moved = await browser.evaluate(async () => {
    document.querySelectorAll('#area-form fieldset')[2]?.scrollIntoView({ block: 'center' });
    (document.activeElement as HTMLElement | null)?.blur();
    const before = scrollY;
    document.querySelector<HTMLElement>('main')!.focus({ preventScroll: true }); // what a label click does
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 300);
    await promise;
    return Math.abs(scrollY - before);
  });
  expect(moved).toBeLessThan(50);
});
