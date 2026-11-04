import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8 phone bug bash (p-start). Read-only: nothing is submitted.

test('a fixed field loses its red error bar after one edit', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByText("Enter your organization's name").first()).toBeVisible();
  // One input event (paste or autofill): the error summary's item used to catch the fix instead of the field.
  await screen.getByLabel('Organization name').fill('QA Phone Error Bar Org');
  expect(await browser.evaluate(() => document.querySelectorAll('.field--error').length)).toBe(0);
});

test('the intro never says it takes 0 minutes', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await expect(screen.getByText(/statements, about \d+ minutes?$/).first()).toBeVisible();
  await browser.evaluate(() => document.querySelectorAll<HTMLInputElement>('input[name=domains]:checked').forEach((b) => b.click()));
  await expect(screen.getByText(/It takes about \d+ to \d+ minutes each for the areas you pick below/)).toBeVisible();
});
