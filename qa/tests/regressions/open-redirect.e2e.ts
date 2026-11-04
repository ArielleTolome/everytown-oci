import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #1: browsers read "/\host" as "//host", so ?next= is resolved and must stay on this origin.
test('sign-in never redirects to another site through ?next=', async ({ app, screen, browser }) => {
  await app.open('/login/?next=/%5Cexample.com/');
  await screen.getByLabel('Username').fill('demo');
  await screen.getByLabel('Password').fill('demo');
  await screen.getByRole('button', 'Sign in').tap();
  await expect(screen.getByRole('heading', 'Tell us about your organization')).toBeVisible();
  await expect(browser).toHaveURL('/');
});
