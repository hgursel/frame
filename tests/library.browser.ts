import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
let received: any;
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  received = JSON.parse(raw);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const answer =
    'Review the leave policy using [Paid Sick Leave](/api/library/packs/california-hr/1.1.0/pages/sick-leave). Confirm schedule and location first.';
  res.end(
    'data: ' +
      JSON.stringify({
        id: 'test',
        choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: null }],
      }) +
      '\n\ndata: ' +
      JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const root = await mkdtemp(path.join(tmpdir(), 'frame-library-browser-'));
const origin = 'http://127.0.0.1:31880';
const ctx = await createApp({
  dataDir: root,
  origin,
  setupToken: 'library-test',
  webDir: path.resolve('dist/web'),
});
const project = ctx.store.createProject({
  name: 'People and Contracts',
  instructions: '',
  toolsEnabled: false,
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  modelId: 'local-test',
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
});
// Exercise upgrading a project that already uses the released HR v1.0 pack.
ctx.library.install(ctx.library.get('california-hr', '1.0.0'));
ctx.library.attach(project.id, 'california-hr', '1.0.0', null);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await ctx.app.listen({ host: '127.0.0.1', port: 31880 });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Setup token').fill('library-test');
  await page.getByLabel('Administrator password').fill('library-test-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Settings', exact: false }).click();
  await page.getByRole('tab', { name: 'Knowledge Library', exact: true }).click();
  const hr = page
    .locator('.library-card')
    .filter({
      has: page.getByRole('heading', { name: 'California HR Essentials' }),
      hasText: 'v1.1.0',
    });
  const contracts = page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: 'Business Contract Review' }) });
  for (const title of [
    'Workplace Investigations',
    'Performance Reviews & Improvement Plans',
    'Commercial Leases',
  ])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await hr.getByRole('button', { name: 'Install pack' }).click();
  await expect(hr.getByRole('button', { name: 'Installed', exact: true })).toBeDisabled();
  await contracts.getByRole('button', { name: 'Install pack' }).click();
  await expect(contracts.getByRole('button', { name: 'Installed', exact: true })).toBeDisabled();
  await hr.getByText('Explore sections').click();
  await hr.getByRole('button', { name: 'Paid Sick Leave', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Library reference' });
  await expect(reader.getByRole('heading', { name: 'Paid Sick Leave', exact: true })).toBeVisible();
  await expect(
    reader.getByRole('link', { name: /California Paid Sick Leave FAQ/ }),
  ).toHaveAttribute('href', 'https://www.dir.ca.gov/dlse/paid_sick_leave.htm');
  await page.keyboard.press('Escape');
  await expect(reader).not.toBeVisible();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-library.png'),
      fullPage: true,
    });
  if (!(await page.getByLabel('Project menu: People and Contracts').isVisible()))
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByLabel('Project menu: People and Contracts').click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  assert.equal(ctx.library.attachments(project.id)[0].version, '1.0.0');
  await hr.getByRole('button', { name: 'Use this version' }).click();
  await expect(hr.getByRole('button', { name: 'Detach' })).toBeVisible();
  assert.equal(ctx.library.attachments(project.id)[0].version, '1.1.0');
  await contracts.getByRole('button', { name: 'Attach to project' }).click();
  await expect(contracts.getByRole('button', { name: 'Detach' })).toBeVisible();
  assert.equal(ctx.library.attachments(project.id).length, 2);
  if (!(await page.getByLabel('Project menu: People and Contracts').isVisible()))
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page
    .getByRole('button', { name: 'People and Contracts', exact: false })
    .filter({ has: page.locator('.folder') })
    .click();
  await page
    .getByPlaceholder('Ask Frame anything about your work…')
    .fill('Review California paid sick leave accrual.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.locator('.rich-markdown').filter({ hasText: 'Review the leave policy' }),
  ).toBeVisible({ timeout: 30000 });
  const request = JSON.stringify(received);
  assert(
    request.includes('40 hours or five days'),
    'relevant library brief reaches actual SDK model request',
  );
  assert(request.includes('/api/library/packs/california-hr/1.1.0/pages/sick-leave'));
  assert(
    !request.includes('Contract Review and Document Authority\n\nPack:'),
    'entire unrelated pack is not injected',
  );
  await page
    .locator('.rich-markdown')
    .getByRole('button', { name: 'Paid Sick Leave', exact: true })
    .click();
  await expect(reader).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(reader).not.toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: false }).click();
  await page.getByRole('tab', { name: 'Knowledge Library', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.getByRole('button', { name: 'Close navigation', exact: true }).isVisible())
    await page.keyboard.press('Escape');
  await page.locator('.library-heading').scrollIntoViewIfNeeded();
  await expect(hr).toBeVisible();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'mobile page must not overflow',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-library-mobile.png'),
      fullPage: true,
    });
  assert.deepEqual(errors, []);
  console.log(
    'Library browser: installation, attachment, sources, SDK retrieval, citations, dialog, and mobile layout passed.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  await new Promise<void>((r, j) => model.close((e) => (e ? j(e) : r())));
  await rm(root, { recursive: true, force: true });
}
