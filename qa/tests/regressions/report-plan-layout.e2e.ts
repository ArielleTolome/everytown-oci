import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// v1.10 user test: a first-time leader could not tell what came from her answers and what AI wrote.
// #32 no stage tracks or "Your results in detail" layer, each part says where it comes from; #33 no reading level;
// #34 "Summary about your organization"; #35 "What we learned about you" last; #36 roadmap above Start here, the two
// priorities side by side on wide screens, and only steps of open weeks, with one line saying when the next open.
// The page's own answers are edited in the page: roadmap weeks 3 and 4 locked (so the test never depends on today's
// date) and one research source (the shared report has none), so "What we learned about you" shows.
test('the plan layer reads summary, roadmap, Start here, and shows only open steps', { session: 'staff' }, async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    const real = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await real(input, init);
      const url = String(input).split('?')[0];
      if (init?.method === 'POST' || !/\/(roadmap|assessments\/[\w-]+)$/.test(url)) return res;
      const r = await res.json();
      if (url.endsWith('/roadmap')) {
        for (const w of r.weeks) {
          if (w.n === 3 || w.n === 4) Object.assign(w, { state: 'locked', unlocks_on: '2026-12-01', done_count: 0 });
          else if (w.n <= 2 && w.state === 'locked') w.state = 'open';
        }
      } else {
        r.research = { strength: 'some', sources: [{ kind: 'news', url: 'https://example.org/qa-story', title: 'QA news story', used: true }] };
      }
      return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  });
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByRole('heading', 'Summary about your organization')).toBeVisible();
  await expect(screen.getByText('Written by AI from your answers')).toBeVisible();
  await expect(screen.getByText('Picked from your answers. Steps written by AI.')).toBeVisible();
  await expect(screen.getByRole('heading', 'Start here: weeks 1 to 4 of your roadmap')).toBeVisible();
  await expect(screen.getByText(/^\d+ steps? opens? in week 3, on Tue, Dec 1 or sooner\.$/)).toBeVisible();
  const page = await browser.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('#focus-body .focus-card')].map((c) => ({
      top: Math.round(c.getBoundingClientRect().top), bottom: Math.round(c.getBoundingClientRect().bottom),
      shown: [...c.querySelectorAll('input[type=checkbox]')].filter((b) => b.getClientRects().length).length,
    }));
    return {
      tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.querySelector('.layer-tab__label')!.textContent),
      sections: [...document.querySelectorAll('#layer-plan h2[id]')].map((h) => h.id),
      gone: ['Where you are today', 'Your results in detail', 'Reading level', "What's true about you"].filter((t) => document.body.innerText.includes(t)),
      cards, wide: innerWidth >= 1100, overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(page.tabs).toEqual(['Your plan', 'Explore any area']);
  expect(page.gone).toEqual([]);
  expect(page.sections.slice(0, 4)).toEqual(['truth-title', 'roadmap-title', 'focus-title', 'coach-title']);
  expect(page.sections.at(-1)).toBe('learned-title');
  expect(page.overflow).toBe(0);
  expect(page.cards).toHaveLength(2);
  expect(page.cards[0].shown).toBeGreaterThan(0); // weeks 1 and 2 are open
  expect(page.cards[1].shown).toBe(0); // weeks 3 and 4 are locked
  // Side by side on a laptop, stacked on a phone.
  if (page.wide) expect(page.cards[1].top).toBe(page.cards[0].top);
  else expect(page.cards[1].top).toBeGreaterThan(page.cards[0].bottom);
});
