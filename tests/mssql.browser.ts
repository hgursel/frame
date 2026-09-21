import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { FakeSql, FakeGenerator } from './sql-fixture.js';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const driver = new FakeSql();
let schemaId = '',
  modelError = '';
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  if (raw.includes('reader-secret') || raw.includes('writer-secret'))
    modelError = 'SQL password leaked to model';
  const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
  const prompt = JSON.stringify(body.messages[lastUser]?.content);
  const turnTools = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool').length;
  let tool: { name: string; args: object } | undefined;
  if (prompt.includes('Read database'))
    tool = [
      { name: 'mssql_schema_search', args: { query: 'Table1105' } },
      { name: 'mssql_schema_read', args: { id: schemaId } },
      {
        name: 'mssql_query',
        args: { database: 'Dev', sql: 'SELECT TOP 2 id, value FROM dbo.Table1105' },
      },
    ][turnTools];
  else if (!turnTools)
    tool = {
      name: 'mssql_query',
      args: {
        database: 'Dev',
        sql: 'UPDATE dbo.Table1105 SET value=@value WHERE id=@id',
        parameters: [
          {
            name: 'value',
            type: 'text',
            value: prompt.includes('Approve') ? 'approved' : 'denied',
          },
          { name: 'id', type: 'int', value: 1 },
        ],
      },
    };
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: randomUUID(), object: 'chat.completion.chunk', created: 1, model: 'sql-test', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  if (tool)
    res.end(
      chunk({
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: randomUUID(),
            type: 'function',
            function: { name: tool.name, arguments: JSON.stringify(tool.args) },
          },
        ],
      }) +
        chunk({}, 'tool_calls') +
        'data: [DONE]\n\n',
    );
  else
    res.end(
      chunk({
        role: 'assistant',
        content: prompt.includes('Read database')
          ? 'Database read finished.'
          : prompt.includes('Approve')
            ? 'Approved operation finished.'
            : 'Denied operation finished.',
      }) +
        chunk({}, 'stop') +
        'data: [DONE]\n\n',
    );
});
await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
const root = await mkdtemp(path.join(tmpdir(), 'frame-sql-browser-'));
const port = 31877;
const ctx = await createApp({
  dataDir: root,
  origin: `http://127.0.0.1:${port}`,
  setupToken: 'sql-test',
  webDir: path.resolve('dist/web'),
  sqlDriver: driver,
  generator: new FakeGenerator(),
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  modelId: 'sql-test',
});
let browser;
try {
  await ctx.app.listen({ host: '127.0.0.1', port });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel('Setup token').fill('sql-test');
  await page.getByLabel('Administrator password').fill('sql-browser-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.locator('.sidebar-bottom').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await page.getByLabel('SQL Server host').fill('127.0.0.1');
  await page.getByLabel('Allowed databases', { exact: true }).fill('Dev');
  await page.getByLabel('read SQL username').fill('reader');
  await page.getByLabel('read SQL password').fill('reader-secret');
  await page.getByLabel('write SQL username').fill('writer');
  await page.getByLabel('write SQL password').fill('writer-secret');
  await page.getByLabel('Enable MSSQL system-wide').check();
  await page.getByLabel('Allow INSERT, UPDATE, and DELETE with approval').check();
  await page.getByRole('button', { name: 'Save MSSQL settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('MSSQL settings saved');
  assert.equal(driver.calls.length, 0, 'Saving configuration must not contact SQL Server');
  await expect(page.getByLabel('read SQL password')).toHaveValue('');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Database project');
  await page.getByRole('button', { name: 'Create project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Enable MSSQL for this project').check();
  await page.getByRole('button', { name: 'Save project plugins' }).click();
  await expect(page.getByRole('status')).toContainText('Project plugins saved');
  // Repeated saves must update the panel, including a disable/re-enable cycle.
  await page.getByLabel('Enable MSSQL for this project').uncheck();
  await page.getByRole('button', { name: 'Save project plugins' }).click();
  await expect(page.locator('.sql-knowledge')).toHaveCount(0);
  await page.getByLabel('Enable MSSQL for this project').check();
  await page.getByRole('button', { name: 'Save project plugins' }).click();
  await page.locator('.sql-knowledge summary').filter({ hasText: 'SQL schema knowledge' }).click();
  await page.getByRole('button', { name: 'Initialize database knowledge' }).click();
  await expect(
    page.locator('.sql-knowledge summary').filter({ hasText: 'SQL schema knowledge' }),
  ).toContainText('1105 objects · ready', {
    timeout: 15000,
  });
  await page.getByLabel('Search SQL schema knowledge').fill('Table1105');
  await page.getByRole('button', { name: 'Dev.dbo.Table1105' }).click();
  await expect(page.locator('.schema-preview')).toContainText('Referenced by');
  await page.locator('summary').filter({ hasText: 'Generated database knowledge' }).click();
  await page.getByRole('button', { name: 'Generate database knowledge', exact: true }).click();
  await expect(
    page.locator('summary').filter({ hasText: 'Generated database knowledge' }),
  ).toContainText('ready', { timeout: 30000 });
  await page.getByRole('button', { name: 'Dev.dbo.Table1105' }).click();
  await expect(page.locator('.schema-preview')).toContainText('not reviewed');
  await page.getByRole('button', { name: 'Mark note reviewed', exact: true }).click();
  await expect(page.locator('.schema-preview')).toContainText('sql-test, reviewed');
  await page.getByRole('button', { name: 'Reject note', exact: true }).click();
  await expect(page.locator('.schema-preview')).not.toContainText('Holds business records');
  await expect(page.getByRole('button', { name: 'Reject note', exact: true })).toHaveCount(0);

  const project = ctx.store.projects()[0];
  schemaId = ctx.mssql.schema.search(project.id, ['Dev'], 'Table1105').objects[0].id;
  const metadataCalls = driver.calls.length;
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  const send = async (text: string) => {
    await page.getByRole('textbox', { name: 'Message Frame' }).fill(text);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };
  await send('Read database');
  await page.getByText('Database read finished.', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(
    driver.calls.length,
    metadataCalls + 1,
    'The turn must read cached metadata rather than rediscover the database',
  );
  assert.equal(driver.calls.at(-1)?.login, 'read');
  await page.locator('details.tool').filter({ hasText: 'mssql_query' }).locator('summary').click();
  await expect(page.locator('.sql-result')).toContainText('hello');
  await expect(page.getByRole('link', { name: 'Download SQL results CSV' })).toBeVisible();
  await send('Approve a change');
  const approval = page.getByRole('region', { name: 'SQL change approval' });
  await expect(approval).toBeVisible({ timeout: 30000 });
  await expect(approval).toContainText('UPDATE dbo.Table1105');
  await expect(approval).toContainText('approved');
  assert.equal(driver.calls.length, metadataCalls + 1);
  await page.getByRole('button', { name: 'Approve SQL change', exact: true }).click();
  await page.getByText('Approved operation finished.', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(driver.calls.at(-1)?.login, 'write');
  await send('Deny a change');
  await expect(approval).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Deny SQL change', exact: true }).click();
  await page.getByText('Denied operation finished.', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(driver.calls.length, metadataCalls + 2);
  await send('Stop a change');
  await expect(approval).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Stop generation', exact: true }).click();
  await expect(approval).toHaveCount(0);
  assert.equal(driver.calls.length, metadataCalls + 2);
  assert.equal(modelError, '');
  assert.deepEqual(errors, []);
  console.log(
    'MSSQL browser + real SDK worker: settings, 1105-object knowledge, cached reads, result table/CSV, write approval, deny, and Stop passed.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
