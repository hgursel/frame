import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Exercise the compiled production server and JavaScript worker, not just tsx source.
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
let heldConnectionsClosed = 0;
let followupRequests = 0;
const model = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  assert(
    raw.includes('Maintenance starts at 02:00 UTC.'),
    'Selected document must reach the local model',
  );
  const body = JSON.parse(raw);
  const lastUser = [...body.messages].reverse().find((m: any) => m.role === 'user');
  const lastText = JSON.stringify(lastUser?.content);
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'followup', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  if (lastText?.includes('Hold until stopped')) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(chunk({ reasoning_content: 'Waiting for cancellation.' }));
    response.on('close', () => heldConnectionsClosed++);
    return;
  }
  if (lastText?.includes('Follow-up tool check')) {
    followupRequests++;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (body.messages.at(-1)?.role !== 'tool') {
      response.write(chunk({ reasoning_content: 'I will search the project.' }));
      await new Promise((resolve) => setTimeout(resolve, 400));
      response.write(chunk({ tool_calls: [{ index: 0, id: 'followup-search', type: 'function', function: { name: 'search_knowledge', arguments: '' } }] }));
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response.end(chunk({ tool_calls: [{ index: 0, function: { arguments: '{"query":"maintenance"}' } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n');
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response.write(chunk({ content: 'Follow-up result arrived.' }));
      await new Promise((resolve) => setTimeout(resolve, 500));
      response.end(chunk({}, 'stop') + 'data: [DONE]\n\n');
    }
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const reason = (text: string) =>
    `data: ${JSON.stringify({ id: 'browser-model', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta: { reasoning_content: text }, finish_reason: null }] })}\n\n`;
  response.write(reason('Reading the maintenance source. '));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  response.write(reason('Comparing the migration steps.'));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  response.end(
    `data: ${JSON.stringify({ id: 'browser-model', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta: { role: 'assistant', content: "Your local workspace is ready.\n\n| Phase | Status |\n| --- | --- |\n| Migration | Ready |\n\n```mermaid\nflowchart TD\nA[Sources] --> B[Review]\nB --> C[Answer]\n```\n\n```mermaid\nnot-a-valid-diagram\n```" }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'browser-model', object: 'chat.completion.chunk', created: 1, model: 'local-test-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
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
  const externalRequests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(`http://127.0.0.1:${port}/`)) externalRequests.push(request.url()); });
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('Browser error:', error.message);
  });
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
  assert.equal(await page.locator('.sidebar .edition, .sidebar .mark, .local-badge, .new-chat').count(), 0);
  await page.getByRole('button', { name: 'Add attachments', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload from computer', exact: false }).click();
  await (await chooser).setFiles({
    name: 'maintenance.md', mimeType: 'text/markdown',
    buffer: Buffer.from('# Maintenance\n\nMaintenance starts at 02:00 UTC.'),
  });
  await expect(page.locator('.composer-attachments')).toContainText('maintenance.md');
  await page.getByRole('button', { name: 'Add attachments', exact: true }).click();
  await page.getByRole('button', { name: 'Attach from knowledge', exact: false }).click();
  await expect(page.getByRole('dialog', { name: 'Attach from knowledge' })).toBeVisible();
  await page.getByLabel('Search attachment knowledge').fill('maintenance');
  const selectedFile = page.getByRole('dialog', { name: 'Attach from knowledge' }).getByRole('checkbox');
  await selectedFile.uncheck(); await selectedFile.check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
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
  await expect(page.locator('.throughput')).toContainText('tok/s');
  await expect(page.getByRole('columnheader', { name: 'Phase', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Migration', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Mermaid diagram', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('This Mermaid diagram could not be rendered.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Expand diagram', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expanded Mermaid diagram' })).toBeVisible();
  await page.getByRole('button', { name: 'Close diagram', exact: true }).click();
  await page.getByLabel('Context usage', { exact: true }).click();
  await expect(page.getByText('Conversation context', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Context used' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compact now', exact: true })).toBeEnabled();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-context.png'),
      fullPage: true,
    });
  await page.getByLabel('Context usage', { exact: true }).click();
  await page.getByRole('button', { name: 'Dark appearance', exact: false }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-dark.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Light appearance', exact: false }).click();
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
  await page.getByRole('button', { name: 'maintenance.md', exact: false }).click();
  await page.getByRole('heading', { name: 'maintenance.md', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove file', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remove file?' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'maintenance.md', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove file', exact: true }).click();
  await page.getByRole('button', { name: 'Remove permanently', exact: true }).click();
  await expect(page.locator('.knowledge-list')).not.toContainText('maintenance.md');
  await page.locator('.sidebar-bottom').getByRole('button', { name: 'Settings', exact: false }).click();
  await page.getByRole('tab', { name: 'Context', exact: true }).click();
  await page.getByLabel('Compact at used percentage').fill('70');
  await page.getByRole('tab', { name: 'Instructions', exact: true }).click();
  await page.getByLabel('Organization instructions').fill('Keep answers accurate and practical.');
  await page.getByRole('tab', { name: 'Context', exact: true }).click();
  await expect(page.getByLabel('Compact at used percentage')).toHaveValue('70');
  await page.getByRole('tab', { name: 'Model', exact: true }).click();
  await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('local-test-model');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Settings saved' }).waitFor();
  await page.getByRole('tab', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Document tools', exact: true })).toBeVisible();
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
  // A resumed conversation must advance through reasoning, tool arguments, and response.
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Follow-up tool check');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.status')).toHaveText('Preparing tool call', { timeout: 15000 });
  await expect(page.locator('.status')).toHaveText('Waiting for model');
  await expect(page.locator('.status')).toHaveText('Responding');
  await expect(page.getByText('Follow-up result arrived.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
  assert.equal(followupRequests, 2, 'One follow-up plus one continuation after the tool');
  // Simulate an unavailable live stream. HTTP reconciliation must still update and stop.
  await page.route('**/api/conversations/*/events', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Review our migration plan.', exact: true }).click();
  await expect(page.getByText('Follow-up result arrived.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Hold until stopped');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.status')).toContainText('reconnecting');
  const stop = page.getByRole('button', { name: 'Stop generation', exact: true });
  await expect(stop).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.locator('.thinking-active').count(), { timeout: 15000 }).toBe(1);
  const checkStopGeometry = async () => {
    const box = await stop.boundingBox();
    const icon = await stop.locator('svg').boundingBox();
    assert(box && icon);
    assert(Math.abs(box.width - 36) < 1 && Math.abs(box.height - 36) < 1);
    assert(Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2) < 1);
    assert(Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2) < 1);
  };
  await checkStopGeometry();
  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = page.getByRole('button', { name: 'Close navigation', exact: true });
  if (await drawer.isVisible()) await drawer.click({ position: { x: 370, y: 400 } });
  await checkStopGeometry();
  await stop.click();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => heldConnectionsClosed).toBe(1);
  await expect(page.locator('.thinking-active')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  // Desktop navigation may remain open when the viewport is resized; close its drawer.
  const closeNavigation = page.getByRole('button', { name: 'Close navigation', exact: true });
  if (await closeNavigation.isVisible())
    await closeNavigation.click({ position: { x: 370, y: 400 } });
  assert(await page.getByRole('textbox', { name: 'Message Frame' }).isVisible());
  await page.getByLabel('Context usage', { exact: true }).click();
  await expect(page.getByText('Conversation context', { exact: true })).toBeVisible();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-mobile.png'),
      fullPage: true,
    });
  await page.getByLabel('Context usage', { exact: true }).click();
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await expect(page.getByLabel('Search conversations', { exact: true })).toBeVisible();
  await page.getByLabel('Search conversations', { exact: true }).fill('no matching chat');
  assert.equal(
    await page.getByRole('navigation', { name: 'Conversations' }).getByRole('button').count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click({ position: { x: 370, y: 400 } });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert(!overflow, 'Mobile page must not overflow horizontally');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], 'Markdown and diagrams must not request external resources');
  console.log(
    'Browser smoke passed: setup, tabbed settings with retained drafts, composer uploads and knowledge attachments, GFM tables, local Mermaid rendering/fallback/expansion, knowledge removal, streaming/context/throughput, appearance, reload, and mobile layout.',
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    console.error((await page.locator('body').innerText()).slice(0, 3000));
    if (process.env.FRAME_SCREENSHOT)
      await page.screenshot({
        path: process.env.FRAME_SCREENSHOT.replace('.png', '-failure.png'),
        fullPage: true,
      });
  }
  throw error;
} finally {
  await browser?.close();
  await app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
