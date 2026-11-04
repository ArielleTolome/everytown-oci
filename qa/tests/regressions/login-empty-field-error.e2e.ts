import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #17: the sign-in error names the empty field, and only that field is marked invalid.
test('sign-in with an empty username names it and leaves the filled password valid', async ({ app, screen, browser }) => {
  await app.open('/login/');
  await screen.getByLabel('Password').fill('wrongpass');
  await screen.getByRole('button', 'Sign in').tap();
  await expect(screen.getByText('Enter your username.', { exact: true })).toBeVisible();
  expect(await browser.evaluate(() => ['username', 'password'].map((id) => document.getElementById(id)!.getAttribute('aria-invalid')))).toEqual(['true', null]);
});
