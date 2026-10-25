import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installExcelMock } from './excel-office.js';
import { appFixture } from './helpers.js';
import { WorkbookBridge } from '../server/excel/bridge.js';
import { handleWorkbookRequest, applyWorkbookProposal } from '../web/excel/operations.js';
import { captureSelection, verifyProposal } from '../web/excel/workbook.js';
import { DEFAULT_EXCEL_LIMITS, jsonBytes } from '../shared/excel.js';
import {
  workbookPlanSchema,
  rangeBounds,
  type WorkbookProposal,
  type WorkbookPlan,
  type WorkbookRequest,
} from '../shared/excel-workbook.js';

test('workbook plans validate addresses, partial edits, structure and exact output shapes', () => {
  assert.deepEqual(rangeBounds('$XFD$1048576'), {
    row: 1048575,
    column: 16383,
    rows: 1,
    columns: 1,
  });
  for (const address of ['XFE1', 'A0', 'A1048577', 'B2:A1', '[Book]A1', 'Sheet!A1', 'A:A', 'A1,C1'])
    assert.throws(() => rangeBounds(address));
  const write = {
    kind: 'write',
    sheet: 'Input',
    range: 'B2',
    formulas: [{ row: 0, column: 0, formula: '=A2*3' }],
  };
  assert.equal(
    workbookPlanSchema.parse({ summary: 'Formula only', actions: [write] }).actions.length,
    1,
  );
  assert.throws(() =>
    workbookPlanSchema.parse({ summary: 'Bad shape', actions: [{ ...write, values: [[1, 2]] }] }),
  );
  assert.throws(() =>
    workbookPlanSchema.parse({
      summary: 'Outside',
      actions: [{ ...write, formulas: [{ row: 1, column: 0, formula: '=1' }] }],
    }),
  );
  assert.throws(() =>
    workbookPlanSchema.parse({
      summary: 'Mixed coordinates',
      actions: [{ kind: 'delete_rows', sheet: 'Input', range: 'A2' }, write],
    }),
  );
  assert.throws(() =>
    workbookPlanSchema.parse({
      summary: 'Sort outside',
      actions: [
        { kind: 'sort', sheet: 'Input', range: 'A1:B4', fields: [{ column: 2, ascending: true }] },
      ],
    }),
  );
  assert.throws(() =>
    workbookPlanSchema.parse({
      summary: 'Unknown code',
      actions: [{ kind: 'script', code: 'anything' }],
    }),
  );
});

test('workbook bridge binds read-only requests to session/run, expires replies and cancels without replay', async () => {
  const bridge = new WorkbookBridge(),
    controller = new AbortController(),
    id = randomUUID(),
    runId = randomUUID();
  const result = bridge.request(
    id,
    {
      runId,
      limits: DEFAULT_EXCEL_LIMITS,
      task: { kind: 'read', query: { kind: 'list_sheets', offset: 0 }, maxBytes: 1000 },
    },
    controller.signal,
  );
  const request = bridge.peek(id)!;
  assert.equal(request.runId, runId);
  assert.throws(() => bridge.get(randomUUID(), request.id), /expired/);
  await assert.rejects(
    bridge.request(id, { ...bridge.get(id, request.id) }, controller.signal),
    /pending/,
  );
  bridge.respond(id, request.id, { sheets: [] });
  assert.deepEqual(await result, { sheets: [] });
  assert.throws(() => bridge.respond(id, request.id, { sheets: [] }), /expired/);
  const cancelled = bridge.request(
    id,
    {
      runId,
      limits: DEFAULT_EXCEL_LIMITS,
      task: { kind: 'read', query: { kind: 'list_sheets', offset: 0 }, maxBytes: 1000 },
    },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(bridge.peek(id), undefined);
});

test('worksheet operations read across sheets, preserve untouched cells, and edit existing data only after approval', async () => {
  const fake = installExcelMock();
  fake.addSheet('Blank', [['']]);
  await fake.select({ sheet: 'Blank', row: 0, column: 0, rows: 1, columns: 1 });
  assert.deepEqual((await captureSelection()).values, [['']]);
  const request = (task: WorkbookRequest['task']): WorkbookRequest => ({
    id: randomUUID(),
    runId: randomUUID(),
    limits: DEFAULT_EXCEL_LIMITS,
    task,
  });
  const catalog: any = await handleWorkbookRequest(
    request({ kind: 'read', query: { kind: 'list_sheets', offset: 0 }, maxBytes: 1000 }),
  );
  assert.deepEqual(
    catalog.sheets.map((s: any) => s.name),
    ['Input', 'Blank'],
  );
  const read: any = await handleWorkbookRequest(
    request({
      kind: 'read',
      query: { kind: 'read_range', sheet: 'Input', range: 'B2' },
      maxBytes: 1000,
    }),
  );
  assert.deepEqual(read.values, [[4]]);
  assert.deepEqual(read.formulas, [['=A2*2']]);
  const prepare = async (actions: unknown[]): Promise<WorkbookProposal> => {
    const plan = workbookPlanSchema.parse({ summary: 'Working sheet edit', actions });
    const checks = (await handleWorkbookRequest(
      request({ kind: 'inspect', plan }),
    )) as WorkbookProposal['checks'];
    return {
      kind: 'workbook',
      id: randomUUID(),
      runId: randomUUID(),
      summary: plan.summary,
      status: 'pending',
      plan,
      checks,
    };
  };
  const blank = await prepare([
    {
      kind: 'write',
      sheet: 'Blank',
      range: 'A1:B3',
      values: [
        ['Name', 'Total'],
        ['B', 20],
        ['A', 10],
      ],
    },
  ]);
  assert.equal(fake.writes.length, 0, 'Preview inspections never write');
  await fake.select({ sheet: 'Input', row: 0, column: 0, rows: 1, columns: 1 });
  await applyWorkbookProposal(blank);
  assert.deepEqual(
    fake.sheets[1].values,
    [
      ['Name', 'Total'],
      ['B', 20],
      ['A', 10],
    ],
    'Destination remains on the original sheet after selecting elsewhere',
  );
  assert.equal(fake.sheets.length, 2, 'No unnecessary new sheet');
  const formula = await prepare([
    {
      kind: 'write',
      sheet: 'Input',
      range: 'B2',
      formulas: [{ row: 0, column: 0, formula: '=A2*3' }],
    },
  ]);
  await applyWorkbookProposal(formula);
  assert.equal(fake.source.formulas[1][1], '=A2*3');
  assert.equal(fake.source.values[1][0], 2);
  const formatting = await prepare([
    {
      kind: 'format',
      sheet: 'Blank',
      range: 'B2:B3',
      format: { numberFormat: '$#,##0.00', bold: true, fillColor: '#EAF5ED' },
    },
  ]);
  await applyWorkbookProposal(formatting);
  assert.equal(fake.sheets[1].formats[2][1], '$#,##0.00');
  assert.equal(fake.sheets[1].values[2][1], 10);
  const objects = await prepare([
    { kind: 'table', sheet: 'Blank', range: 'A1:B3', mode: 'create', name: 'Sales' },
    {
      kind: 'chart',
      sheet: 'Blank',
      range: 'A1:B3',
      mode: 'create',
      name: 'Revenue',
      chartType: 'column',
      title: 'Revenue by name',
    },
  ]);
  await applyWorkbookProposal(objects);
  assert.equal(fake.sheets[1].tables.items[0].name, 'Sales');
  assert.equal(fake.sheets[1].charts.items[0].name, 'Revenue');
  const tableCell = await prepare([{ kind: 'write', sheet: 'Blank', range: 'B2', values: [[25]] }]);
  await applyWorkbookProposal(tableCell);
  assert.equal(fake.sheets[1].values[1][1], 25, 'Existing table cells can be edited');
  const update = await prepare([
    {
      kind: 'table',
      sheet: 'Blank',
      range: 'A1:B3',
      mode: 'update',
      name: 'Sales',
      style: 'TableStyleLight1',
    },
    {
      kind: 'chart',
      sheet: 'Blank',
      range: 'A1:B3',
      mode: 'update',
      name: 'Revenue',
      chartType: 'bar',
      title: 'Updated',
    },
    {
      kind: 'sort',
      sheet: 'Blank',
      range: 'A1:B3',
      fields: [{ column: 0, ascending: true }],
      hasHeaders: true,
    },
    { kind: 'filter', sheet: 'Blank', range: 'B1:B3', column: 0, values: ['10'] },
  ]);
  await applyWorkbookProposal(update);
  assert.equal(fake.sheets[1].values[1][0], 'A');
  assert.equal(fake.sheets[1].values[1][1], 10);
  assert.equal(fake.sheets[1].charts.items[0].chartType, 'bar');
  assert.equal(fake.sheets[1].tables.items[0].style, 'TableStyleLight1');
  assert.equal(
    fake.writes.findLast((w: any) => w.filter).filter.column,
    1,
    'Filtering a table subrange uses the correct table column',
  );
  await applyWorkbookProposal(
    await prepare([{ kind: 'clear_filter', sheet: 'Blank', range: 'A1:B3' }]),
  );
  assert(fake.writes.some((w: any) => w.clearFilter));
  const stale = await prepare([{ kind: 'write', sheet: 'Input', range: 'A2', values: [[8]] }]);
  fake.source.values[1][0] = 7;
  const writes = fake.writes.length;
  await assert.rejects(verifyProposal(stale), /changed since preview/);
  assert.equal(fake.writes.length, writes);
  fake.protected = true;
  await assert.rejects(
    prepare([{ kind: 'format', sheet: 'Input', range: 'A1', format: { bold: true } }]),
    /protected/,
  );
  fake.protected = false;
  for (const kind of ['insert_rows', 'delete_rows', 'insert_columns', 'delete_columns']) {
    const p = await prepare([{ kind, sheet: 'Input', range: kind.endsWith('rows') ? 'A2' : 'B1' }]);
    const before = kind.endsWith('rows') ? fake.source.values.length : fake.source.values[0].length;
    await applyWorkbookProposal(p);
    assert.equal(
      kind.endsWith('rows') ? fake.source.values.length : fake.source.values[0].length,
      before + (kind.startsWith('insert') ? 1 : -1),
    );
  }
  const large = fake.addSheet(
    'Formatting',
    Array.from({ length: 100 }, () => Array(200).fill(1)),
  );
  const longFormat = '0.00' + ' '.repeat(290);
  const largeFormat = await prepare([
    {
      kind: 'format',
      sheet: 'Formatting',
      range: 'A1:GR100',
      format: { numberFormat: longFormat },
    },
  ]);
  const before = fake.writes.length;
  await applyWorkbookProposal(largeFormat);
  const batches = fake.writes.slice(before).filter((w: any) => w.numberFormat);
  assert(
    batches.length > 1 && batches.every((w: any) => jsonBytes(w.numberFormat) < 512000),
    'Number format matrices have bounded payloads',
  );
  assert.equal(large.formats[99][199], longFormat);
});

test('workbook proposals retain one-time approval and saved SQL scope on existing sheets', async () => {
  const f = await appFixture('workbook-service');
  try {
    const fake = installExcelMock(),
      p = f.store.createProject({ name: 'Workbook', instructions: '', toolsEnabled: false });
    f.store.db
      .prepare("UPDATE project_plugins SET enabled=1 WHERE projectId=? AND plugin='excel'")
      .run(p.id);
    const a = f.excel.create(p.id),
      b = f.excel.create(p.id);
    const operation = randomUUID();
    f.excel.capture(a.conversationId, operation, {
      columns: ['Name', 'Total'],
      rows: [['=literal', 9]],
      affected: 0,
      truncated: false,
    });
    const controller = new AbortController();
    const args = {
      summary: 'Import here',
      actions: [{ kind: 'write', sheet: 'Input', range: 'D1:E2', sourceOperationId: operation }],
    };
    await assert.rejects(
      f.excel.proposeWorkbook(b.conversationId, randomUUID(), args, controller.signal),
      /unavailable/,
    );
    const pending = f.excel.proposeWorkbook(
      a.conversationId,
      randomUUID(),
      args,
      controller.signal,
    );
    const req = f.excel.bridge.peek(a.conversationId)!;
    const details = f.excel.bridge.get(a.conversationId, req.id);
    const checks = await handleWorkbookRequest(details);
    assert.equal(fake.writes.length, 0);
    f.excel.bridge.respond(a.conversationId, req.id, checks);
    const result = await pending;
    assert.equal(f.excel.summaries(a.conversationId)[0]!.operations, 1);
    const proposal = f.excel.get(a.conversationId, result.id) as WorkbookProposal;
    assert.equal(proposal.plan.actions[0]!.kind, 'write');
    f.excel.transition(a.conversationId, result.id, { action: 'claim' });
    assert.throws(
      () => f.excel.transition(a.conversationId, result.id, { action: 'claim' }),
      /already handled/,
    );
    await applyWorkbookProposal(proposal);
    assert.equal(fake.source.values[1][3], '=literal');
    assert.equal(fake.source.formulas[1][3], '=literal');
    f.excel.transition(a.conversationId, result.id, { action: 'applied', result: 'Done' });
    assert.equal(f.excel.summaries(a.conversationId)[0]!.status, 'applied');
  } finally {
    await f.cleanup();
  }
});
