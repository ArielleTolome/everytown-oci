import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The exact on-stage path from docs/pitch/demo-script.md. Run it on judging morning:
//   APP_URL=https://d2mi2h3eu8y69s.cloudfront.net npm run test:demo
// It creates one Southside sample report (about $0.11, counts against the hourly cap), so it is tagged `demo`
// and left out of the normal and live runs.

test('leader: one-click sample, report ready, PDF', { session: 'demo', tags: ['demo'] }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByText('Try a made-up sample organization').tap();
  await screen.getByRole('button', /Southside Youth Peace Collective/).tap();
  await expect(browser).toHaveURL(/\/results\/\?id=/, { timeout: 30_000 });
  // The script's promise: the AI report in about 40 seconds; 120 s leaves room for a cold start.
  await expect(screen.getByText('Your report is ready')).toBeVisible({ timeout: 120_000 });
  await expect(screen.getByRole('heading', /Start here/)).toBeVisible();
  const pdf = await browser.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id');
    const res = await fetch(`/api/assessments/${id}/report.pdf`);
    return [res.status, res.headers.get('content-type')];
  });
  expect(pdf).toEqual([200, 'application/pdf']);
});

test('staff: training needs, Ask the data, Peers, CloudWatch trace link', { session: 'staff', tags: ['demo'] }, async ({ app, screen }) => {
  await app.open('/staff/');
  await expect(screen.getByRole('heading', /Which organizations need which training/)).toBeVisible({ timeout: 15_000 });
  await screen.getByRole('tab', 'Ask the data').tap();
  await screen.getByRole('button', 'Which organizations need fundraising training?').tap();
  // Answers can arrive before a "Looking at the data" check would run, so wait for the finished state itself.
  await expect(screen.getByText('Answer ready.')).toBeVisible({ timeout: 90_000 });
  await screen.getByRole('tab', 'Peers').tap();
  await expect(screen.getByRole('heading', 'Peer groups and requests to connect')).toBeVisible({ timeout: 15_000 });
  await screen.getByRole('tab', 'Training needs').tap();
  await screen.getByRole('button', /Southside Youth Peace Collective/).first().tap();
  await expect(screen.getByRole('link', /View AI trace in CloudWatch/)).toBeVisible({ timeout: 15_000 });
});
