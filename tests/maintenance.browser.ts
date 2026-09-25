import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const model = createServer(async (req, res) => {
  for await (const _ of req) {
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    'data: ' +
      JSON.stringify({
        id: 'test',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Temporary response.' },
            finish_reason: null,
          },
        ],
      }) +
      '\n\ndata: ' +
      JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const root = await mkdtemp(path.join(tmpdir(), 'frame-maintenance-browser-'));
const origin = 'http://127.0.0.1:31879';
const ctx = await createApp({
  dataDir: root,
  origin,
  setupToken: 'maintenance-test',
  webDir: path.resolve('dist/web'),
  generator: {
    complete: async () =>
      JSON.stringify({
        title: 'Change Approval',
        text: 'Check change approval before maintenance. Record the recovery plan.',
        discovery: {
          description: 'Use before maintenance to check change approval.',
          tags: ['maintenance'],
          aliases: ['change preparation'],
          category: 'procedure',
        },
      }),
  },
});
const project = ctx.store.createProject({
  name: 'Operations',
  instructions: '',
  toolsEnabled: true,
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  modelId: 'local-test',
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
});
const c = ctx.store.createConversation(project.id);
await writeFile(
  ctx.store.sessionFile(c.id),
  JSON.stringify({
    id: 'entry-one',
    parentId: null,
    type: 'message',
    message: {
      role: 'user',
      content: 'Always check change approval before maintenance and record the recovery plan.',
    },
  }) + '\n',
);
ctx.store.db
  .prepare('INSERT INTO runs VALUES (?,?,?,?,?)')
  .run('finished-run', c.id, 'completed', null, Date.now());
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await ctx.app.listen({ host: '127.0.0.1', port: 31879 });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Setup token').fill('maintenance-test');
  await page.getByLabel('Administrator password').fill('maintenance-test-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Settings', exact: false }).click();
  await page.getByRole('tab', { name: 'Knowledge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge maintenance' })).toBeVisible();
  await page.getByLabel('Daily start time').fill('02:00');
  await page.getByLabel('Maintenance timezone').selectOption('America/Los_Angeles');
  await expect(page.getByLabel('Maintenance timezone')).toHaveValue('America/Los_Angeles');
  await page.getByLabel('Operations', { exact: true }).check();
  await page.getByLabel('Publishing policy').selectOption('review');
  await page.getByRole('button', { name: 'Save maintenance settings' }).click();
  await expect(page.getByRole('status')).toContainText('Maintenance settings saved');
  await page.getByRole('button', { name: 'Run maintenance now' }).click();
  await expect(page.locator('.maintenance-draft summary')).toContainText('Change Approval', {
    timeout: 15000,
  });
  assert.equal(
    ctx.knowledge.list(project.id).length,
    0,
    'Drafts are excluded from active knowledge',
  );
  await page.locator('.maintenance-draft summary').click();
  await expect(page.locator('.maintenance-draft')).toContainText('recovery plan');
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-maintenance.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Publish unreviewed', exact: true }).click();
  await expect(page.locator('.maintenance-draft')).toHaveCount(0);
  const doc = ctx.knowledge.list(project.id)[0]!;
  assert(doc);
  assert.equal(ctx.wiki.metadata(doc.id).verified, undefined);
  await page.getByLabel('Project menu: Operations').click();
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.getByRole('button', { name: 'Change Approval.md', exact: false }).click();
  await page.locator('.knowledge-metadata summary').click();
  await page
    .getByLabel('Knowledge description')
    .fill('Use for maintenance approval and rollback planning.');
  await page.getByLabel('Tags (comma separated)').fill('maintenance,approval');
  await page.getByRole('button', { name: 'Save discovery metadata' }).click();
  await expect
    .poll(() => ctx.wiki.metadata(doc.id).description)
    .toBe('Use for maintenance approval and rollback planning.');
  await page
    .getByRole('navigation', { name: 'Projects', exact: true })
    .locator('.project-link')
    .click();
  const privacy = page.getByRole('button', { name: 'Incognito chat', exact: true });
  await expect(page.locator('.sidebar').getByRole('button', { name: /incognito/i })).toHaveCount(0);
  await expect(
    page.locator('header').getByRole('button', { name: 'Incognito chat', exact: true }),
  ).toBeVisible();
  await expect(privacy).toBeEnabled();
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Private temporary request');
  await privacy.click();
  await expect(privacy).toHaveAttribute('aria-pressed', 'true');
  await expect(privacy).toBeEnabled();
  await privacy.click();
  await expect(privacy).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('textbox', { name: 'Message Frame' })).toHaveValue(
    'Private temporary request',
  );
  await expect(privacy).toBeEnabled();
  await privacy.click();
  await expect(page.locator('.incognito-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Add attachments' }).click();
  await expect(
    page.getByRole('button', { name: 'Upload from computer', exact: false }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Add attachments' }).click();
  await page.getByRole('textbox', { name: 'Message Frame' }).fill('Private temporary request');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(privacy).toBeDisabled();
  await expect(page.getByText('Temporary response.', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
  await expect(privacy).toBeDisabled();
  const temporary = ctx.store.conversations().find((x: any) => x.incognito)!;
  assert(temporary);
  assert(!existsSync(ctx.store.sessionFile(temporary.id)));
  await expect(page.locator('.response-turn .save-knowledge')).toHaveCount(0);
  const history = await page.evaluate(async () => await (await fetch('/api/conversations')).json());
  assert(!history.some((x: any) => x.id === temporary.id));
  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = page.getByRole('button', { name: 'Close navigation', exact: true });
  if (await drawer.isVisible()) await drawer.click({ position: { x: 370, y: 400 } });
  await expect(page.getByRole('button', { name: 'End chat', exact: true })).toBeVisible();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-incognito.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'End chat', exact: true }).click();
  await expect.poll(() => ctx.store.conversation(temporary.id)).toBeUndefined();
  await expect(privacy).toBeEnabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Conversations', exact: true })
    .getByRole('button', { name: 'New conversation', exact: true })
    .last()
    .click();
  await expect(
    page.getByText(
      'Always check change approval before maintenance and record the recovery plan.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(privacy).toBeDisabled();
  await page.reload();
  // Reload starts at the empty composer; reopening the saved conversation still locks privacy.
  await page
    .getByRole('navigation', { name: 'Conversations', exact: true })
    .getByRole('button', { name: 'New conversation', exact: true })
    .last()
    .click();
  await expect(privacy).toBeDisabled();
  assert.deepEqual(errors, []);
  console.log(
    'Maintenance browser passed: Settings, review policy, run/draft publication, metadata editing, incognito history exclusion, temporary SDK chat, and mobile cleanup.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  await new Promise<void>((r) => model.close(() => r()));
  await rm(root, { recursive: true, force: true });
}
