import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// A report in the shared demo database (synthetic sample Riverbend); set OCI_REPORT_ID for another deployment.
const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// Roadmap weeks 1-2 are Start here priority 1's four steps (features/milestones.py build_roadmap).
// Regression for #3: the report's Start here checkboxes read and write the roadmap (no second, local-only tracker).
test('Start here shows the steps already ticked on the roadmap', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/results/?id=${ID}`);
  // Week 1 = the first two steps of priority 1; marking them done is idempotent.
  await browser.evaluate(async (id: string) => {
    for (const task of ['w1-1', 'w1-2']) {
      const body = JSON.stringify({ done: true });
      // CloudFront's Lambda origin access control needs the body's SHA-256, as frontend/src/lib/api.ts sends it.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const res = await fetch(`/api/assessments/${id}/roadmap/tasks/${task}`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-amz-content-sha256': sha }, body,
      });
      if (!res.ok) throw new Error(`${task}: ${res.status}`);
    }
  }, ID);
  await browser.reload();
  // The roadmap teaser on the same report loads the server progress.
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByRole('checkbox', /^List every funding source/)).toBeChecked();
  await expect(screen.getByRole('checkbox', /^Mark each source as confirmed/)).toBeChecked();
});
