import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const root = await mkdtemp(path.join(tmpdir(), 'frame-report-browser-'));
let modelError = '',
  sourceId = '';
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  if (!raw.includes('Include recommendations with named owners'))
    modelError = 'Report instructions missing';
  if (
    (body.tools || []).some((t: any) =>
      ['bash', 'create_document', 'mssql_query'].includes(t.function?.name),
    )
  )
    modelError = 'Reports incorrectly requires host or SQL tools';
  const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
  const tools = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
  const call =
    tools.length === 0
      ? { name: 'reports_sources', args: { kind: 'document' } }
      : tools.length === 1
        ? {
            name: 'reports_create',
            args: {
              title: 'Regional service report',
              template: 'analytical',
              blocks: [
                {
                  type: 'markdown',
                  text: '## Summary\n\n**North** leads completed requests.\n\n## Recommendations\n\n- Owner: Operations. Review capacity monthly.',
                },
                { type: 'table', source: { kind: 'document', id: sourceId } },
              ],
            },
          }
        : null;
  const delta = call
    ? {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: randomUUID(),
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          },
        ],
      }
    : { role: 'assistant', content: 'Your branded PDF is ready.' };
  const chunk = (d: object, finish: string | null) =>
    `data: ${JSON.stringify({ id: 'report', object: 'chat.completion.chunk', created: 1, model: 'reports-test', choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(chunk(delta, null) + chunk({}, call ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n');
});
await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
const port = 31878;
const ctx = await createApp({
  dataDir: root,
  origin: `http://127.0.0.1:${port}`,
  setupToken: 'test',
  webDir: path.resolve('dist/web'),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  modelId: 'reports-test',
});
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel('Setup token').fill('test');
  await page.getByLabel('Administrator password').fill('test-password-12345');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: '⚙ Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await page.getByLabel('Enable Reports system-wide').check();
  await page.getByLabel('Organization name', { exact: true }).fill('Frame Labs');
  await expect(page.getByLabel('Report label', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Charts plugin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Charts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reports plugin', exact: true }).click();
  await expect(page.getByLabel('Organization name', { exact: true })).toHaveValue('Frame Labs');
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await expect(page.getByLabel('Confidentiality notice', { exact: true })).toHaveValue(
    'Confidential — For internal use only.',
  );
  await page
    .getByLabel('Confidentiality notice', { exact: true })
    .fill('Confidential - Frame Labs internal use.');
  await page.getByRole('button', { name: 'Instructions', exact: true }).click();
  await page
    .getByLabel('Report instructions (Markdown)')
    .fill('Include recommendations with named owners');
  await page.getByRole('button', { name: 'Save report settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Report settings saved' })).toBeVisible();
  const sampleDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download saved-design sample' }).click();
  const sample = await sampleDownload;
  await sample.saveAs(path.join(root, 'sample.pdf'));
  assert((await readFile(path.join(root, 'sample.pdf'))).subarray(0, 5).toString() === '%PDF-');
  await page.getByRole('button', { name: 'Branding', exact: true }).click();
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: path.join(path.dirname(process.env.FRAME_SCREENSHOT), 'frame-ui-reports-settings.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Report project');
  await page.getByRole('button', { name: 'Create project', exact: true }).last().click();
  const project = ctx.store.db
    .prepare('SELECT id FROM projects WHERE name=?')
    .get('Report project') as any;
  sourceId = (
    await ctx.knowledge.add(
      project.id,
      'service.csv',
      Buffer.from('Region,Requests\nNorth,180\nSouth,140'),
    )
  ).id;
  await page.getByRole('button', { name: /^Project menu:/ }).click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Enable Reports for this project').check();
  await page.getByRole('button', { name: 'Save project plugins' }).click();
  await page.getByText('Customize report design', { exact: true }).click();
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await expect(page.getByLabel('Confidentiality notice', { exact: true })).toHaveValue(
    'Confidential - Frame Labs internal use.',
  );
  await page
    .getByLabel('Confidentiality notice', { exact: true })
    .fill('Confidential - Service Review Only.');
  await page.getByRole('button', { name: 'Save report settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Report settings saved' })).toBeVisible();
  assert.equal(ctx.reports.profile(project.id).organization, 'Frame Labs');
  assert.equal(
    ctx.reports.profile(project.id).confidentialityNotice,
    'Confidential - Service Review Only.',
  );
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page
    .getByPlaceholder('Ask Frame anything about your work…')
    .fill('Create a PDF service report');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Your branded PDF is ready.', { exact: true })).toBeVisible({
    timeout: 45000,
  });
  const file = page.locator('.artifacts a').filter({ hasText: /report-.*\.pdf/ });
  await expect(file).toHaveCount(1, { timeout: 15000 });
  const response = await page.request.get(
    new URL((await file.getAttribute('href'))!, page.url()).href,
  );
  assert.equal(response.status(), 200);
  assert((await response.body()).subarray(0, 5).toString() === '%PDF-');
  await page.reload();
  await page.getByRole('button', { name: 'Create a PDF service report', exact: true }).click();
  await expect(file).toHaveCount(1);
  assert.equal(modelError, '');
  assert.deepEqual(errors, []);
  console.log(
    'Reports browser passed: plugin navigation, retained drafts, branding/instructions, sample PDF, project overrides, mobile layout, real SDK generation without host tools/MSSQL, and reload.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
