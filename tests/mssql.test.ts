import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../server/app.js';
import { classify } from '../server/plugins/mssql/policy.js';
import { config, FakeSql } from './sql-fixture.js';
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-sql-'));
  const driver = new FakeSql();
  const ctx = await createApp({
    dataDir: root,
    origin: 'http://127.0.0.1:3000',
    setupToken: 'test',
    sqlDriver: driver,
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
    assert.match(object.text, /primaryKey/);
    assert.match(object.text, /referencedTable/);
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
