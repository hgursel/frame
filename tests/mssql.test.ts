import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../server/app.js';
import { classify } from '../server/plugins/mssql/policy.js';
import {
  SchemaCache,
  importanceOf,
  matchExpression,
  typeName,
  words,
} from '../server/plugins/mssql/schema.js';
import { columnNames, components, validateNote } from '../server/plugins/mssql/notes.js';
import { extractJson } from '../server/plugins/mssql/generate.js';
import { config, FakeGenerator, FakeSql } from './sql-fixture.js';
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-sql-'));
  const driver = new FakeSql();
  const generator = new FakeGenerator();
  const ctx = await createApp({
    dataDir: root,
    origin: 'http://127.0.0.1:3000',
    setupToken: 'test',
    sqlDriver: driver,
    generator,
  });
  const req = (url: string, method = 'GET', payload?: unknown, cookie = '') =>
    ctx.app.inject({
      url: '/api' + url,
      method: method as any,
      payload: payload as any,
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', cookie },
    });
  await req('/auth/setup', 'POST', { token: 'test', password: 'test-password-1234' });
  const login = await req('/auth/login', 'POST', { password: 'test-password-1234' });
  const cookie = String(login.headers['set-cookie']).split(';')[0]!;
  const auth = (url: string, method = 'GET', payload?: unknown) =>
    req(url, method, payload, cookie);
  const project = ctx.store.createProject({
    name: 'SQL development',
    instructions: '',
    toolsEnabled: false,
  });
  const conversation = ctx.store.createConversation(project.id);
  return {
    ...ctx,
    root,
    driver,
    generator,
    project,
    conversation,
    req,
    auth,
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('MSSQL SQL policy parses statements and fails closed at dangerous boundaries', () => {
  for (const sql of [
    'SELECT TOP 10 id FROM dbo.t',
    'WITH c AS (SELECT id FROM dbo.t) SELECT * FROM c',
    'SELECT COUNT(*) FROM dbo.t',
    'SELECT id FROM dbo.t WHERE name=@name',
  ])
    assert.equal(classify({ database: 'Dev', sql }, config), 'read');
  for (const sql of [
    'INSERT INTO dbo.t(id) VALUES (1)',
    'UPDATE dbo.t SET id=2 WHERE id=1',
    'DELETE FROM dbo.t WHERE id=1',
  ])
    assert.equal(classify({ database: 'Dev', sql }, config), 'data');
  for (const sql of [
    'CREATE TABLE dbo.t (id int PRIMARY KEY)',
    'ALTER TABLE dbo.t ADD name nvarchar(100)',
    'DROP TABLE dbo.t',
    'CREATE INDEX ix ON dbo.t (id)',
  ])
    assert.equal(classify({ database: 'Dev', sql }, config), 'schema');
  for (const sql of [
    'SELECT * INTO dbo.copy FROM dbo.t',
    'SELECT 1; DELETE FROM dbo.t',
    'SELECT * FROM Other.dbo.t',
    'SELECT * FROM [Other].[dbo].[t]',
    'SELECT * FROM Other..t',
    'SELECT * FROM [linked].[Dev].[dbo].[t]',
    "SELECT * FROM OPENROWSET('x','y','z')",
    'EXEC dbo.Approved',
    'EXEC(@sql)',
    'USE Other; SELECT 1',
    'DROP DATABASE Dev',
    'CREATE PROCEDURE dbo.X AS SELECT 1',
    'CREATE TRIGGER dbo.X ON dbo.t AFTER INSERT AS DELETE FROM dbo.t',
    'SELECT NEXT VALUE FOR dbo.seq',
    'SELECT dbo.side_effect()',
    'GRANT CONTROL TO reader',
    'SELECT 1 /* hidden */',
    'SELECT 1 GO DELETE FROM dbo.t',
  ])
    assert.throws(() => classify({ database: 'Dev', sql }, config), sql);
  assert.throws(() =>
    classify({ database: 'Dev', sql: 'DELETE FROM dbo.t' }, { ...config, allowDataChanges: false }),
  );
  assert.throws(() =>
    classify(
      { database: 'Dev', sql: 'DROP TABLE dbo.t' },
      { ...config, allowSchemaChanges: false },
    ),
  );
  assert.throws(() => classify({ database: 'Other', sql: 'SELECT 1' }, config));
  assert.throws(() =>
    classify({ database: 'Dev', procedure: { schema: 'dbo', name: 'Unlisted' } }, config),
  );
  assert.equal(
    classify({ database: 'Dev', procedure: { schema: 'dbo', name: 'Approved' } }, config),
    'procedure',
  );
});
test('MSSQL settings are secret, project access is enforced, approvals execute exactly once', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.req('/plugins/mssql')).statusCode, 401);
    const saved = await f.auth('/plugins/mssql', 'PUT', config);
    assert.equal(saved.statusCode, 200);
    assert(!saved.body.includes('reader-secret'));
    assert(!saved.body.includes('writer-secret'));
    assert.equal((await f.auth('/plugins/mssql')).json().read.hasPassword, true);
    await assert.rejects(
      f.mssql.invoke(f.conversation.id, randomUUID(), 'query', {
        database: 'Dev',
        sql: 'SELECT 1',
      }),
      /disabled/,
    );
    assert.equal(
      (await f.auth(`/projects/${f.project.id}/plugins`, 'PUT', { mssql: true })).statusCode,
      200,
    );
    const read: any = await f.mssql.invoke(f.conversation.id, randomUUID(), 'query', {
      database: 'Dev',
      sql: 'SELECT * FROM dbo.t',
    });
    assert.equal(f.driver.calls.at(-1)?.login, 'read');
    assert.equal(read.rows.length, 2);
    const csv = await readFile(path.join(f.store.artifacts(f.conversation), read.csv), 'utf8');
    assert(csv.includes("'=HYPERLINK"));
    const runId = randomUUID();
    const change = f.mssql.invoke(f.conversation.id, runId, 'query', {
      database: 'Dev',
      sql: 'UPDATE dbo.t SET id=2 WHERE id=1',
    });
    const approval = f.mssql.approval(f.conversation.id)!;
    assert(approval);
    assert.equal(f.driver.calls.length, 1);
    assert.equal(
      (
        await f.req(`/conversations/${f.conversation.id}/sql-approvals/${approval.id}`, 'POST', {
          runId,
          approve: true,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.auth(`/conversations/${randomUUID()}/sql-approvals/${approval.id}`, 'POST', {
          runId,
          approve: true,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.auth(`/conversations/${f.conversation.id}/sql-approvals/${approval.id}`, 'POST', {
          runId: randomUUID(),
          approve: true,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.auth(`/conversations/${f.conversation.id}/sql-approvals/${approval.id}`, 'POST', {
          runId,
          approve: true,
        })
      ).statusCode,
      200,
    );
    await change;
    assert.equal(f.driver.calls.length, 2);
    assert.equal(f.driver.calls.at(-1)?.login, 'write');
    assert.equal(
      (
        await f.auth(`/conversations/${f.conversation.id}/sql-approvals/${approval.id}`, 'POST', {
          runId,
          approve: true,
        })
      ).statusCode,
      409,
    );
    const denied = f.mssql.invoke(f.conversation.id, randomUUID(), 'query', {
      database: 'Dev',
      procedure: { schema: 'dbo', name: 'Approved' },
      parameters: [{ name: 'id', type: 'int', value: 5 }],
    });
    const denial = assert.rejects(denied, /denied/);
    const pending = f.mssql.approval(f.conversation.id)!;
    f.mssql.decide(f.conversation.id, pending.id, pending.runId, false);
    await denial;
    assert.equal(f.driver.calls.length, 2);
    const stoppedRun = randomUUID();
    const stopped = f.mssql.invoke(f.conversation.id, stoppedRun, 'query', {
      database: 'Dev',
      sql: 'DELETE FROM dbo.t',
    });
    const cancelled = assert.rejects(stopped);
    f.mssql.cancelRun(stoppedRun);
    await cancelled;
    assert.equal(f.driver.calls.length, 2);
    // Server-side state changes cannot reuse an approval issued under an earlier policy.
    const stale = f.mssql.invoke(f.conversation.id, randomUUID(), 'query', {
      database: 'Dev',
      sql: 'DELETE FROM dbo.t',
    });
    const staleReject = assert.rejects(stale, /settings changed/);
    const old = f.mssql.approval(f.conversation.id)!;
    f.mssql.save({ ...config, maxRows: 100 });
    f.mssql.decide(f.conversation.id, old.id, old.runId, true);
    await staleReject;
    assert.equal(f.driver.calls.length, 2);
  } finally {
    await f.cleanup();
  }
});
test('Schema import scales past 1000 objects, is project-scoped, preserves prior cache, and exports OKF', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    const note = await f.knowledge.add(
      f.project.id,
      'Business meaning.md',
      Buffer.from('Keep this human note.'),
      'wiki',
    );
    await f.wiki.record(f.project.id, note.id);
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.status(f.project.id).count, 1105);
    assert.equal(f.mssql.schema.status(f.project.id).state, 'ready');
    assert.equal(f.knowledge.list(f.project.id).length, 1);
    const search: any = f.mssql.schema.search(f.project.id, ['Dev'], 'Table1105');
    assert.equal(search.total, 1);
    const object = f.mssql.schema.read(f.project.id, ['Dev'], search.objects[0].id);
    assert.match(object.text, /## Summary/);
    assert.match(object.text, /\| 1 \| id \| int identity \| no \| PK \|/);
    assert.match(object.text, /FK → dbo\.Table1\.id/);
    assert.equal(object.rowCount, 11050);
    assert.match(String(search.objects[0].summary), /4 columns/);
    assert.equal(f.mssql.schema.search(randomUUID(), ['Dev'], '').total, 0);
    assert.throws(() => f.mssql.schema.read(f.project.id, ['Other'], object.id));
    const exported = unzipSync(
      (await f.auth(`/projects/${f.project.id}/mssql/schema/export`)).rawPayload,
    );
    assert(Object.keys(exported).length > 1105);
    assert.match(strFromU8(exported['index.md']!), /okf_version/);
    f.driver.count = 1104;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.read(f.project.id, ['Dev'], object.id).obsolete, true);
    assert.equal((await f.knowledge.read(f.project.id, note.id)).text, 'Keep this human note.');
    f.driver.failMetadata = true;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.status(f.project.id).state, 'error');
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], '').total, 1104);
    // Index entries never outlive their rows; a recycled SQLite rowid cannot resurrect an object.
    const counts = f.store.db
      .prepare(
        'SELECT (SELECT count(*) FROM mssql_schema) AS stored, (SELECT count(*) FROM mssql_schema_fts) AS indexed',
      )
      .get() as any;
    assert.equal(counts.indexed, counts.stored);
    f.mssql.save({ ...config, server: 'other.internal' });
    assert.throws(
      () => f.mssql.schema.ensureSource(f.project.id, f.mssql.settings()),
      /Connection/,
    );
  } finally {
    await f.cleanup();
  }
});
test('SQL cancellation aborts an executing driver and records writes as uncertain', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.driver.hold = true;
    const runId = randomUUID();
    const task = f.mssql.invoke(f.conversation.id, runId, 'query', {
      database: 'Dev',
      sql: 'UPDATE dbo.t SET id=2',
    });
    const rejected = assert.rejects(task);
    const p = f.mssql.approval(f.conversation.id)!;
    f.mssql.decide(f.conversation.id, p.id, runId, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    f.mssql.cancelRun(runId);
    await rejected;
    assert.equal(
      (f.store.db.prepare('SELECT status FROM mssql_operations WHERE id=?').get(p.id) as any)
        .status,
      'unknown',
    );
    assert.equal(f.driver.calls.length, 1);
  } finally {
    await f.cleanup();
  }
});

test('Schema search ranks by relevance and prominence, and falls back for unindexed caches', async () => {
  const f = await fixture();
  try {
    assert.equal(words('LG_001_CLCARD'), 'LG 001 CLCARD');
    assert.equal(words('CustomerOrderLine'), 'Customer Order Line');
    assert.equal(matchExpression('cari "hesap*'), '"cari"* AND "hesap"*');
    // Turkish dotless i and cedillas fold on both sides, so ASCII typing finds accented metadata.
    assert.equal(words('AÇIKLAMA'), 'ACIKLAMA');
    assert.equal(words('ŞubeKodu'), 'Sube Kodu');
    assert.equal(matchExpression('Açıklama'), '"Aciklama"*');
    assert.equal(matchExpression('   '), '');
    // sys.columns.max_length is bytes: 200 bytes of nvarchar is 100 characters.
    assert.equal(typeName({ dataType: 'nvarchar', maxLength: 200 }), 'nvarchar(100)');
    assert.equal(typeName({ dataType: 'varchar', maxLength: 200 }), 'varchar(200)');
    assert.equal(typeName({ dataType: 'varchar', maxLength: -1 }), 'varchar(max)');
    assert.equal(typeName({ dataType: 'decimal', precision: 18, scale: 2 }), 'decimal(18,2)');
    assert(importanceOf(1_000_000, 40, 'USER_TABLE', true) > importanceOf(5, 0, 'VIEW', false));

    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.driver.count = 300;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.fts, true);

    // Column names are searchable, and the most referenced table wins an otherwise equal match.
    const columnHit: any = f.mssql.schema.search(f.project.id, ['Dev'], 'parentId');
    assert.equal(columnHit.total, 300);
    assert.equal(columnHit.objects[0].name, 'Table1');
    assert.equal(columnHit.objects[0].obsolete, false);
    // Prefixes and split identifier parts match without a full-text substring scan.
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'paren').total, 300);
    // Accented column names and descriptions are reachable by their ASCII spelling.
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'aciklama').total, 300);
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'açıklama').total, 300);
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'sube').total, 300);
    // A name match still outranks a merely prominent object.
    const named: any = f.mssql.schema.search(f.project.id, ['Dev'], 'Table297');
    assert.equal(named.total, 1);
    assert.equal(named.objects[0].name, 'Table297');
    // Browsing with no query leads with the objects that carry the most structure.
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], '').objects[0].name, 'Table1');
    // FTS operators in user input are literal terms, never syntax: OR does not widen the match.
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'Table297 OR Table298').total, 0);
    // Input with nothing tokenizable browses instead of failing.
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], '*').total, 300);

    // A cache imported before the index exists still searches, unranked.
    f.store.db.exec('UPDATE mssql_schema SET label=NULL');
    const legacy = new SchemaCache(f.store, f.driver);
    const scanned: any = legacy.search(f.project.id, ['Dev'], 'Table297');
    assert.equal(scanned.total, 1);
    assert.equal(scanned.objects[0].name, 'Table297');
    assert.equal(legacy.search(f.project.id, ['Dev'], 'no-such-object').total, 0);
  } finally {
    await f.cleanup();
  }
});

test('Schema enrichment validates model output, survives refresh, and never overrides catalog facts', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(extractJson('noise {"a":{"b":"}"},"c":1} tail'), { a: { b: '}' }, c: 1 });
    assert.equal(extractJson('no json here'), undefined);
    assert.equal(validateNote({ grain: 'x' }, { text: '' }), undefined);
    const page = '## Columns\n| # | Column |\n|---|---|\n| 1 | Id |\n| 2 | Ref |\n## Relationships';
    assert.deepEqual(columnNames(page), ['Id', 'Ref']);
    const checked = validateNote(
      { purpose: 'p', columnNotes: { id: 'real', ghost: 'invented' }, confidence: 'high' },
      { text: page },
    )!;
    // A real column is kept under its catalog spelling; an invented one is dropped, not stored.
    assert.deepEqual(checked.columnNotes, { Id: 'real' });
    assert.equal(checked.invented, 1);
    assert.deepEqual(
      components([
        { schema: 'dbo', name: 'A', refs: '["dbo.B"]' },
        { schema: 'dbo', name: 'B', refs: '[]' },
        { schema: 'dbo', name: 'C', refs: '[]' },
      ]).map((c) => c.length),
      [2, 1],
    );

    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.driver.count = 6;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;

    assert.throws(() => f.mssql.notes.start(randomUUID(), config), /Initialize schema/);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test-model' });
    f.mssql.notes.start(f.project.id, config);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    const status = f.mssql.notes.status(f.project.id);
    assert.equal(status.state, 'ready');
    assert(status.count >= 6);

    const note = f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table3')!;
    assert.equal(note.purpose, 'Holds business records.');
    assert.equal(note.modelId, 'test-model');
    assert.equal(note.state, 'proposed');
    // The model annotated a column that does not exist; only the real one survives.
    assert.deepEqual(Object.keys(note.columnNotes), ['parentId']);
    assert.equal(note.invented, 1);

    // Aliases become searchable, so business vocabulary reaches a table that never contained it.
    assert(f.mssql.schema.search(f.project.id, ['Dev'], 'cari hesap').total >= 6);
    assert(f.mssql.schema.search(f.project.id, ['Dev'], 'musteri').total >= 6);

    // Notes render below the catalog facts, labelled and unreviewed.
    const search: any = f.mssql.schema.search(f.project.id, ['Dev'], 'Table3');
    const read: any = await f.mssql.invoke(f.conversation.id, randomUUID(), 'schema_read', {
      id: search.objects[0].id,
      offset: 0,
    });
    assert(read.text.indexOf('## Columns') < read.text.indexOf('## Notes'));
    assert.match(read.text, /not reviewed/);
    assert.match(read.text, /Model-written interpretation/);

    // Only tables actually in the cluster survive validation of a domain page.
    const domains = f.mssql.notes.search(f.project.id, '', 'domain');
    assert.equal(domains.pages.length, 1);
    assert.doesNotMatch(String(domains.pages[0]!.body), /NotInCluster/);
    // Glossary terms the schema does not actually repeat are dropped.
    const glossary = f.mssql.notes.search(f.project.id, '', 'glossary');
    assert.equal(glossary.pages.length, 1);
    assert.equal(glossary.pages[0]!.title, 'Table');

    // The prompt map stays small enough to sit in a system prompt.
    const map = f.mssql.notes.map(f.project.id);
    assert.match(map, /Subject areas: Sales/);
    assert.match(map, /Most connected objects/);
    assert(map.length < 4000);

    // A second run is idempotent: unchanged facts cost no model calls.
    const before = f.generator.calls.length;
    f.mssql.notes.start(f.project.id, config);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(
      f.generator.calls.slice(before).filter((c) => c.includes('"columnNotes"')).length,
      0,
    );

    // Notes outlive a schema refresh, and their aliases are folded back into the new generation.
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(
      f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table3')?.purpose,
      'Holds business records.',
    );
    assert(f.mssql.schema.search(f.project.id, ['Dev'], 'cari hesap').total >= 6);

    // Review marks a note reviewed without rewriting it.
    f.mssql.notes.decide(f.project.id, 'Dev', 'dbo', 'Table3', true);
    assert.equal(f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table3')?.state, 'accepted');
    assert.throws(
      () => f.mssql.notes.decide(f.project.id, 'Dev', 'dbo', 'Missing', true),
      /No note/,
    );

    // A search that finds nothing is recorded as missing vocabulary.
    await f.mssql.invoke(f.conversation.id, randomUUID(), 'schema_search', { query: 'fatura' });
    assert.equal(f.mssql.notes.gaps(f.project.id)[0]?.term, 'fatura');

    // The OKF export carries notes and generated knowledge pages alongside the catalog pages.
    const exported = unzipSync(
      (await f.auth(`/projects/${f.project.id}/mssql/schema/export`)).rawPayload,
    );
    assert(Object.keys(exported).some((k) => k.startsWith('mssql-knowledge/domain-')));
    assert.match(strFromU8(exported['mssql/' + search.objects[0].id + '.md']!), /## Notes/);
  } finally {
    await f.cleanup();
  }
});

test('Value sampling is off by default, and vocabulary gaps become searchable aliases', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test-model' });
    f.driver.count = 4;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;

    // Nothing reads business rows unless an administrator turns sampling on.
    f.mssql.notes.start(f.project.id, config);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(config.allowValueSampling, false);
    assert.equal(f.mssql.notes.search(f.project.id, '', 'codes').pages.length, 0);
    assert.equal(
      f.driver.calls.filter((c) => /SELECT TOP \(50\)/.test(c.command.sql || '')).length,
      0,
    );

    // With it on, only small referenced tables are sampled, through the read login.
    const sampling = { ...config, allowValueSampling: true };
    f.mssql.save(sampling);
    f.mssql.notes.start(f.project.id, sampling);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    const samples = f.driver.calls.filter((c) => /SELECT TOP \(50\)/.test(c.command.sql || ''));
    assert(samples.length > 0);
    assert(samples.every((c) => c.login === 'read'));
    assert.match(
      String(f.mssql.notes.search(f.project.id, '', 'codes').pages[0]?.body),
      /1 = open/,
    );

    // An unanswered search becomes an alias on the object the model identifies.
    await f.mssql.invoke(f.conversation.id, randomUUID(), 'schema_search', { query: 'fatura' });
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'fatura').total, 0);
    f.generator.gapTarget = 'dbo.Table1';
    f.mssql.notes.start(f.project.id, sampling);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'fatura').total, 1);
    assert.equal(f.mssql.notes.gaps(f.project.id)[0]?.resolved, 'Dev.dbo.Table1');
    assert(f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table1')!.aliases.includes('fatura'));

    // An object the model names but that does not exist is ignored.
    await f.mssql.invoke(f.conversation.id, randomUUID(), 'schema_search', { query: 'irsaliye' });
    f.generator.gapTarget = 'dbo.NoSuchTable';
    f.mssql.notes.start(f.project.id, sampling);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'irsaliye').total, 0);
    assert.equal(
      f.mssql.notes.gaps(f.project.id).find((g: any) => g.term === 'irsaliye')?.resolved,
      null,
    );
  } finally {
    await f.cleanup();
  }
});

test('Enrichment endpoints are authenticated, project-scoped, and blocked while busy', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test-model' });
    // Unauthenticated callers reach nothing.
    assert.equal((await f.req(`/projects/${f.project.id}/mssql/notes/status`)).statusCode, 401);
    // The plugin must be enabled for the project before knowledge can be generated.
    assert.equal(
      (await f.auth(`/projects/${f.project.id}/mssql/notes`, 'POST', {})).statusCode,
      403,
    );
    f.mssql.setProject(f.project.id, true);
    // Schema knowledge has to exist first.
    assert.equal(
      (await f.auth(`/projects/${f.project.id}/mssql/notes`, 'POST', {})).statusCode,
      409,
    );

    f.driver.count = 3;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    let paused = true;
    f.mssql.notes.busy = () => paused;
    const started = await f.auth(`/projects/${f.project.id}/mssql/notes`, 'POST', {});
    assert.equal(started.statusCode, 202);
    // A second run cannot start while the first is in flight.
    assert.equal(
      (await f.auth(`/projects/${f.project.id}/mssql/notes`, 'POST', {})).statusCode,
      409,
    );
    // Settings cannot move under a run that already captured them, including value sampling.
    assert.equal((await f.auth('/plugins/mssql', 'PUT', config)).statusCode, 409);
    paused = false;
    await f.mssql.notes.jobs.get(f.project.id)!.done;

    const pages = await f.auth(`/projects/${f.project.id}/mssql/notes/pages?kind=domain`);
    assert.equal(pages.statusCode, 200);
    assert.equal(pages.json().pages[0].kind, 'domain');
    assert.equal((await f.auth(`/projects/${f.project.id}/mssql/notes/gaps`)).statusCode, 200);
    assert.equal(
      (await f.auth(`/projects/${f.project.id}/mssql/notes/status`)).json().state,
      'ready',
    );
    // A note decision rejects an object that has none.
    assert.equal(
      (
        await f.auth(`/projects/${f.project.id}/mssql/notes/decide`, 'POST', {
          database: 'Dev',
          schema: 'dbo',
          name: 'Missing',
          accept: true,
        })
      ).statusCode,
      404,
    );
    // The object preview carries the note under the catalog facts.
    const id = f.mssql.schema.search(f.project.id, ['Dev'], 'Table1').objects[0]!.id;
    const preview = await f.auth(`/projects/${f.project.id}/mssql/schema/objects/${id}`);
    assert.match(preview.json().text, /## Notes/);
  } finally {
    await f.cleanup();
  }
});

test('Enrichment reports model failure, yields to chat, and can be cancelled', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test-model' });
    f.driver.count = 3;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;

    // A model that cannot answer leaves no notes behind and never invents them.
    f.generator.fail = true;
    f.mssql.notes.start(f.project.id, config);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.notes.status(f.project.id).count, 0);
    assert.equal(f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table1'), undefined);
    f.generator.fail = false;

    // Prose around the JSON is tolerated; a small local model rarely answers with bare JSON.
    f.generator.prose = true;
    f.mssql.notes.start(f.project.id, config);
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(
      f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table1')?.purpose,
      'Holds business records.',
    );

    // Cancellation stops the run and keeps what was already written.
    f.store.db.exec('DELETE FROM mssql_notes');
    let paused = true;
    f.mssql.notes.busy = () => paused;
    f.mssql.notes.start(f.project.id, config);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.match(String(f.mssql.notes.status(f.project.id).progress), /Paused/);
    f.mssql.notes.cancel(f.project.id);
    paused = false;
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.notes.status(f.project.id).state, 'cancelled');
  } finally {
    await f.cleanup();
  }
});
