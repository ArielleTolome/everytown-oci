import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// Desktop bug (Nov 5): while a report is still being written, "On this page" has fewer than 2 sections and is hidden,
// and from 1100px the content dropped into the list's 13rem column (208px wide). The report is shown as running by
// changing the API answer in the page only, so the shared report is unchanged.
test('a report still being written uses the full reading width on a computer', { session: 'staff' }, async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    const real = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await real(input, init);
      if (!/\/assessments\/[0-9a-f-]{36}$/.test(String(input))) return res;
      const d = await res.json();
      Object.assign(d, { status: 'running', report: null,
        steps: [{ key: 'read', label: 'Reading your answers', state: 'done' }, { key: 'write', label: 'Writing your recommendations', state: 'running' }] });
      return new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  });
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('heading', 'Building your recommendations')).toBeVisible({ timeout: 15_000 });
  const m = await browser.evaluate(() => ({
    main: document.querySelector('#report-main')!.getBoundingClientRect().width,
    room: innerWidth,
    hidden: (document.querySelector('#toc') as HTMLElement).hidden,
  }));
  expect(m.hidden).toBe(true);
  // At least the 860px reading width, or the whole screen less its padding on a phone.
  expect(m.main).toBeGreaterThanOrEqual(Math.min(860, m.room - 40));
});

test('a finished report keeps "On this page" beside the content on a computer', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  const m = await browser.evaluate(() => {
    const toc = document.querySelector('#toc')!.getBoundingClientRect(), main = document.querySelector('#report-main')!.getBoundingClientRect();
    return { wide: innerWidth >= 1100, side: toc.right <= main.left, main: main.width };
  });
  if (m.wide) expect(m.side).toBe(true);
  expect(m.main).toBeGreaterThan(300);
});
