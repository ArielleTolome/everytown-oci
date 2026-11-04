import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Regression for #4: a finished area reads Completed in the area nav, also when it is the current area.
test('a finished area is not labelled In progress in the area nav', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Area Nav Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('radio', "Checklist: tick what's true").check();
  await screen.getByRole('button', "Done: everything I didn't tick is a No").tap();
  await browser.reload(); // what a revisit renders
  await expect(screen.getByText('Planning is done')).toBeVisible();
  const planning = screen.getByRole('navigation', 'Capacity areas').getByRole('listitem').first();
  await expect(planning).toContainText('1. Planning');
  await expect(planning).toContainText('Completed', { ignoreCase: true });
});
