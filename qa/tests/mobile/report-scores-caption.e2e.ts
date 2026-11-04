import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// v1.8 phone bug bash (p-report): the scores table caption was as wide as the table, so on a phone it was cut at the
// screen edge ("... estimated from your an"). It now wraps inside the visible frame, also after a sideways swipe.
test('the scores table caption stays inside the visible table frame', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/results/?id=${ID}#details`);
  await expect(screen.getByRole('tab', /^Your results in detail/)).toBeVisible({ timeout: 15_000 });
  await browser.evaluate(() => document.querySelector<HTMLDetailsElement>('details:has(#scores-caption)')?.setAttribute('open', ''));
  await expect(screen.getByRole('region', /^Capacity by area/)).toBeVisible();
  const overflow = await browser.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('#scores-caption')!.closest<HTMLElement>('.table-wrap')!;
    const out = (): number => {
      const c = document.querySelector('#scores-caption')!.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      return Math.max(0, Math.round(c.right - w.right), Math.round(w.left - c.left));
    };
    const before = out();
    wrap.scrollLeft = 200;
    return before + out();
  });
  expect(overflow).toBe(0);
});
