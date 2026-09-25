import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  if (prompt.includes('Visualize ')) {
    if ((body.tools || []).some((t: any) => t.function?.name?.startsWith('mssql_')))
      modelError = 'MSSQL tools present in non-SQL chart test';
    const mode = prompt.includes('Visualize CSV')
      ? 'CSV'
      : prompt.includes('Visualize page')
        ? 'page'
        : 'chat';
    const results = body.messages
      .slice(lastUser + 1)
      .filter((m: any) => m.role === 'tool')
      .map((m: any) =>
        JSON.parse(
          typeof m.content === 'string' ? m.content : m.content.map((p: any) => p.text).join(''),
        ),
      );
    if (!turnTools)
      tool = { name: 'charts_sources', args: { kind: mode === 'chat' ? 'message' : 'document' } };
    else if (turnTools === 1) {
      const source =
        mode === 'chat'
          ? results[0].sources[0]
          : results[0].sources.find(
              (s: any) => s.name === (mode === 'CSV' ? 'chart-input.csv' : 'chart-input.md'),
            );
      tool = { name: 'charts_import', args: { kind: source.kind, id: source.id } };
    } else if (turnTools === 2)
      tool = {
        name: 'charts_transform',
        args: {
          datasetId: results[1].datasetId,
          groupBy: ['Region'],
          measures: [{ column: 'Amount', operation: 'sum', as: 'Total' }],
          sort: [{ column: 'Total', direction: 'desc', numeric: true }],
        },
      };
    else if (turnTools === 3)
      tool = {
        name: 'charts_create',
        args: {
          datasetId: results[2].datasetId,
          kind: 'bar',
          title: `${mode} totals`,
          x: 'Region',
          y: ['Total'],
        },
      };
  } else if (prompt.includes('Read database'))
    tool = [
      { name: 'mssql_schema_search', args: { query: 'Table1105' } },
      { name: 'mssql_schema_read', args: { id: schemaId } },
      {
        name: 'mssql_query',
        args: { database: 'Dev', sql: 'SELECT TOP 2 id, value FROM dbo.Table1105' },
      },
    ][turnTools];
  else if (prompt.includes('Chart ')) {
    const saved = prompt.includes('Chart saved');
    const kind = saved
      ? 'bar'
      : ['bar', 'line', 'pie', 'scatter'].find((v) => prompt.includes('Chart ' + v))!;
    if (turnTools === 0)
      tool = saved
        ? { name: 'charts_datasets', args: {} }
        : {
            name: 'mssql_query',
            args: { database: 'Dev', sql: 'SELECT id, value FROM dbo.Table1105' },
          };
    else if (turnTools === 1) {
      const resultMessage = body.messages.slice(lastUser + 1).find((m: any) => m.role === 'tool');
      const result = JSON.parse(
        typeof resultMessage.content === 'string'
          ? resultMessage.content
          : resultMessage.content.map((v: any) => v.text).join(''),
      );
      tool = {
        name: 'charts_create',
        args: {
          datasetId: saved ? result[0].datasetId : result.datasetId,
          kind,
          title: saved ? 'SQL saved' : `SQL ${kind}`,
          x: kind === 'scatter' ? 'id' : 'value',
          y: ['id'],
          donut: kind === 'pie',
        },
      };
    }
  } else if (!turnTools)
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
        content: prompt.includes('Visualize ')
          ? 'Local chart ready.'
          : prompt.includes('Chart ')
            ? 'Chart ready.'
            : prompt.includes('Read database')
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
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel('Setup token').fill('sql-test');
  await page.getByLabel('Administrator password').fill('sql-browser-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.locator('.sidebar-bottom').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await page.getByRole('button', { name: 'Charts plugin', exact: true }).click();
  await page.getByLabel('Enable Charts system-wide').check();
  await page.getByRole('button', { name: 'Save Charts settings' }).click();
  await expect(page.getByText('Charts settings saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'MSSQL plugin', exact: true }).click();
  await page.getByLabel('SQL Server host').fill('127.0.0.1');
  await page.getByLabel('Allowed databases', { exact: true }).fill('Dev');
  await page.getByLabel('read SQL username').fill('reader');
  await page.getByLabel('read SQL password').fill('reader-secret');
  await page.getByLabel('write SQL username').fill('writer');
  await page.getByLabel('write SQL password').fill('writer-secret');
  await page.getByLabel('Enable MSSQL system-wide').check();
  await page.getByLabel('Allow INSERT, UPDATE, and DELETE with approval').check();
  await page.getByRole('button', { name: 'Save MSSQL settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'MSSQL settings saved' })).toBeVisible();
  assert.equal(driver.calls.length, 0, 'Saving configuration must not contact SQL Server');
  await expect(page.getByLabel('read SQL password')).toHaveValue('');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Database project');
  await page.getByRole('button', { name: 'Create project', exact: true }).last().click();
  await page.getByRole('button', { name: /^Project menu:/ }).click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Enable MSSQL for this project').check();
  await page.getByLabel('Enable Charts for this project').check();
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
  await expect(
    page
      .locator('.sql-knowledge')
      .filter({ hasText: 'Generated database knowledge' })
      .getByRole('status'),
  ).toContainText('Completed');
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
  await page
    .locator('details.tool')
    .filter({ hasText: 'Run SQL query' })
    .locator('summary')
    .click();
  await expect(page.locator('.sql-result')).toContainText('hello');
  await expect(page.getByRole('link', { name: 'Download SQL results CSV' })).toBeVisible();
  await expect(page.locator('.artifacts a')).toHaveCount(0);
  const queryDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download SQL results CSV' }).click();
  assert.match((await queryDownload).suggestedFilename(), /^sql-.*\.csv$/);

  await expect(page.locator('.chart-card')).toHaveCount(0);
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
  for (const [i, kind] of ['bar', 'line', 'pie', 'scatter'].entries()) {
    await send(`Chart ${kind}`);
    const card = page.getByRole('figure', { name: `SQL ${kind}`, exact: true });
    await expect(card.locator('.chart-plot > svg')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Chart ready.', { exact: true })).toHaveCount(i + 1, {
      timeout: 30000,
    });
    await expect(card.locator('figcaption strong')).toHaveText(`SQL ${kind}`);
    await expect(card.locator('svg text').filter({ hasText: `SQL ${kind}` })).toHaveCount(0);
    await expect(card).not.toContainText('SQL snapshot');
    await expect(card).not.toContainText('Hover or focus a point');
    await expect(card.getByRole('button', { name: 'Download PNG' })).toHaveCount(0);
    await card.locator('svg [tabindex="0"]').first().hover();
    await expect(card.locator('.chart-hover')).not.toHaveText('');
    const toggle = card.getByRole('button', {
      name: kind === 'pie' ? 'Toggle hello' : 'Toggle id',
      exact: true,
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await card.getByRole('button', { name: 'Expand chart' }).click();
    await expect(page.getByRole('dialog', { name: 'Expanded chart' })).toBeVisible();
    await page.getByRole('button', { name: 'Close chart' }).click();
    await card.getByText('View chart data', { exact: true }).click();
    await expect(card.locator('tbody tr')).toHaveCount(2);
    await card.getByRole('button', { name: 'Expand chart' }).click();
    const dialog = page.getByRole('dialog', { name: 'Expanded chart' });
    await dialog.locator('.chart-plot svg').click({ position: { x: 15, y: 15 } });
    await expect(dialog).toBeVisible();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PNG' }).click();
    const file = await download;
    const imageDir = path.dirname(
      process.env.FRAME_SCREENSHOT || path.join(tmpdir(), 'frame-ui.png'),
    );
    await mkdir(imageDir, { recursive: true });
    await file.saveAs(path.join(imageDir, `frame-ui-chart-${kind}.png`));
    const png = await readFile(path.join(imageDir, `frame-ui-chart-${kind}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const csvDownload = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Download chart CSV' }).click();
    const csv = await csvDownload;
    assert.match(csv.suggestedFilename(), /chart-.*\.csv$/);
    // Backdrop closes; clicks inside the plot do not. Escape and the icon also work.
    await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Expand chart' })).toBeFocused();
    await card.getByRole('button', { name: 'Expand chart' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    if (kind === 'bar') {
      await card.screenshot({ path: path.join(imageDir, 'frame-ui-chart-desktop.png') });
      if (
        (await page
          .getByRole('button', { name: 'Toggle navigation' })
          .getAttribute('aria-expanded')) === 'true'
      )
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await card.screenshot({ path: path.join(imageDir, 'frame-ui-chart-mobile.png') });
      assert((await card.evaluate((el) => el.getBoundingClientRect().width)) <= 390);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  const calls = driver.calls.length;
  await send('Chart saved results');
  await expect(
    page.getByRole('figure', { name: 'SQL saved', exact: true }).locator('.chart-plot > svg'),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Chart ready.', { exact: true })).toHaveCount(5, { timeout: 30000 });
  assert.equal(driver.calls.length, calls, 'Reusing a dataset must not execute SQL');
  const conversation = ctx.store.conversations()[0];
  await writeFile(
    path.join(ctx.store.artifacts(conversation), 'requested-report.csv'),
    'month,revenue\nJan,100',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Read database', exact: true }).click();
  await expect(page.locator('.chart-card')).toHaveCount(5, { timeout: 15000 });
  await expect(
    page.getByRole('figure', { name: 'SQL scatter', exact: true }).locator('.chart-plot > svg'),
  ).toBeVisible();
  assert.equal(driver.calls.length, calls, 'Reloading charts must not re-execute SQL');
  await expect(page.locator('.artifacts a')).toHaveCount(1);
  await expect(page.locator('.artifacts a')).toContainText('requested-report.csv');
  const firstQuery = page.locator('details.tool').filter({ hasText: 'Run SQL query' }).first();
  await firstQuery.locator('summary').click();
  await expect(firstQuery.getByRole('link', { name: 'Download SQL results CSV' })).toBeVisible();

  ctx.mssql.setProject(conversation.projectId, false);
  const md = '| Region | Amount |\n|---|---|\n|North|2|\n|North|3|\n|South|4|';
  await ctx.knowledge.add(
    conversation.projectId,
    'chart-input.csv',
    Buffer.from('Region,Amount\nNorth,2\nNorth,3\nSouth,4'),
  );
  await ctx.knowledge.add(conversation.projectId, 'chart-input.md', Buffer.from(md));
  for (const mode of ['CSV', 'page', 'chat']) {
    await send(`Visualize ${mode} totals${mode === 'chat' ? '\n\n' + md : ''}`);
    const card = page.getByRole('figure', { name: `${mode} totals`, exact: true });
    await expect(card.locator('.chart-plot > svg')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Stop generation', exact: true })).toHaveCount(
      0,
      { timeout: 30000 },
    );
    await card.getByText('View chart data', { exact: true }).click();
    await expect(card.locator('tbody tr')).toHaveText(['North5', 'South4']);
  }
  assert.equal(driver.calls.length, calls, 'File/chat calculations must not execute SQL');
  await page.reload();
  await page.getByRole('button', { name: 'Read database', exact: true }).click();
  await expect(page.locator('.chart-card')).toHaveCount(8, { timeout: 15000 });

  assert.equal(modelError, '');
  assert.deepEqual(errors, []);
  console.log(
    'MSSQL browser + real SDK worker: settings, 1105-object knowledge, cached reads, result table/CSV, write approval, deny, Stop, and interactive SQL charts with PNG/CSV exports and reload passed.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
