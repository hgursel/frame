import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const requests: any[] = [];
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  requests.push(JSON.parse(raw));
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'vision', object: 'chat.completion.chunk', model: 'vision', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    chunk({ role: 'assistant', content: `Image response ${requests.length}.` }) +
      chunk({}, 'stop') +
      'data: [DONE]\n\n',
  );
});
await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
const root = await mkdtemp(path.join(tmpdir(), 'frame-images-ui-'));
const port = 31883;
const ctx = await createApp({
  dataDir: root,
  origin: `http://127.0.0.1:${port}`,
  setupToken: 'test',
  webDir: path.resolve('dist/web'),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  modelId: 'vision',
});
ctx.store.createProject({ name: 'Images', instructions: '', toolsEnabled: false });
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port });
  browser = await chromium.launch({
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel('Setup token').fill('test');
  await page.getByLabel('Administrator password').fill('test-password-12345');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByLabel('Message Frame')).toBeVisible();
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 1000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#14738a';
    context.fillRect(0, 0, 3000, 1000);
    return canvas.toDataURL().split(',')[1]!;
  });
  await page.getByLabel('Upload chat images').setInputFiles({
    name: 'chart.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  });
  await expect(page.getByAltText('chart.png')).toBeVisible();
  await page.getByRole('button', { name: 'Remove image 1' }).click();
  await expect(page.getByAltText('chart.png')).toHaveCount(0);
  // Paste uses the same path as file upload and resizes a large screenshot.
  await page.getByLabel('Message Frame').evaluate((el, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, data);
  await expect(page.getByAltText('pasted.png')).toBeVisible();
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    return canvas.toDataURL('image/jpeg').split(',')[1]!;
  });
  await page
    .getByLabel('Upload chat images')
    .setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64'),
    });
  await expect(page.getByAltText('photo.jpg')).toBeVisible();

  let rejected = false;
  await page.route('**/api/conversations/*/messages', async (route) => {
    if (!rejected) {
      rejected = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Temporary test failure"}',
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary test failure');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Image response 1.', { exact: true })).toBeVisible();
  const image = page.getByAltText('Attached image 1');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2048);
  assert.equal(requests.length, 1);
  assert(JSON.stringify(requests[0]).includes('data:image/png;base64,'));
  assert(JSON.stringify(requests[0]).includes('data:image/jpeg;base64,'));
  await page.reload();
  await page
    .getByRole('button', { name: 'Please describe the attached image(s).', exact: true })
    .click();
  await expect(page.getByAltText('Attached image 1')).toBeVisible();
  await page.getByLabel('Message Frame').fill('Follow up on the picture');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Image response 2.', { exact: true })).toBeVisible();
  assert(JSON.stringify(requests[1]).includes('data:image/png;base64,'));
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({ path: process.env.FRAME_SCREENSHOT.replace('.png', '-images.png') });
  assert.deepEqual(errors, []);
  console.log(
    'Image UI passed: upload/remove, clipboard paste, resize, image-only retry, preview, reload and follow-up.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
