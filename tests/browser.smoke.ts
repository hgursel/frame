import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Exercise the compiled production server and JavaScript worker, not just tsx source.
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const model = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  assert(
    raw.includes('Maintenance starts at 02:00 UTC.'),
    'Selected document must reach the local model',
  );
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const reason = (text: string) =>
    `data: ${JSON.stringify({ id: 'browser-model', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta: { reasoning_content: text }, finish_reason: null }] })}\n\n`;
  response.write(reason('Reading the maintenance source. '));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  response.write(reason('Comparing the migration steps.'));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  response.end(
    `data: ${JSON.stringify({ id: 'browser-model', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'Your local workspace is ready.' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'browser-model', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));

const root = await mkdtemp(path.join(tmpdir(), 'frame-browser-test-'));
const port = 31876;
const { app } = await createApp({
  dataDir: root,
  origin: `http://127.0.0.1:${port}`,
  setupToken: 'browser-test-bootstrap',
  webDir: path.resolve('dist/web'),
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await app.listen({ host: '127.0.0.1', port });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel('Setup token').fill('browser-test-bootstrap');
  await page.getByLabel('Administrator password').fill('browser-test-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('heading', { name: 'Your knowledge. Your next move.' }).waitFor();
  await page.getByRole('button', { name: 'Connect your llama.cpp endpoint' }).click();
  await page
    .getByLabel('Endpoint URL')
    .fill(`http://127.0.0.1:${(model.address() as { port: number }).port}/v1`);
  await page.getByLabel('Model ID', { exact: true }).fill('local-test-model');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Settings saved' }).waitFor();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Infrastructure');
  await page
    .getByLabel('Project instructions', { exact: true })
    .fill('Help plan reliable infrastructure.');
  await page.getByRole('button', { name: 'Create project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.getByLabel('Upload document', { exact: true }).setInputFiles({
    name: 'maintenance.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Maintenance\n\nMaintenance starts at 02:00 UTC.'),
  });
  await page.getByRole('heading', { name: 'maintenance.md', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Attach to conversation', exact: true }).click();
  await page.getByRole('button', { name: '+ New conversation' }).click();
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Review our migration plan.');
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({ path: process.env.FRAME_SCREENSHOT, fullPage: true });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const thinking = page.locator('.thinking-active');
  await thinking.waitFor();
  assert.equal(await thinking.getAttribute('open'), null, 'Thinking starts collapsed');
  assert.equal(
    await thinking.locator('.thinking-orbit').evaluate((el) => getComputedStyle(el).animationName),
    'thinking-turn',
  );
  await thinking.locator('summary').click();
  await expect(page.getByLabel('Model thinking')).toContainText('Comparing the migration steps.');
  await page.getByText('Your local workspace is ready.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Useful · Save to knowledge', exact: false }).click();
  await page.getByLabel('Page title', { exact: true }).fill('Migration knowledge');
  await page
    .getByLabel('Knowledge content', { exact: true })
    .fill('# Migration knowledge\n\nSchedule the migration after the maintenance window.');
  await page.getByRole('button', { name: 'Save reviewed draft', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.getByRole('button', { name: 'Migration knowledge.md', exact: false }).click();
  await page.getByRole('heading', { name: 'Migration knowledge.md', exact: true }).waitFor();
  await expect(page.getByText('Unverified', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await page
    .getByLabel('Markdown content', { exact: true })
    .fill('# Migration knowledge\n\nSchedule after 03:00 UTC, subject to approval.');
  await page.getByRole('button', { name: 'Save knowledge page', exact: true }).click();
  await page.getByText('Schedule after 03:00 UTC, subject to approval.', { exact: true }).waitFor();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-knowledge.png'),
      fullPage: true,
    });
  await page.reload();
  await page.getByRole('button', { name: 'Review our migration plan.', exact: true }).click();
  await page.getByText('Your local workspace is ready.', { exact: true }).waitFor();
  assert.equal(
    await page.locator('.thinking-active').count(),
    0,
    'Completed history must not animate',
  );
  await page.locator('.thinking summary').click();
  await expect(page.getByLabel('Model thinking')).toContainText('Comparing the migration steps.');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.getByRole('textbox', { name: 'Message Frame' }).isVisible());
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert(!overflow, 'Mobile page must not overflow horizontally');
  assert.deepEqual(errors, []);
  console.log(
    'Browser smoke passed: setup, model settings, upload/attachment, compiled SDK reasoning stream and animation, reviewed knowledge save/edit, reload/resume, and mobile layout.',
  );
} finally {
  await browser?.close();
  await app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
