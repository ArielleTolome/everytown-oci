import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

// #25: one "English | Español" switch at the top of the start page and the questionnaire sets both the question language
// and the report language (draft.language, which the server uses for the report and its read-aloud voice). The
// questionnaire's own "Questions in" switch used to change only the questions. Read-only except a local draft.
const start = async (screen: Screen, org: string) => {
  await screen.getByLabel('Executive director').check();
  await screen.getByLabel('Your job title').fill('QA Lead');
  await screen.getByLabel('Your name').fill('QA Tester');
  await screen.getByLabel('Organization name').fill(org);
  await screen.getByRole('button', 'Start questionnaire').tap();
};
const draftLanguage = () => JSON.parse(localStorage.getItem('oci-draft') ?? '{}').language as string | undefined;

test('Español on the start page gives Spanish questions; English on the questionnaire changes the report language', { session: 'demo' }, async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByRole('radio', 'Español').check();
  await start(screen, 'QA Language Org');
  await screen.getByRole('button', 'Una a la vez').tap(); // #28: the answer-style choice follows the language too
  await expect(screen.getByRole('heading', 'Planeación', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('radio', 'Español')).toBeChecked();
  await expect(screen.getByRole('button', /^Sí/)).toBeVisible();
  expect(await browser.evaluate(draftLanguage)).toBe('es');

  await screen.getByRole('radio', 'English').check();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  await expect.poll(() => browser.evaluate(draftLanguage)).toBe('en');
  await app.open('/');
  await expect(screen.getByRole('radio', 'English')).toBeChecked();
  await expect(screen.getByRole('radio', 'Español')).not.toBeChecked();
});

test('a questionnaire switched to Español submits language es', { session: 'demo' }, async ({ app, screen, browser }) => {
  // The submit is answered in the page, so no report is made.
  const posted: string[] = [];
  await browser.route('**/api/assessments', async (route) => {
    if (route.request.method !== 'POST') return route.fallback();
    posted.push(route.request.postData ?? '');
    await route.fulfill({ status: 503, json: { error: 'QA: not sent' } });
  });
  await app.open('/');
  await start(screen, 'QA Language Submit Org');
  await screen.getByRole('button', 'One at a time').tap();
  await expect(screen.getByRole('heading', 'Planning', { level: 1 })).toBeVisible();
  // Every chosen statement answered on this device, then the finish screen.
  await browser.evaluate(async () => {
    const meta = await (await fetch('/api/meta')).json() as { domains: { id: string; questions: { id: string }[] }[] };
    const d = JSON.parse(localStorage.getItem('oci-draft')!);
    for (const area of meta.domains) if (d.domain_ids.includes(area.id)) for (const q of area.questions) d.answers[q.id] = 'yes';
    localStorage.setItem('oci-draft', JSON.stringify(d));
  });
  await app.open('/questionnaire/');
  await expect(screen.getByRole('heading', /^You answered all \d+ statements$/, { level: 1 })).toBeVisible();
  await expect(screen.getByRole('radio', 'English')).toBeChecked();

  await screen.getByRole('radio', 'Español').check();
  await expect(screen.getByRole('heading', /^Respondió las \d+ afirmaciones$/, { level: 1 })).toBeVisible();
  await screen.getByRole('button', 'Ver mis resultados').tap();
  await expect.poll(() => posted.length).toBe(1);
  expect(JSON.parse(posted[0]).language).toBe('es');
});
