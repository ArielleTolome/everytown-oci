import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #23: an organization can choose more than one state or territory, and its draft brings them all back.
// The draft stays on this device (no report, nothing saved on the server).
test('the start page keeps several states or territories in the draft', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await browser.evaluate(() => { localStorage.removeItem('oci-draft'); localStorage.removeItem('oci-draft-sync'); });
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Two States Org');
  // Phones fold the optional details; wider screens show them open.
  if (await browser.evaluate(() => innerWidth < 600)) await screen.getByText(/^Add details \(optional\)/).tap();
  for (const state of ['New Jersey', 'New York']) {
    await screen.getByLabel('Add a state or territory').selectOption(state);
    await screen.getByRole('button', /^Add$/).tap();
    await expect(screen.getByRole('button', `Remove ${state}`)).toBeVisible();
  }
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible({ timeout: 15_000 });

  await app.open('/');
  await expect(screen.getByRole('button', 'Remove New Jersey')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByRole('button', 'Remove New York')).toBeVisible();
  expect(await browser.evaluate(() => [...document.querySelectorAll('#state-list li > span')].map((s) => s.textContent)))
    .toEqual(['New Jersey', 'New York']);
  await browser.evaluate(() => { localStorage.removeItem('oci-draft'); localStorage.removeItem('oci-draft-sync'); });
});
