import { chromium, expect as baseExpect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { smtpFixture } from './smtp-fixture.js';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const expect = baseExpect.configure({ timeout: 20000 });
const smtp = await smtpFixture();
const root = await mkdtemp(path.join(tmpdir(), 'frame-scheduled-ui-'));
const origin = 'http://127.0.0.1:3198';
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  const scheduled = body.tools?.some((t: any) => t.function.name === 'scheduled_email');
  const already = body.messages.some((m: any) => m.role === 'tool');
  const tool = already
    ? undefined
    : scheduled
      ? {
          name: 'scheduled_email',
          args: {
            subject: 'Weekly update',
            body: 'Your weekly analysis is complete.',
            attachments: [],
          },
        }
      : {
          name: 'schedule_task',
          args: {
            title: 'Weekly analysis',
            instructions: 'Analyze current project knowledge and email me a summary.',
            timing: { kind: 'weekly', weekday: 1, time: '07:00' },
            recipients: ['admin@example.com'],
            attachments: 'none',
          },
        };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    `data: ${JSON.stringify({ id: 'scheduled', choices: [{ index: 0, delta: tool ? { tool_calls: [{ index: 0, id: 'schedule-call', type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } : { content: scheduled ? 'Your weekly analysis is complete.' : 'Review your scheduled task and click Activate.' }, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const ctx = await createApp({
  dataDir: root,
  origin,
  setupToken: 'scheduled-ui',
  webDir: path.resolve('dist/web'),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  modelId: 'local',
});
ctx.email.save({
  enabled: true,
  host: '127.0.0.1',
  port: smtp.port,
  security: 'none',
  username: '',
  fromName: 'Frame',
  fromEmail: 'no-reply@example.com',
  domains: ['example.com'],
});
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port: 3198 });
  browser = await chromium.launch({
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Setup token').fill('scheduled-ui');
  await page.getByLabel('Password').fill('scheduled-browser-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: '⚙ Settings' }).click();
  await page.getByRole('tab', { name: 'Scheduled', exact: true }).click();
  await page.getByLabel('Schedule timezone').selectOption('America/Los_Angeles');
  await page.getByRole('button', { name: 'Save schedule timezone' }).click();
  await expect(page.getByText('Timezone saved. Changed schedules need activation.')).toBeVisible();
  const project = ctx.store.projects()[0];
  const chat = ctx.store.createConversation(project.id);
  ctx.store.db
    .prepare('UPDATE conversations SET title=? WHERE id=?')
    .run('Schedule a summary', chat.id);
  await page.reload();
  await page.getByRole('button', { name: 'Schedule a summary', exact: true }).click();
  const input = page.locator('textarea').last();
  await input.fill('Every Monday at 7 AM, summarize the project and email admin@example.com.');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
  await expect(page.getByText('Needs activation', { exact: true })).toBeVisible();
  assert.equal(smtp.messages.length, 0);
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.locator('.scheduled-state')).toHaveText('active');
  await page.getByRole('button', { name: '◷ Scheduled', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scheduled', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weekly analysis', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run now', exact: true }).click();
  await expect(page.getByText('Your weekly analysis is complete.', { exact: true })).toBeVisible();
  await expect.poll(() => smtp.messages.length).toBe(1);
  await expect(page.getByText(/Email to admin@example.com: Accepted by SMTP/)).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.scheduled-state')).toHaveText('paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.scheduled-state')).toHaveText('active');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Task instructions')
    .fill('Analyze current data and email a concise summary.');
  await page.getByRole('button', { name: 'Save for review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.locator('.scheduled-state')).toHaveText('active');
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-scheduled.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Weekly analysis', exact: true })).toBeVisible();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Your next task, already planned.')).toBeVisible();
  assert.equal(ctx.store.conversations().filter((c: any) => c.scheduled).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    'Scheduled browser test passed: chat review, timezone, activation, automatic email, results, pause/resume, edit/reactivate, deletion, mobile layout.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  await smtp.close();
  await new Promise<void>((r) => model.close(() => r()));
  await rm(root, { recursive: true, force: true });
}
