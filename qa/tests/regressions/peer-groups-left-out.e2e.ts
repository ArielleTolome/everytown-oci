import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #16: Peers says how many organizations are in no group, and never blames missing details when they shared them.
test('Peers explains organizations left out of peer groups under a filter', { session: 'staff' }, async ({ app, screen }) => {
  await app.open('/staff/#peers');
  await expect(screen.getByRole('heading', 'Peer groups and requests to connect')).toBeVisible({ timeout: 15_000 });
  await screen.getByLabel('State').selectOption('New York');
  await expect(screen.getByText(/organizations match New York/)).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByText(/A group needs at least 2 organizations\. \d+ organizations? (is|are) not in a group/)).toBeVisible();
  await expect(screen.getByText('Not enough organizations have shared their program model and size yet.')).not.toBeVisible();
});
