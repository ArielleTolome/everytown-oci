import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8.1 bug bash #19: with the questions in Español, the Yes / No view's answer controls stayed English (Yes, No,
// Not answered yet) while One at a time said Sí / No. Read-only except a local questionnaire draft.
test('Yes / No answers follow the question language', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Spanish Answers Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await screen.getByRole('button', 'Yes / No for each').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('radio', 'Español').check();
  await expect(screen.getByRole('radio', 'Sí').first()).toBeVisible();
  await expect(screen.getByText('Sin responder todavía').first()).toBeVisible();
  await screen.getByRole('radio', 'English').check();
  await expect(screen.getByRole('radio', 'Yes').first()).toBeVisible();
  await expect(screen.getByText('Not answered yet').first()).toBeVisible();
});
