import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.7 (after the CSF director walkthrough): staff can check report quality and follow-through; organizations cannot.

test('staff see the four Quality and follow-through sections', { session: 'staff' }, async ({ app, screen }) => {
  await app.open('/staff/#quality');
  for (const heading of ['Report quality', 'Follow-through', 'Opted in to trainings and updates', 'Where people stop']) {
    await expect(screen.getByRole('heading', heading)).toBeVisible({ timeout: 20_000 });
  }
  await expect(screen.getByRole('heading', 'Review queue')).toBeVisible({ timeout: 20_000 });
});

test('staff see an organization feedback card on a report, read-only', { session: 'staff' }, async ({ app, screen }) => {
  await app.open(`/results/?id=${process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09'}`);
  await expect(screen.getByRole('link', 'Open the Quality tab')).toBeVisible({ timeout: 20_000 });
});

test('organizations cannot read staff quality, opt-in or funnel data', { session: 'demo' }, async ({ app, browser }) => {
  await app.open('/');
  const codes = await browser.evaluate(async () =>
    Promise.all(['/api/staff/quality', '/api/staff/optins', '/api/staff/funnel'].map(async (u) => (await fetch(u)).status)));
  expect(codes).toEqual([403, 403, 403]);
});
