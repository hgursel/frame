import { openAccountPage } from './navigation.js';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { smtpFixture } from './smtp-fixture.js';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const smtp = await smtpFixture();
const root = await mkdtemp(path.join(tmpdir(), 'frame-email-ui-'));
const origin = 'http://127.0.0.1:3195';
let step = 0;
const requests: any[] = [];
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  requests.push(b);
  const tools = [
    { name: 'email_recipients', arguments: { query: 'me' } },
    { name: 'email_outputs', arguments: {} },
    {
      name: 'email_prepare',
      arguments: {
        to: ['admin@example.com'],
        subject: 'Weekly report',
        body: 'Here is your generated report.',
        attachments: ['report.pdf'],
      },
    },
  ];
  const next = tools[step++];
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    `data: ${JSON.stringify({ id: 'email', choices: [{ index: 0, delta: next ? { tool_calls: [{ index: 0, id: 'email-' + step, type: 'function', function: { name: next.name, arguments: JSON.stringify(next.arguments) } }] } : { content: 'Your email draft is ready for review. Nothing has been sent.' }, finish_reason: next ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const ctx = await createApp({
  dataDir: root,
  origin,
  setupToken: 'email-ui',
  webDir: path.resolve('dist/web'),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  modelId: 'local',
});
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port: 3195 });
  browser = await chromium.launch({
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Setup token').fill('email-ui');
  await page.getByLabel('Password').fill('email-browser-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await openAccountPage(page, 'Admin');
  await page.getByRole('tab', { name: 'Users', exact: true }).click();
  const admin = page
    .locator('.auth-card')
    .filter({ has: page.getByText('admin', { exact: true }) });
  await admin.getByLabel('Display name', { exact: true }).fill('Hakan Gursel');
  await admin.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await admin.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.locator('.sidebar-user strong')).toHaveText('Hakan Gursel');
  await expect(page.locator('.user-avatar')).toHaveText('HG');
  await page.getByRole('tab', { name: 'Email', exact: true }).click();
  await page.getByLabel('Enable email in all projects').check();
  await page.getByLabel('SMTP host').fill('127.0.0.1');
  await page.getByLabel('SMTP port').fill(String(smtp.port));
  await page.getByLabel('Encryption').selectOption('none');
  await page.getByLabel('Sender email').fill('no-reply@example.com');
  await page.getByLabel('Approved recipient domains').fill('example.com');
  await page.getByRole('button', { name: 'Save email settings' }).click();
  await expect(page.getByText('Email settings saved.', { exact: true })).toBeVisible();
  assert.equal(smtp.connections, 0);
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-email-settings.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Test saved connection', exact: true }).click();
  await expect(page.getByText('SMTP connection verified. No email was sent.')).toBeVisible();
  assert.equal(smtp.messages.length, 0);
  const project = ctx.store.projects()[0];
  const chat = ctx.store.createConversation(project.id);
  ctx.store.db.prepare('UPDATE conversations SET title=? WHERE id=?').run('Email review', chat.id);
  await mkdir(ctx.store.artifacts(chat), { recursive: true });
  await writeFile(
    path.join(ctx.store.artifacts(chat), 'report.pdf'),
    '%PDF-1.4\nLocal generated report fixture',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Email review', exact: true }).click();
  await page.getByLabel('Message Frame').fill('Email the generated report to me.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const card = page.locator('.email-card');
  await expect(card.getByRole('button', { name: 'Send email', exact: true })).toBeVisible({
    timeout: 25000,
  });
  await expect(page.getByRole('button', { name: 'Stop generation' })).toHaveCount(0, {
    timeout: 25000,
  });
  assert.equal(smtp.messages.length, 0);
  await expect(card).toContainText('admin@example.com');
  await expect(card).toContainText('report.pdf');
  await card.getByRole('button', { name: 'Edit draft' }).click();
  await card.getByLabel('To', { exact: true }).fill('outsider@evil.com');
  await card.getByRole('button', { name: 'Save draft for review' }).click();
  await expect(card.getByRole('alert')).toContainText('admin-approved');
  assert.equal(smtp.messages.length, 0);
  await card.getByLabel('To', { exact: true }).fill('admin@example.com, teammate@example.com');
  await card.getByLabel('Subject', { exact: true }).fill('Reviewed weekly report');
  await card.getByRole('button', { name: 'Save draft for review' }).click();
  await expect(card.getByRole('button', { name: 'Send email' })).toBeVisible();
  assert.equal(smtp.messages.length, 0);
  await page.reload();
  await page.getByRole('button', { name: 'Email review', exact: true }).click();
  await expect(card).toContainText('Reviewed weekly report');
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-email-desktop.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  const close = page.getByRole('button', { name: 'Close navigation', exact: true });
  if (await close.isVisible()) await close.click({ position: { x: 375, y: 400 } });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await card.getByRole('button', { name: 'Send email' }).scrollIntoViewIfNeeded();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-email-review.png'),
      fullPage: true,
    });
  const id = ctx.email.list(chat.id)[0].id;
  await card.getByRole('button', { name: 'Send email' }).click();
  await expect(card.locator('summary')).toContainText('Accepted by SMTP');
  assert.equal(smtp.messages.length, 1);
  assert.match(smtp.messages[0]!, /teammate@example.com/);
  assert.match(smtp.messages[0]!, /Reviewed weekly report/);
  await page.reload();
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Email review', exact: true }).click();
  await expect(card.locator('summary')).toContainText('Accepted by SMTP');
  const duplicate = await page.evaluate(
    async ({ chat, id }) => {
      const r = await fetch(`/api/conversations/${chat}/emails/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 2 }),
      });
      return r.json();
    },
    { chat: chat.id, id },
  );
  assert.equal(duplicate.status, 'accepted');
  assert.equal(smtp.messages.length, 1);
  await ctx.email.prepare(chat.id, {
    to: ['admin@example.com'],
    subject: 'Cancel example',
    body: 'Do not send this.',
    attachments: [],
  });
  await expect(page.getByRole('button', { name: 'Cancel email' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel email' }).click();
  await expect(page.locator('.email-card').last().locator('summary')).toContainText('cancelled');
  assert.equal(smtp.messages.length, 1);
  assert.deepEqual(errors, []);
  assert(requests.length >= 4);
  console.log(
    'Email browser passed: admin SMTP/profile settings, display name, real SDK recipient/output lookup and draft, edit/review, domain restrictions, generated attachment, mobile, confirmation, reload, duplicate prevention and cancellation. Only local SMTP capture was used.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await smtp.close();
  await rm(root, { recursive: true, force: true });
}
