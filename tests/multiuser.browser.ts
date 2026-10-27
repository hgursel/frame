import { openAccountPage } from './navigation.js';
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
  await openAccountPage(admin, 'Admin');
  await expect(admin.getByRole('heading', { name: 'Admin Settings', exact: true })).toBeVisible();
  for (const name of ['Account', 'Context', 'Documents'])
    await expect(admin.getByRole('tab', { name, exact: true })).toHaveCount(0);
  await expect(admin.getByLabel('Context window', { exact: true })).toBeVisible();
  await expect(admin.getByText('Personal workspaces', { exact: true })).toHaveCount(0);
  await admin.getByRole('tab', { name: 'Skills', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Document tools', exact: true })).toBeVisible();
  await openAccountPage(admin, 'Settings');
  await expect(admin.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(admin.getByRole('tab', { name: 'Users', exact: true })).toHaveCount(0);
  await openAccountPage(admin, 'Admin');
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
  await expect(alice.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await openAccountPage(alice, 'Settings');
  await expect(alice.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(alice.getByRole('tab', { name: 'Model', exact: true })).toHaveCount(0);
  // Appearance stays local to each browser and reacts to system changes while open.
  await alice.emulateMedia({ colorScheme: 'dark' });
  await expect(alice.getByLabel('Color theme')).toHaveValue('system');
  await expect(alice.locator('html')).toHaveAttribute('data-theme', 'dark');
  await alice.emulateMedia({ colorScheme: 'light' });
  await expect(alice.locator('html')).toHaveAttribute('data-theme', 'light');
  await alice.getByLabel('Color theme').selectOption('dark');
  await alice.reload();
  await expect(alice.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(admin.locator('html')).toHaveAttribute('data-theme', 'light');
  await openAccountPage(alice, 'Settings');
  await expect(alice.getByLabel('Color theme')).toHaveValue('dark');
  await alice.screenshot({ path: '/tmp/frame-user-settings.png' });
  await alice.getByLabel('Color theme').selectOption('system');
  await alice.reload();
  await alice.emulateMedia({ colorScheme: 'dark' });
  await expect(alice.locator('html')).toHaveAttribute('data-theme', 'dark');
  await alice.emulateMedia({ colorScheme: 'light' });
  const accountMenu = alice.getByRole('button', { name: 'Account menu', exact: true });
  await accountMenu.focus();
  await expect(accountMenu).toHaveCSS('opacity', '1');
  await alice.keyboard.press('Enter');
  const menu = alice.getByRole('group', { name: 'Account menu', exact: true });
  await expect(menu.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Scheduled Tasks', exact: true })).toBeFocused();
  await alice.screenshot({ path: '/tmp/frame-account-menu.png' });
  const menuBox = (await menu.boundingBox())!;
  assert(menuBox.x + menuBox.width <= (await alice.locator('.sidebar').boundingBox())!.width);
  assert(menuBox.y >= 0 && menuBox.y + menuBox.height < (await accountMenu.boundingBox())!.y);
  await alice.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(accountMenu).toBeFocused();
  await accountMenu.click();
  await alice.getByRole('heading', { name: 'Your knowledge. Your infrastructure.' }).click();
  await expect(menu).toHaveCount(0);

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
  await expect(alice.locator('.sidebar-user')).toHaveText('alice');
  await expect(admin.locator('.sidebar-user')).toHaveText('admin');
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
  // Many projects do not displace conversations or the account row.
  await alice.evaluate(async () => {
    const projects = await (await fetch('/api/projects')).json();
    const current = projects.find((p: any) => p.name === 'Arena');
    for (let i = 0; i < 6; i++)
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Extra project ${i}` }),
      });
    await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: current.id }),
    });
    return current.id;
  });
  await alice.reload();
  const projectList = alice.getByRole('navigation', { name: 'Projects', exact: true });
  await expect(projectList.locator('.sidebar-row')).toHaveCount(8);
  const dimensions = await projectList.evaluate((el) => ({
    height: el.clientHeight,
    total: el.scrollHeight,
    row: el.querySelector('.sidebar-row')!.getBoundingClientRect().height,
  }));
  assert(dimensions.height <= dimensions.row * 4 && dimensions.total > dimensions.height);
  assert((await alice.locator('.chat-list').boundingBox())!.height > 100);
  await projectList.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => projectList.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(accountMenu).toBeInViewport();
  await alice.locator('.chat-list .sidebar-row > button:first-child').first().click();
  await alice.getByLabel('Message Frame').fill('Unsent draft');
  const beforeHome = await alice.evaluate(
    async () => (await (await fetch('/api/conversations')).json()).length,
  );
  await alice.getByRole('button', { name: 'Frame home' }).click();
  await expect(alice.getByLabel('Message Frame')).toHaveValue('');
  await expect(alice.locator('.header-location')).toContainText('Arena');
  assert.equal(
    await alice.evaluate(async () => (await (await fetch('/api/conversations')).json()).length),
    beforeHome,
  );
  await expect(
    alice.getByRole('heading', { name: 'Your knowledge. Your infrastructure.' }),
  ).toBeVisible();
  // Touch users can open the same menu and navigate without hover.
  const touchContext = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const touch = await touchContext.newPage();
  await touch.goto(origin);
  await touch.getByRole('button', { name: 'Toggle navigation' }).tap();
  await expect(touch.getByRole('button', { name: 'Account menu' })).toHaveCSS('opacity', '1');
  await touch.getByRole('button', { name: 'Account menu' }).tap();
  await touch.getByRole('button', { name: 'Scheduled Tasks', exact: true }).tap();
  await expect(touch.getByRole('heading', { name: 'Scheduled Tasks', exact: true })).toBeVisible();
  await expect(touch.locator('.sidebar')).not.toBeVisible();
  await expect(touch.getByText('YOUR WORKSPACE', { exact: true })).toHaveCount(0);
  await touch.screenshot({ path: '/tmp/frame-mobile-scheduled.png' });
  await touch.getByRole('button', { name: 'Toggle navigation' }).tap();
  await touch.getByRole('button', { name: 'Account menu' }).tap();
  await touch.getByRole('button', { name: 'Sign Out', exact: true }).tap();
  await expect(touch.getByRole('button', { name: 'Sign in', exact: false })).toBeVisible();
  await touchContext.close();

  assert.deepEqual(errors, []);
  console.log(
    'Multiuser/settings browser passed: user/admin separation, system appearance and persistence, project scrolling, home navigation, keyboard/touch account menu and sign out, private projects, and OKF history.',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
}
