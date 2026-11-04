import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// v1.8 phone bug bash (p-report): with Display > Larger text on, "On this page" ran past its border in the phone's
// sticky bar. The bar's labels must fit, on one line, inside their buttons.
test('the phone "On this page" bar fits with Larger text', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await browser.evaluate(() => localStorage.setItem('oci-display', JSON.stringify({ text: true })));
  try {
    await app.open(`/results/?id=${ID}`);
    await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
    const bar = await browser.evaluate(() => {
      window.scrollTo(0, 1500);
      const summary = document.querySelector<HTMLElement>('#results-root .toc__details > summary')!;
      if (getComputedStyle(summary).display === 'none') return null; // wide screens: the list is a side column
      const jump = document.querySelector<HTMLElement>('#results-root .toc__jump');
      const shown = jump && getComputedStyle(jump).display !== 'none' ? jump : null;
      return {
        large: document.documentElement.dataset.text,
        cut: summary.scrollWidth - summary.clientWidth + (shown ? shown.scrollWidth - shown.clientWidth : 0),
        right: Math.round((shown ?? summary).getBoundingClientRect().right - innerWidth),
        height: Math.round(document.querySelector('#results-root .toc')!.getBoundingClientRect().height),
      };
    });
    if (!bar) return;
    expect(bar.large).toBe('large');
    expect(bar.cut).toBeLessThanOrEqual(0);
    expect(bar.right).toBeLessThanOrEqual(0);
    expect(bar.height).toBeLessThan(85); // the scroll padding that keeps focus below the bar is 4.25rem (85px here)
  } finally {
    await browser.evaluate(() => localStorage.removeItem('oci-display'));
  }
});
