import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const root = await mkdtemp(path.join(tmpdir(), 'frame-skills-browser-'));
const folder = path.join(root, 'skills');
await mkdir(path.join(folder, 'lookup', 'scripts'), { recursive: true });
await writeFile(
  path.join(folder, 'lookup', 'SKILL.md'),
  '---\nname: lookup\ndescription: Look up a customer record with the local lookup script.\n---\n\nBROWSER-SKILL-BODY: run ./scripts/lookup.sh with the record ID.\n',
);
const requests: string[] = [];
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const b of req) raw += b;
  requests.push(raw);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    `data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: { content: 'Lookup finished.' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:31882';
const ctx = await createApp({
  dataDir: root,
  origin,
  setupToken: 'test',
  webDir: path.resolve('dist/web'),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  modelId: 'test',
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
});
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port: 31882 });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Setup token').fill('test');
  await page.getByLabel('Administrator password').fill('test-password-12345');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: '⚙ Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await page.getByRole('button', { name: 'Skills plugin', exact: true }).click();
  await page
    .getByLabel('Skill folders', { exact: true })
    .fill(`${folder}\n${path.join(root, 'missing')}`);
  await page.getByRole('button', { name: 'Save skill folders', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Skill folders saved.' })).toBeVisible();
  await expect(page.getByText('1 skill found', { exact: true })).toBeVisible();
  await expect(page.locator('.skill-list')).toContainText('Look up a customer record');
  await expect(page.getByRole('group', { name: 'Skill warnings' })).toContainText(
    'folder not found',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-skills-settings.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click({ position: { x: 380, y: 50 } });
  await page.getByRole('heading', { name: 'Skills', exact: true }).scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();

  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Skills project');
  await page.getByRole('button', { name: 'Create project', exact: true }).last().click();
  await page.getByRole('button', { name: /^Project menu:/ }).click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await expect(page.getByText('Skills run with trusted agent tools.')).toBeVisible();
  await page.getByLabel('Enable skill lookup').check();
  await page.getByRole('button', { name: 'Save project skills', exact: true }).click();
  await expect(page.getByText('Project skills saved.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Message Frame' });
  await composer.fill('/');
  const picker = page.getByRole('listbox', { name: 'Skills' });
  await expect(picker).toContainText('Skills need trusted agent tools.');
  await composer.fill('');

  const project = ctx.store.projects()[0]!;
  ctx.store.updateProject(project.id, { ...project, toolsEnabled: true });
  await composer.fill('/');
  await expect(picker.getByRole('option', { name: /\/skill:lookup/ })).toBeVisible();
  await composer.press('Escape');
  await expect(picker).toHaveCount(0);
  await composer.fill('/l');
  await expect(picker).toHaveCount(0);
  await composer.fill('');
  await composer.fill('/lo');
  await expect(picker.getByRole('option')).toHaveCount(1);
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-skills-picker.png'),
      fullPage: true,
    });
  await composer.press('Enter');
  await expect(composer).toHaveValue('/skill:lookup ');
  await expect(picker).toHaveCount(0);
  await composer.pressSequentially('record 42');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Lookup finished.', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Conversation' })
      .getByText('/skill:lookup record 42', { exact: true }),
  ).toBeVisible();
  assert.equal(requests.length, 1);
  assert(requests[0]!.includes('BROWSER-SKILL-BODY'));
  assert(requests[0]!.includes('record 42'));
  await page.reload();
  await page
    .getByLabel('Conversations', { exact: true })
    .getByText('/skill:lookup record 42', { exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Conversation' })
      .getByText('/skill:lookup record 42', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('BROWSER-SKILL-BODY')).toHaveCount(0);
  // Removing a skill folder must not leave an invisible project selection that cannot be cleared.
  ctx.skills.save({ folders: [] });
  await page.getByRole('button', { name: /^Project menu:/ }).click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByRole('button', { name: 'Remove unavailable skill lookup' }).click();
  await page.getByRole('button', { name: 'Save project skills', exact: true }).click();
  await expect(page.getByText('Project skills saved.', { exact: true })).toBeVisible();
  assert.deepEqual(ctx.skills.enabled(project.id), []);
  assert.deepEqual(errors, []);
  console.log(
    'Skills browser passed: folder scan and warnings, project enablement, host-tool gating, picker keyboard use, /skill expansion, collapsed history, and mobile layout.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await rm(root, { recursive: true, force: true });
}
