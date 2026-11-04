import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8 phone bug bash (p-start). Read-only: nothing is submitted.

test('a fixed field loses its red error bar after one edit', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByText("Enter your organization's name").first()).toBeVisible();
  // One input event each (paste or autofill): the error summary's item used to catch the fix instead of the field.
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Phone Error Bar Org');
  expect(await browser.evaluate(() => document.querySelectorAll('.field--error').length)).toBe(0);
});

test('the job title and name are required to start', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Organization name').fill('QA Required Person Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByText('Enter your job title').first()).toBeVisible();
  await expect(screen.getByText('Enter your name').first()).toBeVisible();
  expect(await browser.evaluate(() => [location.pathname, document.querySelectorAll('[aria-invalid=true]').length]))
    .toEqual(['/', 2]);
  // Never folded away on a phone: both fields sit outside every disclosure.
  expect(await browser.evaluate(() => ['resp_title', 'resp_name'].filter((id) => document.getElementById(id)!.closest('details'))))
    .toEqual([]);
});

test('sent back from the questionnaire, the start page shows what is missing', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/?check=1');
  await expect(screen.getByText('Enter your job title').first()).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByText('Enter your name').first()).toBeVisible();
});

test('the intro never says it takes 0 minutes', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await expect(screen.getByText(/statements, about \d+ minutes?$/).first()).toBeVisible();
  await browser.evaluate(() => document.querySelectorAll<HTMLInputElement>('input[name=domains]:checked').forEach((b) => b.click()));
  await expect(screen.getByText(/It takes about \d+ to \d+ minutes each for the areas you pick below/)).toBeVisible();
});
