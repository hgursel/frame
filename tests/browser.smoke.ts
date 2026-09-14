import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Exercise the compiled production server and JavaScript worker, not just tsx source.
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const model = createServer(async (request, response) => {
  for await (const _ of request) {
    /* Consume the request body. */
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
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
  await page.getByRole('button', { name: '+ New conversation' }).click();
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Review our migration plan.');
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({ path: process.env.FRAME_SCREENSHOT, fullPage: true });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Your local workspace is ready.', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Review our migration plan.', exact: true }).click();
  await page.getByText('Your local workspace is ready.', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.getByRole('textbox', { name: 'Message Frame' }).isVisible());
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert(!overflow, 'Mobile page must not overflow horizontally');
  assert.deepEqual(errors, []);
  console.log(
    'Browser smoke passed: setup, login, model settings, project creation, compiled SDK chat, reload/resume, and mobile layout.',
  );
} finally {
  await browser?.close();
  await app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
