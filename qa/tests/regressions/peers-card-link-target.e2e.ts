import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #18: report links in Peers request cards are at least 24px tall (WCAG 2.5.8).
test('Peers request card links meet the 24px target size', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open('/staff/#peers');
  await expect(screen.getByRole('heading', 'Asked to be connected')).toBeVisible({ timeout: 15_000 });
  const heights = await browser.evaluate(() => [...document.querySelectorAll('#panel-peers .cohort h4 > a')].map((a) => a.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(24);
});
