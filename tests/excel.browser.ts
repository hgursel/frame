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
import { installExcelMock } from './excel-office.js';
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
let workbookCalls: { name: string; args: unknown }[] | undefined;
let workbookStep = 0;
const workbookMessages: any[] = [];
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  calls++;
  if (workbookCalls) workbookMessages.push(b);
  const planned = workbookCalls ? workbookCalls[workbookStep++] : undefined;
  const tool = workbookCalls ? !!planned : b.messages.at(-1).role !== 'tool';
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const delta = tool
    ? {
        tool_calls: [
          {
            index: 0,
            id: `excel-${calls}`,
            type: 'function',
            function: {
              name: planned?.name || 'excel_propose_changes',
              arguments: JSON.stringify(planned?.args || changes),
            },
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
ctx.store.db
  .prepare("UPDATE project_plugins SET enabled=1 WHERE projectId=? AND plugin='excel'")
  .run(project.id);
const knowledgeDoc = await ctx.knowledge.add(
  project.id,
  'Workbook rules.txt',
  Buffer.from('Use NetAmount for the total.'),
);
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
  const officeMock = installExcelMock;
  // tsx preserves function names using this helper inside serialized browser callbacks.
  await context.addInitScript({
    content: `globalThis.__name = (fn) => fn; (${officeMock.toString()})();`,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/excel.html`);
  assert.deepEqual(errors, [], 'Host fixture loaded');
  assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'Office host initialized');
  await page.getByLabel('Frame password').fill('excel-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('combobox', { name: /Frame project/ }).selectOption(project.id);
  await page.getByRole('button', { name: 'Start Excel conversation' }).click();
  await expect(page.getByRole('button', { name: 'Capture selection' })).toHaveCount(0);
  const send = async (text: string) => {
    // The background composer is inert until the asynchronous review action closes its modal.
    await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).not.toBeVisible();
    await page.getByLabel('Message Frame').fill(text);
    await expect(page.getByLabel('Message Frame')).toHaveValue(text);
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled({
      timeout: 5000,
    });
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.locator('.message.user').last()).toContainText(text, { timeout: 25000 });
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
  const composer = await page.getByLabel('Message Frame').boundingBox();
  assert(
    composer && composer.y + composer.height < 900 && composer.y > 650,
    'Composer stays at bottom',
  );
  await page.locator('.excel-scroll').evaluate((el) => {
    el.scrollTop = 0;
  });
  assert.deepEqual(
    await page.getByLabel('Message Frame').boundingBox(),
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
  // Exercise a slow rejection acknowledgment so the next message cannot race the closing modal.
  await page.route('**/api/excel/sessions/*/proposals/*', async (route) => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON()?.action !== 'reject')
      return route.continue();
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await send('Try again with the current values');
  await page.evaluate(() => {
    (window as any).fakeExcel.protected = true;
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('alert')).toContainText('protected');
  await page.evaluate(() => {
    (window as any).fakeExcel.protected = false;
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('applied', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => (window as any).fakeExcel.source.formulas[1][1]), '=A2*3');
  await expect(page.getByText('Pilot', { exact: true })).toHaveCount(0);
  await expect(page.locator('.excel-dock [role="status"]')).toHaveCount(0);
  await expect(
    page.locator('.excel-composer').getByRole('button', { name: 'Send message' }),
  ).toHaveCount(1);
  await expect(page.locator('.excel-context')).not.toHaveAttribute('open');
  await send('Prepare another total');
  await page.getByRole('button', { name: 'Close review' }).click();
  const oldId = ctx.excel.list(
    ctx.store.conversations().find((c: any) => ctx.excel.has(c.id)).id,
  )[0].id;
  await send('Actually change that pending total');
  await page.getByRole('button', { name: 'Close review' }).click();
  await expect(page.locator(`[data-proposal-id="${oldId}"]`)).toContainText('Replaced');
  assert(
    await page.locator(`[data-proposal-id="${oldId}"]`).evaluate((card) => {
      const next = [...document.querySelectorAll('.message.user')].find((el) =>
        el.textContent?.includes('Actually change'),
      );
      return !!next && !!(card.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
    'Old changes stay before the next user turn',
  );
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
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
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).not.toBeVisible();
  assert.equal(
    ctx.excel.list(ctx.store.conversations().find((c: any) => ctx.excel.has(c.id)).id)[0].result,
    'Created worksheet Summary.',
  );
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
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).not.toBeVisible();
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
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).toContainText(
    '500 rows × 200 columns',
  );
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
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).not.toBeVisible({
    timeout: 25000,
  });
  assert.equal(ctx.excel.list(conversationId)[0].result, 'Created worksheet Large import.');
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
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).toContainText('unknown');
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
  assert.equal(ctx.knowledge.list(project.id).length, 1);
  await page.evaluate(async () => {
    const fake = (window as any).fakeExcel;
    fake.addSheet('Blank', [['']]);
    await fake.select({ sheet: 'Blank', row: 0, column: 0, rows: 1, columns: 1 });
  });
  await page.getByRole('combobox', { name: /Frame project/ }).selectOption(project.id);
  await page.getByRole('button', { name: 'Start Excel conversation' }).click();
  await expect(page.getByText('Selected: Blank!A1:A1')).toBeVisible();
  workbookCalls = [
    { name: 'excel_read_workbook', args: { kind: 'read_range', sheet: 'Input', range: 'A1:B2' } },
    {
      name: 'excel_edit_workbook',
      args: {
        summary: 'Build on this blank sheet',
        actions: [
          {
            kind: 'write',
            sheet: 'Blank',
            range: 'A1:B3',
            values: [
              ['Name', 'Amount'],
              ['One', 10],
              ['Two', 20],
            ],
          },
          { kind: 'format', sheet: 'Blank', range: 'B2:B3', format: { numberFormat: '$#,##0.00' } },
          { kind: 'table', sheet: 'Blank', range: 'A1:B3', name: 'Results', mode: 'create' },
          {
            kind: 'chart',
            sheet: 'Blank',
            range: 'A1:B3',
            name: 'Amounts',
            chartType: 'column',
            mode: 'create',
          },
        ],
      },
    },
  ];
  workbookStep = 0;
  await send('Read Input and build a table and chart on this blank worksheet');
  assert.equal(
    await page.evaluate(() => (window as any).fakeExcel.writes.length),
    0,
    'Automatic workbook reads and preview never write',
  );
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).toContainText(
    'Blank!A1:B3',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace(/\.png$/, '-excel-workbook.png'),
    });
  await page.evaluate(async () => {
    await (window as any).fakeExcel.select({
      sheet: 'Input',
      row: 1,
      column: 0,
      rows: 1,
      columns: 1,
    });
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).not.toBeVisible();
  assert.deepEqual(
    await page.evaluate(
      () => (window as any).fakeExcel.sheets.find((s: any) => s.name === 'Blank').values,
    ),
    [
      ['Name', 'Amount'],
      ['One', 10],
      ['Two', 20],
    ],
  );
  assert.equal(
    await page.evaluate(() => (window as any).fakeExcel.sheets.length),
    2,
    'Work stays on existing sheets',
  );
  const sameConversation = ctx.store.conversations().find((c: any) => ctx.excel.has(c.id)).id;
  workbookCalls = [
    {
      name: 'excel_edit_workbook',
      args: {
        summary: 'Fix the existing formula',
        actions: [
          {
            kind: 'write',
            sheet: 'Input',
            range: 'B2',
            formulas: [{ row: 0, column: 0, formula: '=A2*5' }],
          },
        ],
      },
    },
  ];
  workbookStep = 0;
  await send('Now use my other selection and fix the existing total');
  assert.equal(
    ctx.store.conversations().find((c: any) => ctx.excel.has(c.id)).id,
    sameConversation,
  );
  assert(
    JSON.stringify(workbookMessages.at(-1)).includes('Read Input and build a table'),
    'Earlier conversation remains available',
  );
  assert(
    JSON.stringify(workbookMessages.at(-1)).includes('Blank!A1:A1'),
    'Earlier selection snapshot is retained',
  );
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Review Excel changes' })).not.toBeVisible();
  assert.equal(await page.evaluate(() => (window as any).fakeExcel.source.formulas[1][1]), '=A2*5');
  assert.equal(await page.evaluate(() => (window as any).fakeExcel.source.values[1][0]), 2);
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace(/\.png$/, '-excel-conversation.png'),
    });
  // Attachments use the same conversation and never become project knowledge automatically.
  workbookCalls = [];
  workbookStep = 0;
  await page.getByRole('button', { name: 'Add attachments' }).click();
  await page.getByRole('button', { name: 'Attach from knowledge', exact: false }).click();
  await page.getByRole('checkbox', { name: /Workbook rules/ }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove attachment Workbook rules.txt' }),
  ).toBeVisible();
  await page.getByLabel('Upload chat files').setInputFiles({
    name: 'sample.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Amount\nExample,42'),
  });
  await expect(page.getByRole('button', { name: 'Remove attachment sample.csv' })).toBeVisible();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    canvas.getContext('2d')!.fillRect(0, 0, 80, 60);
    return canvas.toDataURL().split(',')[1]!;
  });
  await page.getByLabel('Upload chat images').setInputFiles({
    name: 'upload.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.getByAltText('upload.png')).toBeVisible();
  await page.getByRole('button', { name: 'Remove image 1' }).click();
  await page.getByLabel('Message Frame').evaluate((el, data) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'pasted.png', {
        type: 'image/png',
      }),
    );
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, image);
  await expect(page.getByAltText('pasted.png')).toBeVisible();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.message.user').last()).toContainText('sample.csv');
  await expect(page.locator('.message.user').last().getByRole('img')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Stop generation' })).toHaveCount(0, {
    timeout: 25000,
  });
  assert.deepEqual(
    ctx.knowledge.list(project.id).map((d: any) => d.id),
    [knowledgeDoc.id],
  );
  const lastRequest = JSON.stringify(workbookMessages.at(-1));
  assert(
    lastRequest.includes('NetAmount') &&
      lastRequest.includes('Example,42') &&
      lastRequest.includes('image_url'),
  );
  await expect(page.locator('.composer-attachments')).toHaveCount(0);
  await expect(page.locator('.throughput')).toBeVisible();
  await page.getByLabel('Context usage').click();
  await expect(page.getByText('Conversation context', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compact now' })).toBeEnabled();
  // Use a smaller context target so this short fixture has older turns to summarize.
  ctx.store.saveSettings({ ...ctx.store.settings(), contextWindow: 8192, maxTokens: 1024 });
  const writesBeforeCompact = await page.evaluate(() => (window as any).fakeExcel.writes.length);
  const usersBeforeCompact = await page.locator('.message.user').count();
  await page.getByRole('button', { name: 'Compact now' }).click();
  await expect(page.getByText('Last checkpoint', { exact: false })).toBeVisible({ timeout: 25000 });
  assert.equal(await page.locator('.message.user').count(), usersBeforeCompact);
  assert.equal(
    await page.evaluate(() => (window as any).fakeExcel.writes.length),
    writesBeforeCompact,
    'Compaction never replays edits',
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Context menu fits the narrow pane',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace(/\.png$/, '-excel-context.png'),
    });
  await page.getByLabel('Context usage').click();
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
