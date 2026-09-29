import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const root = await mkdtemp(path.join(tmpdir(), 'frame-private-browser-'));
const script = path.join(root, 'echo.cjs');
const envFile = path.join(root, 'private.env');
await writeFile(
  script,
  `let raw=''; process.stdin.on('data',b=>raw+=b); process.stdin.on('end',()=>console.log(JSON.stringify({value:JSON.parse(raw).text,secret:process.env.API_TOKEN})));`,
);
await writeFile(envFile, 'API_TOKEN=browser-dummy-secret\n', { mode: 0o600 });
const requests: string[] = [];
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const b of req) raw += b;
  requests.push(raw);
  const body = JSON.parse(raw);
  const call = body.messages.at(-1)?.role !== 'tool';
  const delta = call
    ? {
        tool_calls: [
          {
            index: 0,
            id: 'private-echo',
            type: 'function',
            function: { name: 'private_echo', arguments: '{"text":"Hello from a private tool"}' },
          },
        ],
      }
    : { content: 'Private operation finished.' };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    `data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:31881';
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
  await ctx.app.listen({ host: '127.0.0.1', port: 31881 });
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
  await page.getByRole('button', { name: 'Private Tools plugin', exact: true }).click();
  await page.getByLabel('Enable Private Tools system-wide').check();
  await page.getByLabel('Private usage instructions').fill('Use echo for the local test.');
  await page.getByRole('button', { name: 'Add operation', exact: true }).click();
  await page.getByLabel('Tool ID', { exact: true }).fill('echo');
  await page.getByLabel('Display name', { exact: true }).fill('Echo request');
  await page.getByLabel('Tool description', { exact: true }).fill('Return the requested text.');
  await page.getByLabel('Executable path', { exact: true }).fill(process.execPath);
  await page.getByLabel('Fixed arguments', { exact: true }).fill(script);
  await page.getByLabel('Environment file', { exact: true }).fill(envFile);
  await page.getByRole('button', { name: 'Add input', exact: true }).click();
  await page.getByLabel('Input name', { exact: true }).fill('text');
  await page.getByLabel('Input description', { exact: true }).fill('Text to echo');
  await expect(page.getByRole('combobox', { name: 'Approval', exact: true })).toHaveValue('always');
  await page.getByRole('button', { name: 'Charts plugin', exact: true }).click();
  await page.getByRole('button', { name: 'Private Tools plugin', exact: true }).click();
  await expect(page.getByLabel('Tool ID', { exact: true })).toHaveValue('echo');
  await page.getByRole('button', { name: 'Save Private Tools', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Private Tools saved' })).toBeVisible();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-private-settings.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 380, y: 50 } });
  await page.getByRole('heading', { name: 'Private Tools', exact: true }).scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-private-mobile.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Private project');
  await page.getByRole('button', { name: 'Create project', exact: true }).last().click();
  await page.getByRole('button', { name: /^Project menu:/ }).click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Enable Private Tools for this project').check();
  await page.getByRole('button', { name: 'Save project plugins', exact: true }).click();
  await expect(page.getByText('Project plugins saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Echo a message.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const approval = page.getByRole('region', { name: 'Private tool approval' });
  await expect(approval).toBeVisible();
  await expect(approval).toContainText('Hello from a private tool');
  await expect(page.locator('.activity-running .activity-status')).toContainText(
    'Awaiting tool approval',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-private-approval.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Allow once', exact: true }).click();
  await expect(page.getByText('Private operation finished.', { exact: true })).toBeVisible();
  await expect(approval).toHaveCount(0);
  assert.equal(requests.length, 2);
  assert(!requests.join('').includes('browser-dummy-secret'));
  assert(requests[1]!.includes('[REDACTED]'));
  await page.reload();
  await page.getByRole('button', { name: '⚙ Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await page.getByRole('button', { name: 'Private Tools plugin', exact: true }).click();
  await expect(page.getByLabel('Executable path', { exact: true })).toHaveValue(process.execPath);
  await page.getByRole('button', { name: 'Remove operation', exact: true }).click();
  await page.getByRole('button', { name: 'Save Private Tools', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Private Tools saved' })).toBeVisible();
  assert.equal(ctx.privateTools.settings().tools.length, 0);
  assert((await readFile(envFile, 'utf8')).includes('browser-dummy-secret'));
  assert.deepEqual(errors, []);
  console.log(
    'Private Tools browser passed: local configuration, retained drafts, project enablement, exact approval, redacted SDK output, reload, removal, and mobile layout.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await rm(root, { recursive: true, force: true });
}
