import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
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
  await admin.getByLabel('Password').fill('admin-browser-password');
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
  await alice.getByLabel('Password').fill('alice-temporary-password');
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
  await expect(
    alice.getByLabel('Project menu: Alice private research', { exact: true }),
  ).toBeVisible();
  const projects = await alice.evaluate(async () => await (await fetch('/api/projects')).json());
  assert.equal(projects.length, 2);
  assert(projects.some((p: any) => p.name === 'Arena'));
  const adminProjects = await admin.evaluate(
    async () => await (await fetch('/api/projects')).json(),
  );
  assert.deepEqual(
    adminProjects.map((p: any) => p.name),
    ['Arena'],
  );
  const forbidden = await admin.evaluate(
    async (id) => (await fetch(`/api/projects/${id}/documents`)).status,
    projects.find((p: any) => p.name === 'Alice private research').id,
  );
  assert.equal(forbidden, 404);
  await alice.reload();
  await expect(
    alice.getByLabel('Project menu: Alice private research', { exact: true }),
  ).toBeVisible();
  await expect(alice.locator('.sidebar-user')).toHaveText('Aalice');
  await expect(admin.locator('.sidebar-user')).toHaveText('Aadmin');
  await admin.getByRole('tab', { name: 'Model', exact: true }).click();
  const width = await admin
    .locator('.settings-page')
    .evaluate((el) => el.getBoundingClientRect().width);
  assert(width > 1000, 'Admin settings use the available screen width');
  await admin.screenshot({ path: '/tmp/frame-admin-settings.png' });
  await alice.getByLabel('Project menu: Arena', { exact: true }).click();
  await alice.getByRole('button', { name: 'Project settings', exact: true }).click();
  await expect(alice.getByLabel('Enable file and Python tools')).toHaveCount(0);
  await expect(alice.getByRole('tab', { name: 'Skills', exact: true })).toHaveCount(0);
  await alice.getByRole('tab', { name: 'Knowledge & Library' }).click();
  await expect(alice.locator('.library-collapse')).not.toHaveAttribute('open');
  await expect(alice.locator('.library-collapse > summary')).toContainText('0 attached');
  await alice.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await expect(alice.getByLabel('Frame for Excel', { exact: true })).not.toBeChecked();
  await alice.getByLabel('Frame for Excel', { exact: true }).check();
  await alice.getByRole('button', { name: 'Save project plugins', exact: true }).click();
  await expect(alice.getByText('Project plugins saved.', { exact: true })).toBeVisible();
  await alice.screenshot({ path: '/tmp/frame-project-settings.png' });
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click({ position: { x: 380, y: 50 } });
  assert(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await alice.screenshot({ path: '/tmp/frame-mobile-settings.png' });
  await alice.setViewportSize({ width: 1280, height: 900 });
  await alice.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await alice.getByLabel('Project menu: Arena', { exact: true }).click();
  await alice.getByRole('button', { name: 'Knowledge', exact: true }).click();
  const bundle = (body: string) =>
    Buffer.from(
      zipSync({
        'index.md': strToU8('---\nokf_version: "0.2"\n---\n# Index'),
        'guide.md': strToU8('---\ntitle: Imported guide\n---\n\n' + body),
      }),
    );
  const importFile = async (body: string) => {
    await alice
      .getByLabel('Import OKF bundle', { exact: true })
      .setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: bundle(body) });
    await expect(alice.getByRole('region', { name: 'OKF import preview' })).toBeVisible();
    await alice.getByRole('button', { name: 'Import changes' }).click();
    await expect(alice.getByRole('status').filter({ hasText: 'Imported' })).toBeVisible();
  };
  await importFile('# First version');
  await importFile('# Updated version');
  const saved = await alice.evaluate(async () => {
    const projects = await (await fetch('/api/projects')).json();
    const project = projects.find((p: any) => p.name === 'Arena');
    const documents = await (await fetch(`/api/projects/${project.id}/documents`)).json();
    return await (
      await fetch(`/api/projects/${project.id}/documents/${documents[0].id}/revisions`)
    ).json();
  });
  assert(saved.some((r: any) => r.content === '# First version'));
  assert(saved.some((r: any) => r.content === '# Updated version'));
  assert.deepEqual(errors, []);
  console.log(
    'Multiuser/settings browser passed: Arena, username, private projects, desktop/mobile navigation, collapsed references, Excel opt-in, admin-only skills, and OKF update history.',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
}
