import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// v1.8.1 #15: the roadmap picked its phone order (the weeks before the totals, this week's steps before "Why this
// matters") once, at render time, so turning a phone past 600 px kept the phone order until the next tick, and back.
test('the roadmap order follows the width when the screen turns', { session: 'staff' }, async ({ app, screen, browser }) => {
  await app.open(`/plan/?id=${ID}`);
  await expect(screen.getByRole('heading', /roadmap$/, { level: 1 })).toBeVisible({ timeout: 15_000 });
  const order = () => browser.evaluate(() => {
    const first = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const steps = document.querySelector('.rm-week--open .rm-tasks');
    const why = steps?.parentElement?.querySelector(':scope > .inset');
    return {
      totalsFirst: first(document.querySelector('#rm-progress-title')!, document.querySelector('#rm-weeks-title')!),
      whyFirst: steps && why ? first(why, steps) : null,
    };
  });
  const hasWhy = (await order()).whyFirst !== null;
  for (const width of [390, 1280, 390]) {
    await browser.setViewport({ width, height: 664 });
    const wide = width >= 600;
    await expect.poll(order).toEqual({ totalsFirst: wide, whyFirst: hasWhy ? wide : null });
  }
});
