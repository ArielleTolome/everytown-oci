import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ID = process.env.OCI_REPORT_ID ?? '5c818adc-0e76-483c-84be-9da91bd5cc09';

// #37 (v1.10 user test): "Ask about your report" is now a chat behind a floating "Chat about your report" button.
// The panel is a modal dialog: the earlier conversation loads on open, Enter sends, the new answer is on screen,
// Escape closes it and focus returns to the button. The ask requests are stubbed in the page: no AI cost, and the
// shared report's question log is unchanged.
test('the chat opens from the floating button, answers on screen, and Escape returns focus', { session: 'staff' }, async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    const real = window.fetch;
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => !String(input).endsWith('/ask') ? real(input, init)
      : init?.method === 'POST' ? json({ answer: 'QA stub answer: list every funding source first.', gap_ids: [], resources: [], remaining: 5 })
      : json({ messages: [{ question: 'QA earlier question?', answer: 'QA stub earlier answer.', gap_ids: [], resources: [] }], remaining: 6 });
  });
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  // The floating button sits at the bottom right, inside the screen and clear of the phone's sticky bar.
  const fab = await browser.evaluate(() => {
    const r = document.querySelector('.chat-fab')!.getBoundingClientRect(), bar = document.querySelector('#toc')!.getBoundingClientRect();
    return { right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom), top: Math.round(r.top), barBottom: Math.round(bar.bottom), phone: innerWidth < 600 };
  });
  expect(fab.right).toBeGreaterThanOrEqual(8);
  expect(fab.bottom).toBeGreaterThanOrEqual(8);
  if (fab.phone) expect(fab.top).toBeGreaterThan(fab.barBottom); // the phone's sticky "On this page" bar
  await screen.getByRole('button', 'Chat about your report').tap();
  await expect(screen.getByRole('dialog', 'Chat about your report')).toBeVisible();
  await expect(screen.getByText('QA stub earlier answer.')).toBeVisible();
  await expect(screen.getByRole('button', 'What is the first step this week?')).toBeVisible();
  await screen.getByLabel('Your question').fill('What should we do in week 5?');
  await browser.evaluate(() => document.querySelector<HTMLElement>('#coach-question')!.focus());
  await browser.keyboard.press('Enter');
  await expect(screen.getByText('QA stub answer: list every funding source first.')).toBeVisible();
  const seen = await browser.evaluate(() => {
    const turns = document.querySelectorAll('#coach-log .coach-turn');
    const a = turns[turns.length - 1].querySelector('.coach-turn__a')!.getBoundingClientRect();
    const box = document.querySelector('#chat-scroll')!.getBoundingClientRect();
    return { turns: turns.length, inside: a.top >= box.top - 1 && a.top < box.bottom, typing: document.querySelector('#coach-status')!.textContent };
  });
  expect(seen).toEqual({ turns: 2, inside: true, typing: '' });
  await browser.keyboard.press('Escape');
  await expect(screen.getByRole('dialog', 'Chat about your report')).not.toBeVisible();
  expect(await browser.evaluate(() => document.activeElement?.classList.contains('chat-fab'))).toBe(true);
});

// Demo-path bug: a starter clicked while the earlier conversation was still loading lost its answer (the history
// replaced the log under the new question, so the saved answer showed as "We could not answer right now").
test('a question asked while the conversation is still loading still gets its answer', { session: 'staff' }, async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    const real = window.fetch;
    const json = (body: unknown, ms: number) => new Promise<Response>((ok) => setTimeout(() =>
      ok(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })), ms));
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => !String(input).endsWith('/ask') ? real(input, init)
      : init?.method === 'POST' ? json({ answer: 'QA stub fast answer.', gap_ids: [], resources: [], remaining: 5 }, 50)
      : json({ messages: [{ question: 'QA earlier question?', answer: 'QA stub slow history.', gap_ids: [], resources: [] }], remaining: 6 }, 1500);
  });
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  await screen.getByRole('button', 'Chat about your report').tap();
  await screen.getByRole('button', 'What is the first step this week?').tap();
  await expect(screen.getByText('QA stub fast answer.')).toBeVisible();
  await expect(screen.getByText('QA stub slow history.')).toBeVisible();
  expect(await browser.evaluate(() => [document.querySelectorAll('#coach-log .coach-turn').length, document.querySelector('#coach-error')!.hasAttribute('hidden')])).toEqual([2, true]);
});

// Nov 5 request: "New chat" in the chat header starts over. It shows once there is a conversation; it clears the
// conversation on screen (the server hides earlier turns from the AI and keeps them in the question count), says so,
// keeps the starter questions, and comes back after the next answer. Requests are stubbed in the page.
test('New chat clears the conversation and starts a new session', { session: 'staff' }, async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    const real = window.fetch;
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    (window as unknown as { newChats: number }).newChats = 0;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      if (u.endsWith('/ask/new')) { (window as unknown as { newChats: number }).newChats++; return json({ messages: [], remaining: 9 }); }
      if (!u.endsWith('/ask')) return real(input, init);
      return init?.method === 'POST' ? json({ answer: 'QA stub answer after the new chat.', gap_ids: [], resources: [], remaining: 8 })
        : json({ messages: [{ question: 'QA earlier question?', answer: 'QA stub earlier answer.', gap_ids: [], resources: [] }], remaining: 9 });
    };
  });
  await app.open(`/results/?id=${ID}`);
  await expect(screen.getByRole('link', 'Open my roadmap')).toBeVisible({ timeout: 15_000 });
  await screen.getByRole('button', 'Chat about your report').tap();
  await expect(screen.getByText('QA stub earlier answer.')).toBeVisible();
  await screen.getByRole('button', 'New chat').tap();
  await expect(screen.getByText('New chat started. Earlier questions are cleared from this chat.')).toBeVisible();
  expect(await browser.evaluate(() => ({
    turns: document.querySelectorAll('#coach-log .coach-turn').length,
    calls: (window as unknown as { newChats: number }).newChats,
    starters: document.querySelectorAll('.coach-starter').length > 0,
    newHidden: document.querySelector<HTMLElement>('[data-chat-new]')!.hidden,
  }))).toEqual({ turns: 0, calls: 1, starters: true, newHidden: true });
  await screen.getByRole('button', 'What is the first step this week?').tap();
  await expect(screen.getByText('QA stub answer after the new chat.')).toBeVisible();
  await expect(screen.getByRole('button', 'New chat')).toBeVisible();
});
