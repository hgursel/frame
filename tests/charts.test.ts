import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { appFixture } from './helpers.js';
import {
  parseCsv,
  parseMarkdown,
  markdownTables,
  transformData,
  transformSchema,
} from '../server/plugins/charts/data.js';

async function fixture() {
  const f = await appFixture('charts');
  const project = f.store.createProject({
    name: 'Chart sources',
    instructions: '',
    toolsEnabled: false,
  });
  const conversation = f.store.createConversation(project.id);
  f.store.setMeta('charts:enabled', 'true');
  f.charts.setProject(project.id, true);
  return { ...f, project, conversation };
}

test('CSV and GFM tables preserve values and reject malformed or oversized input', () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFName,Amount,Note\r\n"North, west",-3,"line 1\nline ""2"""\r\nSouth,,=SUM(A1)\r\n',
    ).rows,
    [
      ['North, west', '-3', 'line 1\nline "2"'],
      ['South', null, '=SUM(A1)'],
    ],
  );
  for (const text of [
    'A,A\n1,2',
    'A,\n1,2',
    'A,B\n1',
    'A\n"unclosed',
    'A\n"x"junk',
    'A\nnot"quoted',
    'A,B',
  ])
    assert.throws(() => parseCsv(text));
  assert.throws(() => parseCsv('A\n' + '1\n'.repeat(5001)), /5,000/);
  const md =
    '# Report\n\n| **Region** | Amount |\n| :--- | ---: |\n| A\\|B | **12.5** |\n| C | |\n\n```md\n| Fake | Data |\n|---|---|\n|1|2|\n```\n\n| Name | Count |\n|---|---|\n| [North](https://example.invalid) | `2` |';
  assert.equal(markdownTables(md).length, 2);
  assert.deepEqual(parseMarkdown(md).columns, ['Region', 'Amount']);
  assert.deepEqual(parseMarkdown(md).rows, [
    ['A|B', '12.5'],
    ['C', null],
  ]);
  assert.deepEqual(parseMarkdown(md, 2).rows, [['North', '2']]);
  assert.throws(() => parseMarkdown(md, 3), /has 2 tables/);
  assert.throws(() => parseMarkdown('| A | B |\n|---|---|\n|1|'), /column count/);
});

test('local transformations filter before grouping, preserve nulls and source limits, and sort numeric values', () => {
  const input = {
    ...parseCsv(
      'Region,Amount,Active\nNorth,10,yes\nNorth,2,yes\nSouth,,yes\nSouth,8,no\nEast,-3,yes',
    ),
    truncated: true,
  };
  const apply = (args: object) =>
    transformData(input, transformSchema.parse({ datasetId: randomUUID(), ...args }));
  const result = apply({
    filters: [{ column: 'Active', op: 'eq', value: 'yes' }],
    groupBy: ['Region'],
    measures: [
      { column: 'Amount', operation: 'sum', as: 'Total' },
      { column: 'Amount', operation: 'avg', as: 'Average' },
      { operation: 'count', as: 'Rows' },
      { column: 'Amount', operation: 'count', as: 'Values' },
    ],
    sort: [{ column: 'Total', direction: 'desc', numeric: true }],
  });
  assert.deepEqual(result.rows, [
    ['North', 12, 6, 2, 2],
    ['East', -3, -3, 1, 1],
    ['South', null, null, 1, 0],
  ]);
  assert(result.truncated);
  assert.equal(input.rows.length, 5);
  assert.deepEqual(
    apply({
      measures: [
        { column: 'Amount', operation: 'min', as: 'Min' },
        { column: 'Amount', operation: 'max', as: 'Max' },
      ],
    }).rows,
    [['All rows', -3, 10]],
  );
  assert.deepEqual(
    apply({
      filters: [{ column: 'Amount', op: 'gte', value: 8 }],
      sort: [{ column: 'Amount', direction: 'asc', numeric: true }],
    }).rows.map((r) => r[1]),
    ['8', '10'],
  );
  assert.throws(() => apply({ groupBy: ['Region'] }), /requires/);
  assert.throws(() => apply({ measures: [{ operation: 'sum', as: 'Total' }] }), /require/);
  assert.throws(
    () => apply({ filters: [{ column: 'Region', op: 'eq', value: 'Missing' }] }),
    /No rows/,
  );
  assert.throws(() => apply({ filters: [{ column: 'Amount', op: 'gt' }] }), /requires a value/);
  assert.throws(
    () => apply({ sort: [{ column: 'Region', direction: 'asc', numeric: true }] }),
    /numeric/,
  );
  assert.throws(() => apply({ script: 'process.exit()' }));
  assert.throws(
    () =>
      transformData(
        parseCsv('Region,Amount\nA,9007199254740991\nA,1'),
        transformSchema.parse({
          datasetId: randomUUID(),
          groupBy: ['Region'],
          measures: [{ column: 'Amount', operation: 'sum', as: 'Total' }],
        }),
      ),
    /safely/,
  );
});

test('chart sources use full project files, selected chat branch and scoped artifacts without MSSQL', async () => {
  const f = await fixture();
  try {
    const c = f.conversation.id,
      p = f.project.id;
    // Full CSV is over the knowledge excerpt limit but inside chart limits.
    const csv =
      'Region,Amount,Note\n' +
      Array.from({ length: 200 }, (_, i) => `North,${i},${'x'.repeat(700)}`).join('\n');
    const doc = await f.knowledge.add(p, 'sales.csv', Buffer.from(csv));
    assert(doc.truncated);
    const catalog = await f.charts.listSources(c, {});
    assert(catalog.sources.some((s) => s.id === doc.id));
    const imported = await f.charts.importSource(c, { kind: 'document', id: doc.id });
    assert.equal(imported.rows, 200);
    const calculated = f.charts.transform(c, {
      datasetId: imported.datasetId,
      groupBy: ['Region'],
      measures: [{ column: 'Amount', operation: 'sum', as: 'Total' }],
    });
    const ref = f.charts.create(c, {
      datasetId: calculated.datasetId,
      title: 'Sales',
      kind: 'bar',
      x: 'Region',
      y: ['Total'],
    });
    assert.deepEqual(f.charts.get(c, ref.id).rows, [['North', 19900]]);
    assert.equal(f.charts.get(c, ref.id).truncated, false);
    assert.equal(f.charts.get(c, ref.id).source?.name, 'sales.csv');
    const md = '| Item | Amount |\n|---|---|\n| A | 3 |';
    const page = await f.knowledge.add(p, 'page.md', Buffer.from(md), 'wiki');
    await f.knowledge.edit(p, page.id, page.revision, md.replace('3', '5'));
    const edited = await f.charts.importSource(c, { kind: 'document', id: page.id });
    const chart = f.charts.create(c, {
      datasetId: edited.datasetId,
      title: 'Edited',
      kind: 'pie',
      x: 'Item',
      y: ['Amount'],
    });
    assert.deepEqual(f.charts.get(c, chart.id).rows, [['A', 5]]);
    await writeFile(
      f.store.sessionFile(c),
      [
        { id: 'user', parentId: null, type: 'message', message: { role: 'user', content: md } },
        {
          id: 'abandoned',
          parentId: 'user',
          type: 'message',
          message: { role: 'assistant', content: md },
        },
        {
          id: 'current',
          parentId: 'user',
          type: 'message',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: md },
              { type: 'text', text: md.replace('3', '8') },
            ],
          },
        },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n') + '\n',
    );
    const messages = await f.charts.listSources(c, { kind: 'message' });
    assert.deepEqual(
      messages.sources.map((s) => s.id),
      ['current', 'user'],
    );
    const fromChat = await f.charts.importSource(c, { kind: 'message', id: 'current' });
    assert.equal(fromChat.source?.name, 'Assistant (unverified) message');
    await assert.rejects(
      f.charts.importSource(c, { kind: 'message', id: 'abandoned' }),
      /not found/,
    );
    const root = f.store.artifacts(f.conversation);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'result.md'), md);
    const artifact = await f.charts.importSource(c, { kind: 'file', id: 'result.md' });
    assert.equal(artifact.rows, 1);
    await symlink(path.join(root, 'result.md'), path.join(root, 'linked.md'));
    await assert.rejects(f.charts.importSource(c, { kind: 'file', id: 'linked.md' }));
    await link(path.join(root, 'result.md'), path.join(root, 'hard.md'));
    await assert.rejects(f.charts.importSource(c, { kind: 'file', id: 'hard.md' }));
    await assert.rejects(f.charts.importSource(c, { kind: 'file', id: '../result.md' }));
    const otherProject = f.store.createProject({
      name: 'Other',
      toolsEnabled: false,
      instructions: '',
    });
    const other = f.store.createConversation(otherProject.id);
    f.charts.setProject(otherProject.id, true);
    await assert.rejects(
      f.charts.importSource(other.id, { kind: 'document', id: doc.id }),
      /not found/,
    );
    await assert.rejects(
      f.charts.importSource(other.id, { kind: 'message', id: 'user' }),
      /not found/,
    );
    assert.throws(
      () => f.charts.transform(other.id, { datasetId: imported.datasetId }),
      /not found/,
    );
    f.charts.setProject(p, false);
    await assert.rejects(f.charts.listSources(c, {}), /disabled/);
    await assert.rejects(f.charts.importSource(c, { kind: 'document', id: doc.id }), /disabled/);
    assert.throws(() => f.charts.transform(c, { datasetId: imported.datasetId }), /disabled/);
    assert.deepEqual(
      f.charts.get(c, ref.id).rows,
      [['North', 19900]],
      'Saved chart stays readable',
    );
  } finally {
    await f.cleanup();
  }
});
