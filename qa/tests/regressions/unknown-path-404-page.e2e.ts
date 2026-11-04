import { test, expect } from 'e2e';

// Regression for #8: serve.py answers unknown paths with frontend/dist/404.html and status 404.
test('an unknown path in the container shows the app not-found page', { session: 'demo' }, async ({ app, screen }) => {
  await app.open('/staff/reports/');
  await expect(screen.getByRole('heading', 'We could not find that page')).toBeVisible();
});
