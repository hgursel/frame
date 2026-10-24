import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const root = await mkdtemp(path.join(tmpdir(), 'frame-multiuser-ui-'));
const origin = 'http://127.0.0.1:3194';
const { app } = await createApp({
  dataDir: root,
  origin,
  setupToken: 'ui-setup-token',
  webDir: path.resolve('dist/web'),
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
});
const errors: string[] = [];
try {
  await app.listen({ host: '127.0.0.1', port: 3194 });
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  admin.on('pageerror', (e) => errors.push(e.message));
  await admin.goto(origin);
  await admin.getByLabel('Setup token').fill('ui-setup-token');
  await admin.getByLabel('Username', { exact: true }).fill('admin');
  await admin.getByLabel('Password', { exact: true }).fill('admin-browser-password');
  await admin.getByRole('button', { name: 'Create workspace' }).click();
  await admin.getByRole('button', { name: '⚙ Settings' }).click();
  await admin.getByRole('tab', { name: 'Users', exact: true }).click();
  await admin.getByLabel('Username', { exact: true }).fill('alice');
  await admin.getByLabel('Temporary password', { exact: true }).fill('alice-temporary-password');
  await admin.getByRole('button', { name: 'Create account' }).click();
  await expect(
    admin.getByText('Account created. Share the username and temporary password with the user.'),
  ).toBeVisible();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const alice = await context.newPage();
  alice.on('pageerror', (e) => errors.push(e.message));
  await alice.goto(origin);
  await alice.getByLabel('Username', { exact: true }).fill('alice');
  await alice.getByLabel('Password', { exact: true }).fill('alice-temporary-password');
  await alice.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(alice.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
  await alice.getByLabel('Current password').fill('alice-temporary-password');
  await alice.getByLabel('New password').fill('alice-browser-password');
  await alice.getByRole('button', { name: 'Change password' }).click();
  await expect(alice.getByRole('button', { name: '⚙ Settings' })).toBeVisible();
  await alice.getByRole('button', { name: '⚙ Settings' }).click();
  await expect(alice.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(alice.getByRole('tab', { name: 'Model', exact: true })).toHaveCount(0);
  // Exercise creation through the interface, then compare both signed-in contexts.
  await alice.getByRole('button', { name: 'Create project', exact: true }).click();
  await alice.getByLabel('Project name').fill('Alice private research');
  await alice.locator('form').getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(alice.getByText('Alice private research', { exact: true }).first()).toBeVisible();
  const projects = await alice.evaluate(async () => await (await fetch('/api/projects')).json());
  assert.equal(projects.length, 1);
  const adminProjects = await admin.evaluate(
    async () => await (await fetch('/api/projects')).json(),
  );
  assert.deepEqual(adminProjects, []);
  const forbidden = await admin.evaluate(
    async (id) => (await fetch(`/api/projects/${id}/documents`)).status,
    projects[0].id,
  );
  assert.equal(forbidden, 404);
  await alice.reload();
  await expect(alice.getByText('Alice private research', { exact: true }).first()).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    'Multiuser browser flow passed: account creation, forced password change, private projects, role-aware settings, and reload.',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
}
