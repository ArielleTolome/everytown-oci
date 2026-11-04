import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #5: both pages use SECONDS_PER_STATEMENT from lib/draft.ts.
test('Planning time estimate matches between intake and questionnaire', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/');
  const card = screen.getByRole('listitem').filter({ hasText: 'About Planning' });
  const meta = (await card.getByText(/statements · About \d+ minutes?$/).textContent()) ?? '';
  const minutes = Number(/About (\d+) minute/.exec(meta)?.[1]);
  expect(minutes).toBeGreaterThan(0);
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Organization name').fill('QA Time Estimate Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await expect(screen.getByText(/left in Planning$/)).toHaveText(`About ${minutes} minutes left in Planning`);
});
