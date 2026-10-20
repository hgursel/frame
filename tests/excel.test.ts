import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { ExcelSessions } from '../server/excel/service.js';
import { isWorkbookProposal } from '../shared/excel-workbook.js';
import { excelManifest, excelIcon } from '../server/excel/manifest.js';
import {
  proposalSchema,
  selectionSchema,
  formulaSchema,
  excelCellValue,
  selectionSection,
  jsonBytes,
  type ExcelSelection,
} from '../shared/excel.js';
import { config, FakeSql } from './sql-fixture.js';
import { appFixture, waitUntil } from './helpers.js';

export const selection: ExcelSelection = {
  sheetId: 'sheet-1',
  sheetName: 'Input',
  address: 'Input!A1:B2',
  row: 0,
  column: 0,
  values: [
    ['Value', 'Total'],
    [2, 4],
  ],
  formulas: [
    ['Value', 'Total'],
    [2, '=A2*2'],
  ],
  numberFormat: [
    ['General', 'General'],
    ['General', 'General'],
  ],
};
const change = {
  summary: 'Fix total',
  target: 'selection',
  values: [
    ['Value', 'Total'],
    [2, null],
  ],
  formulas: [{ row: 1, column: 1, formula: '=A2*3' }],
};

test('Excel schema bounds inputs and keeps formula-like source text literal', () => {
  assert.deepEqual(selectionSchema.parse(selection), selection);
  assert.throws(() => selectionSchema.parse({ ...selection, row: 1048575 }));
  assert.throws(() => selectionSchema.parse({ ...selection, formulas: [[1]] }));
  assert.throws(() => selectionSchema.parse({ ...selection, values: [[1], [1, 2]] }));
  const tooWide = [Array(4097).fill(1)];
  assert.throws(() =>
    selectionSchema.parse({
      ...selection,
      values: tooWide,
      formulas: tooWide,
      numberFormat: [Array(4097).fill('General')],
    }),
  );
  assert.throws(() =>
    proposalSchema.parse({ ...change, formulas: [{ row: 2, column: 1, formula: '=1' }] }),
  );
  assert.throws(() => proposalSchema.parse({ ...change, sourceOperationId: randomUUID() }));
  assert.throws(() => proposalSchema.parse({ ...change, table: true }));
  for (const name of ['A/B', 'History', "'bad", '[external]'])
    assert.throws(() => proposalSchema.parse({ ...change, target: 'new_sheet', sheetName: name }));
  for (const formula of [
    '=WEBSERVICE("https://bad")',
    '=HYPERLINK("bad")',
    '=CUSTOM(A1)',
    "='[Other.xlsx]Sheet1'!A1",
    '=cmd|stuff',
    '=SUM({1,2})',
  ])
    assert.throws(() => formulaSchema.parse(formula), formula);
  for (const formula of [
    '=SUM(A1:A5)',
    '=IFERROR(XLOOKUP(A2,C1:C5,D1:D5),"unknown")',
    '=IF(A1="CALL(",1,0)',
  ])
    assert.equal(formulaSchema.parse(formula), formula);
  for (const value of ['=HYPERLINK("bad")', '+SUM(1)', '-2', '@bad'])
    assert.deepEqual(excelCellValue(value), { type: 'String', basicValue: value });
  assert.deepEqual(excelCellValue(null), { type: 'Empty' });
  assert.deepEqual(excelCellValue(false), { type: 'Boolean', basicValue: false });
  assert.deepEqual(excelCellValue(2), { type: 'Double', basicValue: 2 });
});

test('Excel proposals enforce pane ownership, one-time Apply, SQL source scope, restart and deletion', async () => {
  const f = await appFixture('excel-service');
  try {
    await f.signIn();
    assert.equal((await f.auth('/excel/manifest')).statusCode, 400);
    assert.equal(
      (await f.auth('/excel/sessions', 'POST', { projectId: randomUUID() })).statusCode,
      400,
    );
    const p = f.store.createProject({ name: 'Excel', instructions: '', toolsEnabled: true });
    const a = f.excel.create(p.id),
      b = f.excel.create(p.id);
    f.excel.authorize(a.conversationId, a.clientKey);
    assert.throws(() => f.excel.authorize(a.conversationId, b.clientKey), /different task pane/);
    assert.throws(() => f.excel.authorize(a.conversationId, undefined));
    const proposed = f.excel.propose(a.conversationId, randomUUID(), selection, change);
    assert.equal(f.excel.get(a.conversationId, proposed.id).status, 'pending');
    assert.throws(() => f.excel.get(b.conversationId, proposed.id), /not found/);
    assert.throws(() => f.excel.turn(a.conversationId, selection), /waiting proposal/);
    assert.throws(
      () => f.excel.propose(a.conversationId, randomUUID(), selection, change),
      /already waiting/,
    );
    f.excel.transition(a.conversationId, proposed.id, { action: 'claim' });
    assert.throws(
      () => f.excel.transition(a.conversationId, proposed.id, { action: 'claim' }),
      /already handled/,
    );
    assert.throws(() => f.excel.transition(a.conversationId, proposed.id, { action: 'reject' }));
    f.excel.transition(a.conversationId, proposed.id, { action: 'applied', result: 'Done' });
    f.excel.transition(a.conversationId, proposed.id, { action: 'applied', result: 'Done' });
    assert.equal(f.excel.turn(a.conversationId, selection).recent[0]!.status, 'applied');
    const operation = randomUUID();
    f.excel.capture(a.conversationId, operation, {
      columns: ['Value'],
      rows: [['=HYPERLINK("bad")']],
      affected: 0,
      truncated: true,
    });
    const sql = {
      summary: 'Import',
      target: 'new_sheet',
      sheetName: 'Query',
      sourceOperationId: operation,
      table: true,
    };
    assert.throws(
      () => f.excel.propose(b.conversationId, randomUUID(), selection, sql),
      /unavailable/,
    );
    const imported = f.excel.propose(a.conversationId, randomUUID(), selection, sql);
    const importedCells = f.excel.get(a.conversationId, imported.id);
    assert(!isWorkbookProposal(importedCells));
    assert.deepEqual(importedCells.change.values, [['Value'], ['=HYPERLINK("bad")']]);
    assert.match(f.excel.get(a.conversationId, imported.id).sourceNotice!, /partial/);
    f.excel.cancel(a.conversationId);
    assert.equal(f.excel.get(a.conversationId, imported.id).status, 'rejected');
    const huge = randomUUID();
    f.excel.capture(a.conversationId, huge, {
      columns: ['Value'],
      rows: Array(100000).fill([1]),
      affected: 0,
      truncated: false,
    });
    assert.throws(
      () =>
        f.excel.propose(a.conversationId, randomUUID(), selection, {
          ...sql,
          sourceOperationId: huge,
        }),
      /unavailable/,
    );
    const pending = f.excel.propose(a.conversationId, randomUUID(), selection, change);
    const claimed = f.excel.propose(b.conversationId, randomUUID(), selection, change);
    f.excel.transition(b.conversationId, claimed.id, { action: 'claim' });
    // An existing pilot database has no lightweight summary column yet.
    f.store.db.exec('ALTER TABLE excel_proposals DROP COLUMN summary');
    const restarted = new ExcelSessions(f.store);
    assert.equal(restarted.get(a.conversationId, pending.id).status, 'rejected');
    assert.equal(restarted.get(b.conversationId, claimed.id).status, 'unknown');
    assert.equal(
      restarted.summaries(a.conversationId).find((p) => p.id === proposed.id)!.status,
      'applied',
    );
    assert.equal(restarted.summaries(b.conversationId)[0]!.status, 'unknown');
    const legacy = restarted.get(a.conversationId, proposed.id);
    assert(!isWorkbookProposal(legacy));
    assert.equal(legacy.change.formulas[0]!.formula, '=A2*3');
    f.store.db.prepare('DELETE FROM conversations WHERE id=?').run(a.conversationId);
    assert.equal(
      f.store.db.prepare('SELECT 1 FROM excel_sources WHERE id=?').get(operation),
      undefined,
    );
    assert.equal(restarted.has(a.conversationId), false);
    assert.equal(restarted.list(a.conversationId).length, 0);
    assert.throws(() => excelManifest('http://frame.test'), /HTTPS/);
    const manifest = excelManifest('https://frame.test:8443');
    assert.match(manifest, /https:\/\/frame.test:8443\/excel.html/);
    assert.match(manifest, /DefaultMinVersion="1.16"/);
    assert.equal(excelIcon(32).readUInt32BE(16), 32);
  } finally {
    await f.cleanup();
  }
});

test('large Excel captures use compact, bounded sections and lightweight proposal polling', async () => {
  const f = await appFixture('excel-large');
  try {
    const p = f.store.createProject({ name: 'Large', instructions: '', toolsEnabled: false });
    const session = f.excel.create(p.id),
      id = session.conversationId,
      runId = randomUUID();
    const values = Array.from({ length: 500 }, (_, r) =>
      Array.from({ length: 200 }, (_, c) => r * 200 + c),
    );
    const large = selectionSchema.parse({
      ...selection,
      values,
      formulas: values,
      numberFormat: values.map((row) => row.map(() => 'General')),
    });
    assert.deepEqual(f.excel.limits(), { maxCells: 100000, maxColumns: 1024 });
    const turn = f.excel.turn(id, large),
      model = f.excel.context(id, runId, turn, 4096);
    assert.equal(model.selection.rows, 500);
    assert.equal(model.selection.columns, 200);
    assert.equal(model.initial!.completeSelection, false);
    assert(jsonBytes(model.initial) <= 4096);
    assert(!JSON.stringify(model).includes('numberFormat'));
    assert.deepEqual(model.initial!.formulas, []);
    const section = f.excel.read(id, runId, large, {
      row: 499,
      column: 190,
      rows: 1,
      columns: 10,
      maxBytes: 2048,
    });
    assert.deepEqual(section.values, [values[499]!.slice(190)]);
    assert.equal(f.excel.inspection(id)!.ranges.length, 2);
    assert.throws(
      () =>
        f.excel.read(id, randomUUID(), large, {
          row: 0,
          column: 0,
          rows: 1,
          columns: 1,
          maxBytes: 1000,
        }),
      /another run/,
    );
    assert.throws(
      () =>
        f.excel.read(id, runId, large, {
          row: 500,
          column: 0,
          rows: 1,
          columns: 1,
          maxBytes: 1000,
        }),
      /outside/,
    );
    assert.throws(
      () => f.excel.read(id, runId, large, { row: 0, column: 0, rows: 1, columns: 1, maxBytes: 0 }),
      /context/,
    );
    const proposed = f.excel.propose(id, runId, large, {
      summary: 'Large replacement',
      target: 'selection',
      values,
    });
    const largeProposal = f.excel.get(id, proposed.id);
    assert(!isWorkbookProposal(largeProposal));
    assert(largeProposal.baseline.values.length === 500);
    assert(
      jsonBytes(f.excel.summaries(id)) < 1000,
      'Status polling omits values and validation snapshots',
    );
    f.excel.transition(id, proposed.id, { action: 'reject' });
    f.excel.setLimits({ maxCells: 2000, maxColumns: 100 });
    assert.throws(() => f.excel.turn(id, large), /configured limits/);
    assert.throws(() => f.excel.setLimits({ maxCells: 500001, maxColumns: 4096 }));
    f.excel.setLimits({ maxCells: 500000, maxColumns: 4096 });
    assert.equal(f.excel.turn(id, large).selection.values.length, 500);
    const unicode = {
      ...selection,
      values: [
        ['😀'.repeat(100), 1],
        [2, 4],
      ],
      formulas: [
        ['😀'.repeat(100), 1],
        [2, '=A2*2'],
      ],
    };
    const compact = selectionSection(unicode, 0, 0, 2, 2, 1000);
    assert(jsonBytes(compact) <= 1000);
    assert.deepEqual(compact.formulas, [{ row: 1, column: 1, formula: '=A2*2' }]);
    const literal = selectionSection(
      {
        ...selection,
        values: [
          ['=1', 1],
          [2, 4],
        ],
        formulas: [
          ['=1', 1],
          [2, 4],
        ],
      },
      0,
      0,
      2,
      2,
      1000,
    );
    assert.deepEqual(literal.formulas, []);
    f.store.db.prepare('DELETE FROM conversations WHERE id=?').run(id);
    assert.equal(f.excel.inspection(id), undefined);
  } finally {
    await f.cleanup();
  }
});

test('Excel HTTPS API and real SDK expose only pilot tools, bind approval, reject SQL writes, and import saved rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-excel-api-'));
  const driver = new FakeSql();
  const requests: any[] = [];
  let mode = 'proposal',
    turn = 0;
  let sourceId = '';
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    requests.push(body);
    let tool: { name: string; args: unknown } | undefined;
    if (turn++ === 0)
      tool =
        mode === 'section'
          ? { name: 'excel_read_selection', args: { row: 499, column: 190, rows: 1, columns: 10 } }
          : mode === 'proposal'
            ? { name: 'excel_propose_changes', args: change }
            : {
                name: 'mssql_query',
                args: {
                  database: 'Dev',
                  sql: mode === 'write' ? 'DELETE FROM dbo.t' : 'SELECT id,value FROM dbo.t',
                },
              };
    else if (mode === 'read' && turn === 2) {
      const result = JSON.parse(body.messages.findLast((m: any) => m.role === 'tool').content);
      sourceId = result.operationId;
      tool = {
        name: 'excel_propose_changes',
        args: {
          summary: 'SQL import',
          target: 'new_sheet',
          sheetName: 'Query',
          sourceOperationId: sourceId,
          table: true,
        },
      };
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = tool
      ? {
          tool_calls: [
            {
              index: 0,
              id: `call-${requests.length}`,
              type: 'function',
              function: { name: tool.name, arguments: JSON.stringify(tool.args) },
            },
          ],
        }
      : { content: 'Review the proposed changes.' };
    res.end(
      `data: ${JSON.stringify({ id: 'excel', choices: [{ index: 0, delta, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  const origin = 'https://frame.test';
  const f = await createApp({ dataDir: root, origin, setupToken: 'excel-test', sqlDriver: driver });
  let cookie = '',
    key = '';
  const call = (
    url: string,
    method = 'GET',
    payload?: unknown,
    headers: Record<string, string> = {},
  ) =>
    f.app.inject({
      url,
      method: method as any,
      payload: payload as any,
      headers: { host: 'frame.test', origin, cookie, 'x-frame-excel-key': key, ...headers },
    });
  try {
    assert.equal((await call('/api/excel/config')).statusCode, 401);
    await call('/api/auth/setup', 'POST', { token: 'excel-test', password: 'password-excel-test' });
    const login = await call('/api/auth/login', 'POST', { password: 'password-excel-test' });
    cookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.match(String(login.headers['set-cookie']), /Secure/);
    assert.equal((await call('/api/excel/config')).json().https, true);
    const manifest = await call('/api/excel/manifest');
    assert.equal(manifest.statusCode, 200);
    assert.match(manifest.body, /Frame for Excel/);
    const main = await call('/');
    const pane = await call('/excel.html');
    assert(!String(main.headers['content-security-policy']).includes('onecdn'));
    assert(String(pane.headers['content-security-policy']).includes('onecdn'));
    assert.equal(pane.headers['x-frame-options'], 'DENY');
    const p = f.store.createProject({ name: 'Excel', instructions: '', toolsEnabled: true });
    f.mssql.save(config);
    f.mssql.setProject(p.id, true);
    f.store.saveSettings({
      ...f.store.settings(),
      modelId: 'local',
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
    });
    const created = (await call('/api/excel/sessions', 'POST', { projectId: p.id })).json();
    key = created.clientKey;
    const id = created.conversationId,
      url = `/api/excel/sessions/${id}`;
    const bridgeController = new AbortController();
    const bridgeResult = f.excel.bridge.request(
      id,
      {
        runId: randomUUID(),
        limits: f.excel.limits(),
        task: { kind: 'read', query: { kind: 'list_sheets', offset: 0 }, maxBytes: 1000 },
      },
      bridgeController.signal,
    );
    const bridgeId = f.excel.bridge.peek(id)!.id;
    assert.equal(
      (await call(`${url}/workbook/${bridgeId}`, 'GET', undefined, { 'x-frame-excel-key': 'bad' }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await call(
          `${url}/workbook/${bridgeId}`,
          'POST',
          { result: { sheets: [] } },
          { 'x-frame-excel-key': 'bad' },
        )
      ).statusCode,
      403,
    );
    assert.equal((await call(`${url}/workbook/${bridgeId}`)).json().task.kind, 'read');
    assert.equal(
      (await call(`${url}/workbook/${bridgeId}`, 'POST', { result: { sheets: [] } })).statusCode,
      200,
    );
    assert.deepEqual(await bridgeResult, { sheets: [] });
    assert.equal(
      (await call(`${url}/workbook/${bridgeId}`, 'POST', { result: { sheets: [] } })).statusCode,
      409,
      'Expired requests cannot be replayed',
    );
    assert.equal(
      (await call(url, 'GET', undefined, { 'x-frame-excel-key': 'bad' })).statusCode,
      403,
    );
    assert.equal(
      (
        await call(
          '/api/excel/sessions',
          'POST',
          { projectId: p.id },
          { origin: 'https://evil.test' },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await call(`/api/conversations/${id}/messages`, 'POST', {
          text: 'Bypass pane',
          requestId: randomUUID(),
        })
      ).statusCode,
      409,
    );
    const run = async (captured = selection) => {
      turn = 0;
      const requestId = randomUUID();
      const b = { requestId, text: 'Please help with this selection.', selection: captured };
      const started = await call(`${url}/messages`, 'POST', b);
      assert.equal(started.statusCode, 202, started.body);
      assert.equal((await call(`${url}/messages`, 'POST', b)).json().duplicate, true);
      await waitUntil(() => !f.runner.snapshot(id).running);
      assert.equal(f.runner.snapshot(id).error, undefined);
      const count = requests.length;
      assert.equal((await call(`${url}/messages`, 'POST', b)).json().duplicate, true);
      assert.equal(requests.length, count);
    };
    await run();
    const names = requests[0].tools.map((t: any) => t.function.name);
    for (const name of [
      'excel_propose_changes',
      'excel_read_selection',
      'excel_read_workbook',
      'excel_edit_workbook',
      'read_knowledge',
      'search_knowledge',
      'mssql_query',
      'ask_user_question',
    ])
      assert(names.includes(name), name);
    for (const name of [
      'bash',
      'write',
      'edit',
      'read',
      'mssql_procedure',
      'create_document',
      'reports_create',
      'charts_create',
    ])
      assert(!names.includes(name), name);
    assert(JSON.stringify(requests[0].messages).includes('Input!A1:B2'));
    const pending = f.excel.list(id)[0]!;
    assert.equal(pending.status, 'pending');
    const other = f.excel.create(p.id);
    assert.equal(
      (await call(url, 'GET', undefined, { 'x-frame-excel-key': other.clientKey })).statusCode,
      403,
    );
    assert.equal(
      (await call(`${url}/proposals/${pending.id}`, 'POST', { action: 'claim' })).statusCode,
      200,
    );
    assert.equal(
      (await call(`${url}/proposals/${pending.id}`, 'POST', { action: 'claim' })).statusCode,
      409,
    );
    await call(`${url}/proposals/${pending.id}`, 'POST', {
      action: 'applied',
      result: 'Updated Input!A1:B2.',
    });
    mode = 'write';
    await run();
    assert.equal(driver.calls.length, 0);
    assert.match(
      f.runner
        .snapshot(id)
        .messages.filter((m) => m.role === 'tool')
        .at(-1)!.text,
      /read-only SQL/,
    );
    assert(JSON.stringify(requests.at(-1).messages).includes('Updated Input!A1:B2.'));
    mode = 'read';
    await run();
    assert.equal(driver.calls.length, 1);
    assert.equal(driver.calls[0]!.login, 'read');
    const imported = f.excel.list(id)[0]!;
    assert(!isWorkbookProposal(imported));
    assert.equal(imported.change.sourceOperationId, sourceId);
    assert.deepEqual(imported.change.values, [
      ['id', 'value'],
      [1, '=HYPERLINK("bad")'],
      [2, 'hello'],
    ]);
    assert.deepEqual(f.knowledge.list(p.id), []);
    f.excel.cancel(id);
    const values = Array.from({ length: 500 }, () => Array(200).fill(1));
    values[499]![199] = 'tail-sentinel';
    const large = {
      ...selection,
      values,
      formulas: values,
      numberFormat: values.map((r) => r.map(() => 'General')),
    };
    mode = 'section';
    const before = requests.length;
    await run(large);
    assert(!JSON.stringify(requests[before].messages).includes('tail-sentinel'));
    assert(JSON.stringify(requests.at(-1).messages).includes('tail-sentinel'));
    assert(f.excel.inspection(id)!.ranges.some((r) => r.row === 499 && r.column === 190));
    const polled = await call(url);
    assert(!polled.body.includes('numberFormat'));
    assert.equal(
      (
        await call(`${url}/proposals/${pending.id}`, 'GET', undefined, {
          'x-frame-excel-key': 'bad',
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await call('/api/excel/config', 'PUT', { maxCells: 200000, maxColumns: 2048 })).statusCode,
      200,
    );
    assert.equal((await call('/api/excel/config')).json().limits.maxCells, 200000);
    assert.equal(
      (await call('/api/excel/config', 'PUT', { maxCells: 900000, maxColumns: 2048 })).statusCode,
      400,
    );
    await (f.maintenance as any).conversation(
      { projectId: p.id, kind: 'conversation', id },
      new AbortController().signal,
    );
    assert.equal(
      f.store.db.prepare('SELECT COUNT(*) AS count FROM maintenance_candidates').get()!.count,
      0,
    );
  } finally {
    await f.app.close();
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
