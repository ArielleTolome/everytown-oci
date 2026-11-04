import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8.1 #14: with the questions in Español, the questionnaire's own controls (bar, area nav, save tools) follow them,
// and switching back restores the English names. Read-only except a local questionnaire draft.
test('with questions in Español the bar, area nav and save button read in Spanish', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Organization name').fill('QA Spanish Bar Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('radio', 'Español').check();
  await expect(screen.getByRole('button', /^Siguiente\b.*Recaudación de fondos/)).toBeVisible();
  await expect(screen.getByRole('button', 'Guardar y terminar después')).toBeVisible();
  await expect(screen.getByRole('navigation', 'Áreas de capacidad')).toBeVisible();
  await expect(screen.getByRole('heading', 'Planeación', { level: 1 })).toBeVisible();
  await screen.getByRole('radio', 'English').check();
  await expect(screen.getByRole('button', 'Save and finish later')).toBeVisible();
  await expect(screen.getByRole('navigation', 'Capacity areas')).toBeVisible();
});
