import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// v1.8.1 #15: the phone resume link box was sized once when the panel opened, so rotating left empty lines or an inner
// scroll. Widens to 700 px and back with the panel open; the box must fit the whole link exactly each time.
// Makes one server-side draft named "QA Phone Link Resize Org" (no report); delete it by that exact name.
test('phone: the resume link box re-fits the whole link when the screen width changes', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  const { width, height } = await browser.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  test.skip(width > 599, 'phone layout only');
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill('QA Phone Link Resize Org');
  await screen.getByRole('button', 'Start questionnaire').tap();
  await screen.getByRole('button', 'One at a time').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await screen.getByRole('button', 'Save and finish later').tap();
  await expect(screen.getByLabel('Your resume link')).toBeVisible({ timeout: 15_000 });
  // Inner scroll (px hidden) and spare (px of empty lines): both 0 when the box shows exactly the whole link.
  const fit = () => browser.evaluate(() => {
    const el = document.getElementById('dt-save-link') as HTMLTextAreaElement;
    const scroll = el.scrollHeight - el.clientHeight + el.scrollWidth - el.clientWidth;
    const h = el.clientHeight, old = el.style.height;
    el.style.height = 'auto';
    const need = el.scrollHeight;
    el.style.height = old;
    return { scroll, spare: Math.max(0, h - need) };
  });
  await expect.poll(fit).toEqual({ scroll: 0, spare: 0 });
  for (const w of [700, width]) {
    await browser.setViewport({ width: w, height });
    await expect.poll(fit, { message: `at ${w} px` }).toEqual({ scroll: 0, spare: 0 });
  }
});
