import { test, expect } from 'e2e';

test('an organization leader lands on the organization form', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', 'Tell us about your organization')).toBeVisible();
});

test('Everytown staff land on the network dashboard', { session: 'staff' }, async ({ app, screen }) => {
  await app.open('/staff/');
  await expect(screen.getByRole('heading', 'Network capacity dashboard')).toBeVisible();
});
