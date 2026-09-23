import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile, symlink, rename, lstat } from 'node:fs/promises';
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
import { recoverDeletions } from '../server/deletion.js';
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
    const other: any = f.mssql.schema
      .search(f.project.id, ['Dev'], 'Table298')
      .objects.find((o: any) => o.name === 'Table298');
    f.mssql.schema.applyTerms(f.project.id, other.id, 'Table297');
    f.store.db.prepare('UPDATE mssql_schema SET importance=100000000 WHERE id=?').run(other.id);
    assert.equal(
      f.mssql.schema.search(f.project.id, ['Dev'], 'Table297').objects[0].name,
      'Table297',
      'Table size must not override textual relevance',
    );
    f.store.db.prepare('UPDATE mssql_schema SET importance=0 WHERE id=?').run(other.id);
    f.mssql.schema.applyTerms(f.project.id, other.id, '');
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
    assert.match(map, /Subject areas: Dev: Sales/);
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
          version: '0'.repeat(64),
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
    assert.equal(f.mssql.notes.status(f.project.id).state, 'error');
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

test('Review decisions survive unchanged refreshes; rejection removes aliases and source changes clear interpretations', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test-model' });
    f.driver.count = 2;
    const refresh = async () => {
      f.mssql.schema.start(f.project.id, f.mssql.settings());
      await f.mssql.schema.jobs.get(f.project.id)!.done;
    };
    const generate = async () => {
      f.mssql.notes.start(f.project.id, f.mssql.settings());
      await f.mssql.notes.jobs.get(f.project.id)!.done;
    };
    await refresh();
    await generate();
    const doc = f.mssql.schema.search(f.project.id, ['Dev'], 'Table1').objects[0]!;
    const before = f.mssql.notes.version(f.project.id, 'Dev', 'dbo', 'Table1')!;
    const decide = (accept: boolean, version = before) =>
      f.auth(`/projects/${f.project.id}/mssql/notes/decide`, 'POST', {
        database: 'Dev',
        schema: 'dbo',
        name: 'Table1',
        accept,
        version,
      });
    assert.equal((await decide(true)).statusCode, 200);
    assert.equal(
      (await decide(false)).statusCode,
      409,
      'An older review must not apply to a changed note',
    );
    await refresh();
    const calls = f.generator.calls.length;
    await generate();
    assert.equal(
      f.generator.calls.slice(calls).filter((c) => c.includes('"columnNotes"')).length,
      0,
      'Import timestamps must not trigger regeneration',
    );
    assert.equal(f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table1')?.state, 'accepted');
    assert.equal(
      (await decide(false, f.mssql.notes.version(f.project.id, 'Dev', 'dbo', 'Table1')!))
        .statusCode,
      200,
    );
    const read: any = await f.mssql.invoke(f.conversation.id, randomUUID(), 'schema_read', {
      id: doc.id,
    });
    assert.doesNotMatch(read.text, /Holds business records/);
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'cari hesap').total, 1);
    await refresh();
    await generate();
    assert.equal(
      f.mssql.schema.search(f.project.id, ['Dev'], 'cari hesap').total,
      1,
      'Refresh must not resurrect rejected aliases',
    );
    f.mssql.save({ ...config, server: 'different.internal' });
    assert.equal(f.mssql.knowledgeMap(f.project.id), '');
    assert.equal((await f.auth(`/projects/${f.project.id}/mssql/notes/pages`)).statusCode, 409);
    await refresh();
    assert.equal(f.mssql.notes.pages(f.project.id).length, 0);
    assert.equal(f.mssql.notes.note(f.project.id, 'Dev', 'dbo', 'Table1'), undefined);
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'cari hesap').total, 0);
  } finally {
    await f.cleanup();
  }
});

test('Schema publication rolls back reindex failures and supports SQLite without FTS', async () => {
  const f = await fixture();
  try {
    f.driver.count = 2;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    const original = f.mssql.schema.generation(f.project.id);
    f.mssql.schema.afterImport = () => {
      throw new Error('index failed');
    };
    f.driver.count = 3;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.status(f.project.id).state, 'error');
    assert.equal(f.mssql.schema.generation(f.project.id), original);
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], '').total, 2);
    // Simulate a build without the optional FTS5 module, including the table being absent.
    Object.defineProperty(f.mssql.schema, 'fts', { value: false });
    f.store.db.exec('DROP TABLE mssql_schema_fts');
    f.mssql.schema.afterImport = undefined;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.schema.status(f.project.id).state, 'ready');
    assert.equal(f.mssql.schema.search(f.project.id, ['Dev'], 'Table3').total, 1);
  } finally {
    await f.cleanup();
  }
});

test('Foreign-key groups stay within databases and source-specific recipes do not cross connections', async () => {
  assert.deepEqual(
    components([
      { database: 'A', schema: 'dbo', name: 'Parent', refs: '[]' },
      { database: 'A', schema: 'dbo', name: 'Child', refs: '["dbo.Parent"]' },
      { database: 'B', schema: 'dbo', name: 'Parent', refs: '[]' },
      { database: 'B', schema: 'dbo', name: 'Child', refs: '["dbo.Parent"]' },
    ]).map((c) => new Set(c.map((o) => o.database)).size),
    [1, 1],
  );
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.driver.count = 1;
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test-model' });
    await f.mssql.invoke(f.conversation.id, randomUUID(), 'query', {
      database: 'Dev',
      sql: 'SELECT 1',
    });
    f.mssql.save({ ...config, server: 'different.internal' });
    f.mssql.schema.start(f.project.id, f.mssql.settings());
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    f.mssql.notes.start(f.project.id, f.mssql.settings());
    await f.mssql.notes.jobs.get(f.project.id)!.done;
    assert.equal(f.mssql.notes.pages(f.project.id, 'recipe').length, 0);
  } finally {
    await f.cleanup();
  }
});

test('A 3000-object catalog is enriched sequentially, checkpoints each object, and resumes after failure', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'small-local-model' });
    f.driver.count = 3000;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    const complete = f.generator.complete.bind(f.generator);
    let active = 0,
      maximum = 0,
      failOnce = true;
    const completed = new Set<string>();
    f.generator.complete = async (request, signal) => {
      maximum = Math.max(maximum, ++active);
      try {
        const object = /^Dev\.dbo\.Table\d+$/m.exec(request.prompt)?.[0];
        if (request.prompt.startsWith('Catalog facts for one database object:')) {
          assert(object);
          assert.equal(request.prompt.match(/^Dev\.dbo\.Table\d+$/gm)?.length, 1);
          assert(request.prompt.length < 11000);
          assert(!completed.has(object), 'completed object must not be generated again');
          assert.match(f.mssql.notes.status(f.project.id).progress || '', new RegExp(object));
          if (completed.size === 2 && failOnce) {
            failOnce = false;
            throw new Error('single-item output limit');
          }
        } else if (request.prompt.includes('"title"')) {
          assert((request.prompt.match(/^dbo\.Table\d+ \(/gm) || []).length <= 12);
        } else if (request.prompt.includes('"terms"')) {
          assert((request.prompt.match(/dbo\.Table\d+/g) || []).length <= 5);
        }
        // Yield so accidental parallelization would actually overlap requests.
        await new Promise((resolve) => setImmediate(resolve));
        const result = await complete(request, signal);
        if (object) completed.add(object);
        return result;
      } finally {
        active--;
      }
    };
    const run = async () => {
      f.mssql.notes.start(f.project.id, config);
      await f.mssql.notes.jobs.get(f.project.id)!.done;
    };
    await run();
    assert.equal(f.mssql.notes.status(f.project.id).state, 'error');
    assert.equal(f.mssql.notes.status(f.project.id).count, 2);
    assert.equal((f.store.db.prepare('SELECT count(*) AS n FROM mssql_notes').get() as any).n, 2);
    await run();
    assert.equal(f.mssql.notes.status(f.project.id).state, 'ready');
    assert.equal(completed.size, 3000);
    assert.equal(maximum, 1);
    assert.equal(
      (f.store.db.prepare('SELECT count(*) AS n FROM mssql_notes').get() as any).n,
      3000,
    );
  } finally {
    await f.cleanup();
  }
});

test('Deleting conversations preserves shared knowledge; deleting projects cleans all scoped data and restores failed transactions', async () => {
  const f = await fixture();
  try {
    const p = f.project.id,
      c = f.conversation.id;
    const other = f.store.createProject({ name: 'Keep', instructions: '', toolsEnabled: false });
    const sibling = f.store.createConversation(p);
    const doc = await f.knowledge.add(p, 'shared.md', Buffer.from('Keep for other conversations'));
    await f.wiki.record(p, doc.id);
    f.mssql.save(config);
    f.mssql.setProject(p, true);
    f.store.saveSettings({ ...f.store.settings(), modelId: 'test' });
    f.driver.count = 2;
    f.mssql.schema.start(p, config);
    await f.mssql.schema.jobs.get(p)!.done;
    f.mssql.notes.start(p, config);
    await f.mssql.notes.jobs.get(p)!.done;
    assert.equal(f.mssql.notes.status(p).progress, 'Completed');
    const output = f.store.artifacts(f.conversation);
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'report.csv'), 'data');
    await writeFile(f.store.sessionFile(c), 'session');
    await mkdir(path.join(f.root, 'agent', c));
    await writeFile(path.join(f.root, 'agent', c, 'auth.json'), '{}');
    f.store.setMeta(`metrics:${c}`, '{}');
    f.store.db.prepare('INSERT INTO runs VALUES (?,?,?,?,?)').run('run', c, 'completed', null, 1);
    f.store.db
      .prepare('INSERT INTO mssql_operations (id,conversationId,runId) VALUES (?,?,?)')
      .run('op', c, 'run');
    assert.equal((await f.req(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 401);
    assert.equal((await f.auth(`/projects/${p}`, 'DELETE', {})).statusCode, 400);
    f.knowledge.locks.add(p);
    assert.equal((await f.auth(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 409);
    f.knowledge.locks.delete(p);
    f.runner.active.set(c, { projectId: p } as any);
    assert.equal(
      (await f.auth(`/conversations/${c}`, 'DELETE', { confirm: true })).statusCode,
      409,
    );
    f.runner.active.delete(c);
    const job = { status: {}, controller: new AbortController(), done: Promise.resolve() } as any;
    for (const jobs of [f.mssql.schema.jobs, f.mssql.notes.jobs]) {
      jobs.set(p, job);
      assert.equal((await f.auth(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 409);
      jobs.delete(p);
    }
    let streamClosed = false;
    f.runner.once(c, () => {
      streamClosed = !f.store.conversation(c);
    });
    assert.equal(
      (await f.auth(`/conversations/${c}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    assert(streamClosed);
    for (const file of [output, f.store.sessionFile(c), path.join(f.root, 'agent', c)])
      await assert.rejects(lstat(file), { code: 'ENOENT' });
    assert.equal(f.store.conversation(c), undefined);
    assert(f.store.conversation(sibling.id));
    assert.equal(f.store.meta(`metrics:${c}`), undefined);
    assert.equal((await f.knowledge.read(p, doc.id)).text, 'Keep for other conversations');
    assert.equal(
      (f.store.db.prepare('SELECT count(*) AS n FROM mssql_operations').get() as any).n,
      0,
    );
    // Failure after staging restores all files and SQL rows.
    f.store.db.exec(
      "CREATE TRIGGER prevent_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'test rollback'); END",
    );
    assert.equal((await f.auth(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 500);
    assert(f.store.project(p));
    assert(f.store.conversation(sibling.id));
    assert.equal((await f.knowledge.read(p, doc.id)).text, 'Keep for other conversations');
    f.store.db.exec('DROP TRIGGER prevent_delete');
    // Deleting a link inside the project must never delete another project's files.
    await writeFile(path.join(f.store.projectPath(other.id), 'keep.txt'), 'keep');
    await symlink(
      f.store.projectPath(other.id),
      path.join(f.store.projectPath(p), 'external-link'),
    );
    assert.equal((await f.auth(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 200);
    assert.equal(f.store.project(p), undefined);
    assert.equal(f.store.conversation(sibling.id), undefined);
    await assert.rejects(lstat(f.store.projectPath(p)), { code: 'ENOENT' });
    for (const table of [
      'documents',
      'knowledge_revisions',
      'project_plugins',
      'mssql_schema',
      'mssql_schema_state',
      'mssql_notes',
      'mssql_pages',
      'mssql_gaps',
      'mssql_notes_catalog',
      'mssql_notes_state',
    ])
      assert.equal(
        (f.store.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE projectId=?`).get(p) as any)
          .n,
        0,
        table,
      );
    if (f.mssql.schema.fts)
      assert.equal(
        (f.store.db.prepare('SELECT count(*) AS n FROM mssql_schema_fts').get() as any).n,
        0,
      );
    assert.equal(
      await readFile(path.join(f.store.projectPath(other.id), 'keep.txt'), 'utf8'),
      'keep',
    );
    assert.equal(f.mssql.settings().read.password, config.read.password);
    assert.equal((await f.auth(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 404);
  } finally {
    await f.cleanup();
  }
});

test('Deletion recovery restores uncommitted moves, removes committed files, and rejects replaced parent directories', async () => {
  const f = await fixture();
  try {
    const c = f.conversation;
    await mkdir(path.join(f.root, 'deleted'));
    await writeFile(f.store.sessionFile(c.id), 'saved');
    const from = `sessions/${c.id}.jsonl`,
      to = `deleted/${randomUUID()}`;
    await rename(path.join(f.root, from), path.join(f.root, to));
    f.store.setMeta('deletion:test', JSON.stringify({ committed: false, moves: [{ from, to }] }));
    recoverDeletions(f.store);
    assert.equal(await readFile(f.store.sessionFile(c.id), 'utf8'), 'saved');
    await rename(path.join(f.root, from), path.join(f.root, to));
    f.store.setMeta('deletion:test', JSON.stringify({ committed: true, moves: [{ from, to }] }));
    recoverDeletions(f.store);
    await assert.rejects(lstat(path.join(f.root, to)), { code: 'ENOENT' });
    assert.equal(f.store.meta('deletion:test'), undefined);
    await symlink(
      path.join(f.root, 'sessions'),
      path.join(f.store.projectPath(c.projectId), 'outputs'),
    );
    assert.equal(
      (await f.auth(`/conversations/${c.id}`, 'DELETE', { confirm: true })).statusCode,
      409,
    );
    assert(f.store.conversation(c.id));
  } finally {
    await f.cleanup();
  }
});

test('Charts retain full typed SQL results, scope access, and delete with their conversation/project', async () => {
  const f = await fixture();
  try {
    const c = f.conversation.id,
      p = f.project.id;
    f.mssql.save(config);
    f.mssql.setProject(p, true);
    assert.equal((await f.req('/plugins/charts')).statusCode, 401);
    assert.equal((await f.auth('/plugins/charts', 'PUT', { enabled: true })).statusCode, 200);
    assert.equal((await f.auth(`/projects/${p}/plugins`, 'PUT', { charts: true })).statusCode, 200);
    assert.equal(f.mssql.projectEnabled(p), true, 'Updating Charts must preserve MSSQL');
    f.driver.execute = async () => ({
      columns: ['category', 'amount', 'cost'],
      rows: Array.from({ length: 30 }, (_, i) => [
        i === 0 ? '=unsafe' : `Month ${i}`,
        i - 10,
        i === 3 ? null : i * 2,
      ]),
      affected: 0,
      truncated: true,
    });
    const result: any = await f.mssql.invoke(c, randomUUID(), 'query', {
      database: 'Dev',
      sql: 'SELECT category, amount, cost FROM dbo.t',
    });
    assert.equal(result.rows.length, 20);
    assert(result.datasetId);
    const definition = {
      datasetId: result.datasetId,
      kind: 'bar',
      title: 'Revenue',
      x: 'category',
      y: ['amount', 'cost'],
    };
    const ref = f.charts.create(c, definition);
    const chart = f.charts.get(c, ref.id);
    assert.equal(
      chart.rows.length,
      30,
      'Charts must use the full returned result, not the 20-row preview',
    );
    assert.equal(chart.rows[0]![1], -10, 'Negative values must not inherit CSV formula escaping');
    assert.equal(chart.rows[3]![2], null);
    assert(chart.notices.some((n) => n.includes('limit')));
    assert(chart.notices.some((n) => n.includes('NULL')));
    assert.equal(f.charts.list(c)[0]!.rows, 30);
    const url = `/conversations/${c}/charts/${ref.id}`;
    assert.equal((await f.req(url)).statusCode, 401);
    assert.equal((await f.auth(url)).json().rows.length, 30);
    const csv = await f.auth(url + '?format=csv');
    assert(csv.body.includes('"\'=unsafe","-10","0"'));
    assert.match(String(csv.headers['content-disposition']), /attachment/);
    const sibling = f.store.createConversation(p);
    assert.equal((await f.auth(`/conversations/${sibling.id}/charts/${ref.id}`)).statusCode, 404);
    assert.throws(() => f.charts.create(sibling.id, definition), /not found/);
    f.charts.setProject(p, false);
    assert.throws(() => f.charts.create(c, definition), /disabled/);
    assert.equal((await f.auth(url)).statusCode, 200, 'Disabling must preserve historical charts');
    f.charts.setProject(p, true);
    f.store.setMeta('charts:enabled', 'false');
    assert.throws(() => f.charts.list(c), /disabled/);
    f.store.setMeta('charts:enabled', 'true');
    const otherDataset = f.charts.capture(sibling.id, randomUUID(), 'Dev', {
      columns: ['x', 'y'],
      rows: [['A', 1]],
      affected: 0,
      truncated: false,
    })!;
    const other = f.charts.create(sibling.id, {
      datasetId: otherDataset,
      kind: 'pie',
      title: 'Keep',
      x: 'x',
      y: ['y'],
    });
    assert.equal(
      (await f.auth(`/conversations/${c}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    assert.equal(f.store.db.prepare('SELECT id FROM charts WHERE id=?').get(ref.id), undefined);
    assert.equal(
      f.store.db.prepare('SELECT id FROM chart_datasets WHERE id=?').get(result.datasetId),
      undefined,
    );
    assert.equal(f.charts.get(sibling.id, other.id).title, 'Keep');
    assert.equal((await f.auth(`/projects/${p}`, 'DELETE', { confirm: true })).statusCode, 200);
    assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM chart_datasets').get()!.n, 0);
    assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM charts').get()!.n, 0);
  } finally {
    await f.cleanup();
  }
});

test('Charts validate types and limits without inventing, silently dropping, or executing data', async () => {
  const f = await fixture();
  try {
    f.store.setMeta('charts:enabled', 'true');
    f.charts.setProject(f.project.id, true);
    const c = f.conversation.id;
    const source = (columns: string[], rows: (string | number | null)[][]) =>
      f.charts.capture(c, randomUUID(), 'Dev', { columns, rows, affected: 0, truncated: false })!;
    const datasetId = source(
      ['label', 'amount', 'x'],
      [
        ['A', '12.50', 1],
        ['B', '-2.25', 2],
        ['C', null, 3],
      ],
    );
    const base = { datasetId, kind: 'bar', title: 'Totals', x: 'label', y: ['amount'] };
    for (const kind of ['bar', 'line', 'scatter']) {
      const ref = f.charts.create(c, { ...base, kind, x: kind === 'scatter' ? 'x' : 'label' });
      assert.deepEqual(
        f.charts.get(c, ref.id).rows.map((row) => row[1]),
        [12.5, -2.25, null],
      );
    }
    assert.throws(() => f.charts.create(c, { ...base, kind: 'pie' }), /nonnegative/);
    assert.throws(() => f.charts.create(c, { ...base, kind: 'scatter' }), /numeric/);
    assert.throws(() => f.charts.create(c, { ...base, y: ['missing'] }), /Column names/);
    assert.throws(() => f.charts.create(c, { ...base, y: ['amount', 'amount'] }), /distinct/);
    assert.throws(() => f.charts.create(c, { ...base, donut: true }), /pie charts only/);
    assert.throws(() => f.charts.create(c, { ...base, script: 'alert(1)' }));
    const pieId = source(
      ['label', 'amount'],
      [
        ['A', 3],
        ['B', 7],
      ],
    );
    assert.equal(
      f.charts.get(
        c,
        f.charts.create(c, { ...base, datasetId: pieId, kind: 'pie', donut: true }).id,
      ).donut,
      true,
    );
    for (const rows of [
      [
        ['A', 0],
        ['B', 0],
      ],
      [
        ['A', 1],
        ['A', 2],
      ],
      [
        ['A', 1],
        ['B', null],
      ],
    ])
      assert.throws(() =>
        f.charts.create(c, { ...base, kind: 'pie', datasetId: source(['label', 'amount'], rows) }),
      );
    assert.throws(
      () =>
        f.charts.create(c, {
          ...base,
          datasetId: source(['label', 'amount'], [['A', Number.MAX_SAFE_INTEGER + 1]]),
        }),
      /safely/,
    );
    assert.throws(
      () =>
        f.charts.create(c, {
          ...base,
          datasetId: source(['label', 'amount', 'amount'], [['A', 1, 2]]),
        }),
      /exactly once/,
    );
    assert.throws(
      () =>
        f.charts.create(c, {
          ...base,
          datasetId: source(
            ['label', 'amount'],
            Array.from({ length: 1001 }, (_, i) => [String(i), i]),
          ),
        }),
      /1000 rows/,
    );
    assert.throws(
      () =>
        f.charts.create(c, {
          ...base,
          kind: 'pie',
          datasetId: source(
            ['label', 'amount'],
            Array.from({ length: 21 }, (_, i) => [String(i), i]),
          ),
        }),
      /20 rows/,
    );
    assert.equal(f.driver.calls.length, 0, 'Charting saved datasets must never execute SQL');
  } finally {
    await f.cleanup();
  }
});

test('Chart capture failure never replays or marks successful SQL as failed', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.mssql.captureChartData = () => {
      throw new Error('disk full');
    };
    const result: any = await f.mssql.invoke(f.conversation.id, randomUUID(), 'query', {
      database: 'Dev',
      sql: 'SELECT id FROM dbo.t',
    });
    assert.equal(f.driver.calls.length, 1);
    assert.equal(result.rows.length, 2);
    assert.match(result.chartNotice, /SQL completed/);
    assert.equal(result.datasetId, undefined);
    assert.equal(
      f.store.db.prepare('SELECT status FROM mssql_operations').get()!.status,
      'completed',
    );
  } finally {
    await f.cleanup();
  }
});
