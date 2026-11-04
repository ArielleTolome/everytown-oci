import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The mocked demo logins are public (README "Try it live"), so they are plain values, not e2e credentials.
for (const [name, home] of [['demo', '/'], ['staff', '/staff/']] as const) {
  test.setup(`sign in as ${name}`, { sessions: [name] }, async ({ app, screen, session, browser }) => {
    await app.open('/login/');
    await screen.getByLabel('Username').fill(name);
    await screen.getByLabel('Password').fill(name);
    await screen.getByRole('button', 'Sign in').tap();
    await expect(browser).toHaveURL(home);
    await session.save(name);
  });
}
