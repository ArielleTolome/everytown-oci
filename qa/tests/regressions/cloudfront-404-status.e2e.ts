import { test, expect } from 'e2e';

// Regression for #9 against the deployed site (read-only GET); run with --tag live.
test('the live site answers an unknown path with HTTP 404', { tags: ['live'] }, async () => {
  const res = await fetch(`${process.env.LIVE_URL ?? 'https://d2mi2h3eu8y69s.cloudfront.net'}/staff/reports/`);
  expect(await res.text()).toContain('We could not find that page');
  expect(res.status).toBe(404);
});
