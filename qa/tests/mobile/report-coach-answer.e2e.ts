import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// v1.8 phone bug bash (owner check): after "Ask" on a phone the answer was added above the tall question form, about a
// screen above the view, so nothing seemed to happen. The answer request is stubbed in the page: no AI cost, and the
// shared report's question log is unchanged.
test('a new coach answer is on screen after Ask', { session: 'staff' }, async ({ app, screen, browser }) => {
  // The question log is stubbed before the page loads too, so the test never depends on how many of the shared
  // report's 15 questions earlier runs and explorers used up.
  await browser.addInitScript(() => {
    const real = window.fetch;
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => !String(input).endsWith('/ask') ? real(input, init)
      : init?.method === 'POST' ? json({ answer: 'QA stub answer: list every funding source first.', gap_ids: [], resources: [], remaining: 5 })
      : json({ messages: [], remaining: 15 });
  });
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('heading', 'Ask about your report')).toBeVisible({ timeout: 15_000 });
  await browser.evaluate(() => {
    document.querySelector('#coach-form')!.closest('details')?.setAttribute('open', ''); // phones: "Ask a question"
  });
  await screen.getByLabel('Your question').fill('What is the first step this week?');
  // Ask from where a reader types: the question box in the middle of the screen.
  await browser.evaluate(() => {
    document.querySelector('#coach-question')!.scrollIntoView({ block: 'center' });
    document.querySelector<HTMLFormElement>('#coach-form')!.requestSubmit();
  });
  await expect(screen.getByText('QA stub answer: list every funding source first.')).toBeVisible();
  const top = await browser.evaluate(() => {
    const turns = document.querySelectorAll('.coach-turn');
    return Math.round(turns[turns.length - 1].getBoundingClientRect().top);
  });
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(await browser.evaluate(() => innerHeight));
});
