import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #6: the same note as Gaps by area.
test('Most common gaps explains that an organization with two program models counts in both', { session: 'staff' }, async ({ app, screen }) => {
  await app.open('/staff/#common');
  await screen.getByText('By program model', { exact: true }).first().tap();
  await expect(screen.getByText(/^Street outreach: \d+ of \d+$/).first()).toBeVisible();
  await expect(screen.getByText('An organization with two program models counts in both groups.')).toBeVisible();
});
