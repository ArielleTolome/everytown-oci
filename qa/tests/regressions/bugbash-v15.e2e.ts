import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regressions for the v1.5 bug bash (confirmed findings fixed in v1.5.3). Read-only except a local draft.

test('One at a time controls read in Spanish when the questions do', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Spanish Controls Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await screen.getByRole('button', 'One at a time').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('radio', 'Español').check();
  await expect(screen.getByRole('button', /Sí/)).toBeVisible();
  await expect(screen.getByText(/Teclado: pulse S para Sí/)).toBeVisible();
});

test('a roadmap for an unknown report links to the start page, not to a missing report', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/plan/?id=00000000-0000-0000-0000-000000000000');
  await expect(screen.getByRole('heading', 'Report not found')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByRole('link', 'Go to the report')).not.toBeVisible();
});

test('the not-found page shows who is signed in', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/staff/reports/');
  await expect(screen.getByRole('heading', 'We could not find that page')).toBeVisible();
  await expect(screen.getByText('Signed in as demo')).toBeVisible({ timeout: 10_000 });
});
