import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const requests: any[] = [];
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  requests.push(body);
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'workspace', object: 'chat.completion.chunk', model: 'local', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const last = body.messages.at(-1);
  if (last.role !== 'tool' && !JSON.stringify(last.content).includes('Follow up')) {
    res.end(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: `ask-${requests.length}`,
            type: 'function',
            function: {
              name: 'ask_user_question',
              arguments: JSON.stringify({
                questions: [
                  {
                    id: 'format',
                    header: 'Format',
                    question: 'Which output format?',
                    options: [
                      { label: 'PDF', description: 'A report for sharing.' },
                      { label: 'Text', description: 'A plain text file.' },
                    ],
                  },
                  {
                    id: 'include',
                    header: 'Contents',
                    question: 'What should I include?',
                    multiple: true,
                    options: [{ label: 'Summary' }, { label: 'Details' }],
                  },
                ],
              }),
            },
          },
        ],
      }) +
        chunk({}, 'tool_calls') +
        'data: [DONE]\n\n',
    );
  } else {
    const id = [...ctx.runner.active.keys()][0]!;
    const root = ctx.store.artifacts(ctx.store.conversation(id)!);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'result.txt'), 'Conversation output.');
    res.end(
      chunk({
        content: last.role === 'tool' ? 'Your choices were received.' : 'Follow-up complete.',
      }) +
        chunk({}, 'stop') +
        'data: [DONE]\n\n',
    );
  }
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const root = await mkdtemp(path.join(tmpdir(), 'frame-workspace-ui-'));
const port = 31884;
const ctx = await createApp({
  dataDir: root,
  origin: `http://127.0.0.1:${port}`,
  setupToken: 'test',
  webDir: path.resolve('dist/web'),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  modelId: 'local',
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
});
const project = ctx.store.createProject({
  name: 'Workspace',
  instructions: '',
  toolsEnabled: false,
});
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port });
  browser = await chromium.launch({
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel('Setup token').fill('test');
  await page.getByLabel('Administrator password').fill('test-password-12345');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByLabel('Upload chat files')).toBeEnabled();
  await page.getByLabel('Upload chat files').setInputFiles({
    name: 'chat-only.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Private local file: cobalt.'),
  });
  await expect(page.locator('.composer-attachments')).toContainText('chat-only.txt');
  assert.equal(ctx.knowledge.list(project.id).length, 0);
  await page.getByLabel('Message Frame').fill('Ask before writing');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Questions from Frame' })).toBeVisible();
  assert.equal(requests.length, 1);
  assert(JSON.stringify(requests[0].messages).includes('cobalt'));
  await page.reload();
  await page.getByRole('button', { name: 'Ask before writing', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Questions from Frame' })).toBeVisible();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-questions.png'),
      fullPage: true,
    });
  await page.getByRole('radio', { name: 'Text A plain text file.' }).check();
  await page.getByLabel('Your answer or notes: Format').fill('Keep it concise.');
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('checkbox', { name: 'Summary', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Details', exact: true }).check();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText('Your choices were received.', { exact: true })).toBeVisible();
  assert.equal(requests.length, 2);
  assert(JSON.stringify(requests[1].messages).includes('Keep it concise.'));
  await page.getByRole('button', { name: 'Outputs and sources' }).click();
  const panel = page.getByRole('complementary', { name: 'Outputs and sources' });
  await expect(panel.getByRole('link', { name: '↓ result.txt' })).toBeVisible();
  await expect(panel.getByText('Only in this conversation')).toBeVisible();
  assert.equal(await page.locator('.conversation .artifacts').count(), 0);
  const download = page.waitForEvent('download');
  await panel.getByRole('link', { name: '↓ result.txt' }).click();
  await download;
  const fileDownload = page.waitForEvent('download');
  await panel.getByRole('link', { name: '▤ chat-only.txt' }).click();
  await fileDownload;
  await panel.getByRole('button', { name: 'Add to project knowledge' }).click();
  await expect(panel.getByRole('button', { name: 'Added to knowledge ✓' })).toBeVisible();
  assert.equal(ctx.knowledge.list(project.id).length, 1);
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-workspace.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Close outputs and sources' }).click();
  await page.getByLabel('Message Frame').fill('Follow up');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Follow-up complete.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = page.getByRole('button', { name: 'Close navigation', exact: true });
  if (await navigation.isVisible()) await navigation.click({ position: { x: 370, y: 400 } });
  await page.getByRole('button', { name: 'Outputs and sources' }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Added to knowledge ✓' })).toBeVisible();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-workspace-mobile.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Close outputs and sources' }).click();
  await page.getByLabel('Message Frame').fill('Ask again');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Questions from Frame' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel questions' }).click();
  await expect(page.getByRole('region', { name: 'Questions from Frame' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
  await page.getByLabel('Message Frame').fill('Ask then stop');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Questions from Frame' })).toBeVisible();
  const callsBeforeStop = requests.length;
  await page.getByRole('button', { name: 'Stop generation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Questions from Frame' })).toHaveCount(0);
  assert.equal(requests.length, callsBeforeStop, 'Stopping a question must not continue the model');
  assert.deepEqual(errors, []);
  console.log(
    'Workspace browser passed: chat uploads, refresh while waiting, multiple/custom answers, output/source downloads, explicit promotion, follow-up and mobile panel.',
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    console.error((await page.locator('body').innerText()).slice(-5000));
    if (process.env.FRAME_SCREENSHOT)
      await page.screenshot({
        path: process.env.FRAME_SCREENSHOT.replace('.png', '-workspace-failure.png'),
        fullPage: true,
      });
  }
  throw error;
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await rm(root, { recursive: true, force: true });
}
