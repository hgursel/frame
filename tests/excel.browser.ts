// Simulated Office host only. Real Windows Excel/WebView acceptance is documented separately.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { randomUUID } from 'node:crypto';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
const root = await mkdtemp(path.join(tmpdir(), 'frame-excel-browser-'));
let changes: any = {
  summary: 'Fix the total',
  target: 'selection',
  values: [
    ['Value', 'Total'],
    [2, null],
  ],
  formulas: [{ row: 1, column: 1, formula: '=A2*3' }],
};
let calls = 0;
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  calls++;
  const tool = b.messages.at(-1).role !== 'tool';
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const delta = tool
    ? {
        tool_calls: [
          {
            index: 0,
            id: `excel-${calls}`,
            type: 'function',
            function: { name: 'excel_propose_changes', arguments: JSON.stringify(changes) },
          },
        ],
      }
    : { content: 'The preview is ready. Review and Apply when you are ready.' };
  res.end(
    `data: ${JSON.stringify({ id: 'excel', choices: [{ index: 0, delta, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-days',
    '1',
    '-keyout',
    path.join(root, 'key.pem'),
    '-out',
    path.join(root, 'cert.pem'),
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ],
  { stdio: 'ignore' },
);
let upstream = 0;
const proxy = createHttpsServer(
  {
    key: await readFile(path.join(root, 'key.pem')),
    cert: await readFile(path.join(root, 'cert.pem')),
  },
  (req, res) => {
    const forward = request(
      {
        hostname: '127.0.0.1',
        port: upstream,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode!, response.headers);
        response.pipe(res);
      },
    );
    forward.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(forward);
  },
);
await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
const origin = `https://127.0.0.1:${(proxy.address() as any).port}`;
const ctx = await createApp({
  dataDir: path.join(root, 'data'),
  origin,
  setupToken: 'excel-browser',
  webDir: path.resolve('dist/web'),
});
await ctx.app.listen({ host: '127.0.0.1', port: 0 });
upstream = ctx.app.server.address().port;
const project = ctx.store.createProject({
  name: 'Excel pilot',
  instructions: '',
  toolsEnabled: true,
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  modelId: 'local',
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 400, height: 900 },
  });
  await context.request.post(`${origin}/api/auth/setup`, {
    headers: { origin },
    data: { token: 'excel-browser', password: 'excel-browser-password' },
  });
  await context.route('https://officeapis.public.onecdn.static.microsoft/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: '// Office host is simulated for this test.',
    }),
  );
  const officeMock = () => {
    const w = window as any;
    const fake: any = {
      writes: [],
      protected: false,
      merged: false,
      spill: false,
      table: false,
      failWrite: false,
      writesUntilFailure: null,
      sheets: [],
    };
    const sheet = (id: string, name: string, values: any[][]) => {
      const s: any = {
        id,
        name,
        values,
        formulas: structuredClone(values),
        formats: values.map((r) => r.map(() => 'General')),
        load() {},
        protection: {
          load() {},
          get protected() {
            return fake.protected;
          },
        },
        activate() {
          fake.active = id;
        },
        tables: {
          add() {
            fake.writes.push('table');
          },
        },
        charts: {
          add() {
            fake.writes.push('chart');
            return { title: {}, setPosition() {} };
          },
        },
      };
      const range = (row: number, col: number, rows: number, cols: number): any => ({
        worksheet: s,
        rowIndex: row,
        columnIndex: col,
        rowCount: rows,
        columnCount: cols,
        address: `${s.name}!A1:B2`,
        load() {},
        get values() {
          return structuredClone(
            s.values.slice(row, row + rows).map((r: any[]) => r.slice(col, col + cols)),
          );
        },
        get formulas() {
          return structuredClone(
            s.formulas.slice(row, row + rows).map((r: any[]) => r.slice(col, col + cols)),
          );
        },
        get numberFormat() {
          return structuredClone(
            s.formats.slice(row, row + rows).map((r: any[]) => r.slice(col, col + cols)),
          );
        },
        get hasSpill() {
          return fake.spill;
        },
        getMergedAreasOrNullObject() {
          return { isNullObject: !fake.merged };
        },
        getTables() {
          return { load() {}, items: fake.table ? [{ name: 'Existing' }] : [] };
        },
        set valuesAsJson(v: any[][]) {
          fake.writes.push({ id, values: v });
          if (fake.failWrite) throw new Error('Simulated write failure');
          if (fake.writesUntilFailure !== null && fake.writesUntilFailure-- === 0)
            throw new Error('Simulated interruption after a completed block');
          for (let r = 0; r < v.length; r++) {
            s.values[row + r] ||= [];
            s.formulas[row + r] ||= [];
            s.formats[row + r] ||= [];
            for (let c = 0; c < v[r]!.length; c++) {
              s.values[row + r][col + c] = v[r]![c].basicValue ?? '';
              s.formulas[row + r][col + c] = v[r]![c].basicValue ?? '';
              s.formats[row + r][col + c] ||= 'General';
            }
          }
        },
        getCell(r: number, c: number) {
          return {
            set formulas(v: any[][]) {
              fake.writes.push({ formula: v[0][0] });
              s.formulas[row + r][col + c] = v[0][0];
            },
          };
        },
        format: { autofitColumns() {} },
      });
      s.getRangeByIndexes = range;
      s.getCell = (r: number, c: number) => range(r, c, 1, 1);
      fake.sheets.push(s);
      return s;
    };
    fake.source = sheet('sheet-1', 'Input', [
      ['Value', 'Total'],
      [2, 4],
    ]);
    fake.source.formulas[1][1] = '=A2*2';
    const workbook = {
      protection: { load() {}, protected: false },
      getSelectedRange() {
        return fake.source.getRangeByIndexes(
          0,
          0,
          fake.source.values.length,
          fake.source.values[0].length,
        );
      },
      worksheets: {
        getItem(id: string) {
          const s = fake.sheets.find((s: any) => s.id === id || s.name === id);
          if (!s) throw new Error('Missing worksheet');
          return s;
        },
        getItemOrNullObject(name: string) {
          return {
            isNullObject: !fake.sheets.some(
              (s: any) => s.name.toLowerCase() === name.toLowerCase(),
            ),
          };
        },
        add(name: string) {
          fake.writes.push('sheet');
          return sheet(`sheet-${fake.sheets.length + 1}`, name, []);
        },
      },
    };
    w.fakeExcel = fake;
    w.Office = {
      onReady: async () => ({ host: 'Excel' }),
      HostType: { Excel: 'Excel' },
      context: { requirements: { isSetSupported: () => true } },
    };
    w.Excel = {
      run: async (fn: any) => fn({ workbook, sync: async () => {} }),
      ChartType: { columnClustered: 'column', barClustered: 'bar', line: 'line', pie: 'pie' },
      ChartSeriesBy: { columns: 'columns' },
    };
  };
  // tsx preserves function names using this helper inside serialized browser callbacks.
  await context.addInitScript({
    content: `globalThis.__name = (fn) => fn; (${officeMock.toString()})();`,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/excel.html`);
  assert.deepEqual(errors, [], 'Host fixture loaded');
  assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'Office host initialized');
  await page.getByLabel('Frame administrator password').fill('excel-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Start Excel conversation' }).click();
  const capture = page.getByRole('button', { name: 'Capture selection' });
  await capture.click();
  const send = async (text: string) => {
    await page.getByLabel('Ask Frame').fill(text);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled({
      timeout: 5000,
    });
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page
      .getByRole('button', { name: 'Review changes', exact: true })
      .click({ timeout: 25000 });
    await expect(page.getByRole('button', { name: 'Apply changes' })).toBeEnabled({
      timeout: 25000,
    });
  };
  await send('Fix the total');
  assert.equal(await page.evaluate(() => (window as any).fakeExcel.writes.length), 0);
  await expect(page.getByText('=A2*3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close review' }).click();
  assert.equal(
    await page.locator('.activity').count(),
    1,
    'Tool work shares one collapsed activity row',
  );
  const composer = await page.getByLabel('Ask Frame').boundingBox();
  assert(
    composer && composer.y + composer.height < 900 && composer.y > 650,
    'Composer stays at bottom',
  );
  await page.locator('.excel-scroll').evaluate((el) => {
    el.scrollTop = 0;
  });
  assert.deepEqual(
    await page.getByLabel('Ask Frame').boundingBox(),
    composer,
    'History scroll never moves composer',
  );
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal page overflow at narrow task-pane width',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace(/\.png$/, '-excel.png'),
      fullPage: true,
    });
  await page.evaluate(() => {
    (window as any).fakeExcel.source.values[1][0] = 9;
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('alert')).toContainText('captured cells');
  assert.equal(await page.evaluate(() => (window as any).fakeExcel.writes.length), 0);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await send('Try again with the current values');
  await page.evaluate(() => {
    (window as any).fakeExcel.protected = true;
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('alert')).toContainText('protected sheets');
  await page.evaluate(() => {
    (window as any).fakeExcel.protected = false;
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('applied', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => (window as any).fakeExcel.source.formulas[1][1]), '=A2*3');
  changes = {
    summary: 'Summary and chart',
    target: 'new_sheet',
    sheetName: 'Summary',
    values: [
      ['Name', 'Total'],
      ['=HYPERLINK("bad")', 10],
    ],
    table: true,
    chart: 'column',
  };
  await send('Create a summary table and chart');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('Created worksheet Summary.', { exact: true })).toBeVisible();
  const written = await page.evaluate(() => (window as any).fakeExcel.writes);
  assert(written.includes('table'));
  assert(written.includes('chart'));
  assert.deepEqual(written.find((v: any) => v.id === 'sheet-2').values[1][0], {
    type: 'String',
    basicValue: '=HYPERLINK("bad")',
  });
  await page.evaluate(() => {
    const source = (window as any).fakeExcel.source;
    source.values = Array.from({ length: 500 }, (_, r) =>
      Array.from({ length: 200 }, (_, c) => r * 200 + c),
    );
    source.formulas = structuredClone(source.values);
    source.formats = source.values.map((row: any[]) => row.map(() => 'General'));
  });
  changes = {
    summary: 'Large capture verified',
    target: 'new_sheet',
    sheetName: 'Capture summary',
    values: [
      ['Rows', 'Columns'],
      [500, 200],
    ],
  };
  await send('Capture this larger selection and summarize its dimensions');
  const conversationId = ctx.store.conversations().find((c: any) => ctx.excel.has(c.id)).id;
  const largeCapture = ctx.excel.list(conversationId)[0].baseline;
  assert.equal(largeCapture.values.length, 500);
  assert.equal(largeCapture.values[499][199], 99999, 'Client capture reads every block');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const operation = randomUUID();
  ctx.excel.capture(conversationId, operation, {
    columns: Array.from({ length: 200 }, (_, c) => `Column ${c + 1}`),
    rows: largeCapture.values.slice(1),
    affected: 0,
    truncated: false,
  });
  const proposeImport = (sheetName: string) =>
    ctx.excel.propose(conversationId, randomUUID(), largeCapture, {
      summary: `Import ${sheetName}`,
      target: 'new_sheet',
      sheetName,
      sourceOperationId: operation,
    });
  proposeImport('Large import');
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('500 rows × 200 columns');
  await page.getByRole('button', { name: 'Next columns' }).click();
  await page.getByRole('button', { name: 'Next rows' }).click();
  const applyBounds = await page.getByRole('button', { name: 'Apply changes' }).boundingBox();
  await page.locator('.excel-review-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.deepEqual(
    await page.getByRole('button', { name: 'Apply changes' }).boundingBox(),
    applyBounds,
    'Review scrolling never moves approval controls',
  );
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('Created worksheet Large import.', { exact: true })).toBeVisible({
    timeout: 25000,
  });
  const largeWritten = await page.evaluate(() => {
    const fake = (window as any).fakeExcel,
      sheet = fake.sheets.find((s: any) => s.name === 'Large import');
    return {
      last: sheet.values[499][199],
      blocks: fake.writes
        .filter((v: any) => v.id === sheet.id)
        .map((v: any) => v.values.length * v.values[0].length),
    };
  });
  assert.equal(largeWritten.last, 99999);
  assert.equal(
    largeWritten.blocks.reduce((a: number, b: number) => a + b, 0),
    100000,
  );
  assert(largeWritten.blocks.length > 1 && largeWritten.blocks.every((n: number) => n <= 5000));
  proposeImport('Uncertain');
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.evaluate(() => {
    (window as any).fakeExcel.writesUntilFailure = 1;
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('dialog')).toContainText('unknown');
  assert.equal(
    await page.evaluate(
      () => (window as any).fakeExcel.sheets.find((s: any) => s.name === 'Uncertain').values.length,
    ),
    25,
    'Only the first block completed before interruption',
  );
  const beforeReload = await page.evaluate(() => (window as any).fakeExcel.writes.length);
  assert(beforeReload > written.length);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Excel conversation' })).toBeVisible();
  assert.equal(
    await page.evaluate(() => (window as any).fakeExcel.writes.length),
    0,
    'Reload never replays workbook writes',
  );
  assert.equal(
    ctx.excel.list(ctx.store.conversations().find((c: any) => ctx.excel.has(c.id)).id)[0].status,
    'unknown',
  );
  assert.equal(ctx.knowledge.list(project.id).length, 0);
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Settings', exact: false }).click();
  await page.getByRole('tab', { name: 'Frame for Excel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Frame for Excel', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Excel manifest' }).click();
  assert.equal((await download).suggestedFilename(), 'frame-excel-manifest.xml');
  const setup = await context.request.get(`${origin}/excel-setup`);
  assert.equal(setup.status(), 200);
  assert.match(await setup.text(), /hosts.*without.*\.txt/);
  await page.getByLabel('Maximum cells per selection or proposal').fill('200000');
  await page.getByLabel('Maximum columns', { exact: true }).fill('2048');
  await page.getByRole('button', { name: 'Save Excel limits' }).click();
  await expect(page.getByText('Excel limits saved.')).toBeVisible();
  assert.equal(ctx.excel.limits().maxCells, 200000);
  assert.deepEqual(errors, []);
  console.log(
    'Excel simulated-host browser checks passed: preview, stale/protected guards, explicit Apply, typed text, table/chart, uncertain failure, and reload. Real Excel acceptance remains required.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  proxy.closeAllConnections();
  await new Promise<void>((r) => proxy.close(() => r()));
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await rm(root, { recursive: true, force: true });
}
