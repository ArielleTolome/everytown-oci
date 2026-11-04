import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8 phone bug bash (p-resume): on a phone the resume link showed about 10 characters in a one-line field.
// Makes one server-side draft named "QA Phone ..." (no report); delete with the QA Phone cleanup.
test('the whole resume link is readable on a phone', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  if (await browser.evaluate(() => innerWidth >= 600)) return; // wider screens keep the one-line field
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Organization name').fill('QA Phone Resume Link Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('button', 'Save and finish later').tap();
  await expect(screen.getByLabel('Your resume link')).toBeVisible({ timeout: 15_000 });
  const cut = await browser.evaluate(() => {
    const el = document.getElementById('dt-save-link') as HTMLTextAreaElement;
    return el.scrollWidth - el.clientWidth + el.scrollHeight - el.clientHeight;
  });
  expect(cut).toBe(0);
});
