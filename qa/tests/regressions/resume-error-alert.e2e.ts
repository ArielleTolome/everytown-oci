import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8.1 bug bash #20: sending a wrong link with Enter (the phone's Go key) left focus in the field, so the error
// appeared without being announced. It must sit in an alert. Read-only.
test('a wrong resume link sent with Enter is announced', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/resume/');
  await screen.getByLabel('Your saved link').fill('/questionnaire/?d=QAfake123notarealtoken9999');
  await browser.keyboard.press('Enter');
  await expect(screen.getByText(/could not find that saved assessment/)).toBeVisible({ timeout: 15_000 });
  const announced = await browser.evaluate(() => {
    const err = document.getElementById('resume-link-error');
    return !!err?.closest('[role="alert"], [aria-live="assertive"], [aria-live="polite"]') && !!err.textContent?.trim();
  });
  expect(announced).toBe(true);
});
