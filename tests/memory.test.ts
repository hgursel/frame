import { taskFingerprint } from '../server/maintenance/methods.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { fingerprint, explicitRemember, learningUnits } from '../server/maintenance/extraction.js';
import { recall, queryDependencies } from '../server/maintenance/recall.js';
import { knowledgeContext } from '../server/knowledge-discovery.js';
import { config, FakeSql } from './sql-fixture.js';
const note = {
  title: 'Change approval',
  text: 'Check approval and document the recovery plan before maintenance.',
  discovery: {
    description: 'Prepare a maintenance change with approval and a recovery plan.',
    tags: ['maintenance', 'approval'],
    aliases: ['change preparation'],
    category: 'procedure' as const,
  },
};
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-memory-'));
  const driver = new FakeSql();
  const ctx = await createApp({
    dataDir: root,
    origin: 'http://127.0.0.1:3000',
    setupToken: 'test',
    sqlDriver: driver,
    generator: { complete: async () => JSON.stringify(note) },
  });
  const project = ctx.store.createProject({
    name: 'Operations',
    instructions: '',
    toolsEnabled: false,
  });
  ctx.maintenance.save({ ...ctx.maintenance.settings(), projectIds: [project.id], policy: 'new' });
  const seed = async (confirm = false, incognito = false) => {
    const c = ctx.store.createConversation(project.id, incognito);
    const entries = [
      { id: 'one', parentId: null, type: 'message', message: { role: 'user', content: note.text } },
      ...(confirm
        ? [
            {
              id: 'two',
              parentId: 'one',
              type: 'message',
              message: { role: 'user', content: 'Remember this method.' },
            },
          ]
        : []),
    ];
    await writeFile(
      ctx.store.sessionFile(c.id),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
    ctx.store.db
      .prepare('INSERT INTO runs VALUES (?,?,?,?,?)')
      .run(randomUUID(), c.id, 'completed', null, Date.now());
    return { c, revision: fingerprint(entries.map((e) => e.id)) };
  };
  const run = async () => {
    ctx.maintenance.enqueue();
    for (let i = 0; i < 30; i++) {
      await ctx.maintenance.tick();
      if (
        !ctx.maintenance
          .status()
          .runs.some((r: any) => ['queued', 'running', 'paused'].includes(r.state))
      )
        break;
    }
  };
  return {
    ...ctx,
    root,
    driver,
    project,
    seed,
    run,
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('learning waits for three distinct chats, ignores incognito, and never grows knowledge files', async () => {
  const f = await fixture();
  try {
    await f.seed();
    await f.seed(false, true);
    await f.run();
    assert.equal(f.maintenance.methods.list().length, 0);
    assert.equal(f.maintenance.status().observations, 1);
    await f.run();
    assert.equal(f.maintenance.methods.candidates(f.project.id)[0]!.occurrences, 1);
    await f.seed();
    await f.run();
    assert.equal(f.maintenance.methods.list().length, 0);
    await f.seed();
    await f.run();
    const m = f.maintenance.methods.list()[0]!;
    assert(m);
    assert.equal(m.occurrences, 3);
    assert(!m.verified);
    assert.equal(f.knowledge.list(f.project.id).length, 0);
    const pack = recall(
      f.maintenance.methods,
      f.mssql,
      f.project.id,
      'maintenance approval',
      [],
      200000,
    );
    assert.match(pack.reference.pages[0]!.text, /recovery plan/);
    assert.deepEqual(pack.ids, [m.id]);
    f.maintenance.methods.forget(m.id);
    await f.seed(true);
    await f.run();
    assert.equal(f.maintenance.methods.list().length, 0);
  } finally {
    await f.cleanup();
  }
});
test('confirmed updates to verified methods require review and stale evidence cannot publish', async () => {
  const f = await fixture();
  try {
    const source = await f.seed(true);
    const input = {
      ...note,
      projectId: f.project.id,
      fingerprint: 'approval',
      sourceId: source.c.id,
      sourceRevision: source.revision,
      confirmed: true,
    };
    await f.maintenance.methods.observe(input, 'review');
    const id = f.maintenance.status().candidates[0]!.id;
    f.maintenance.methods.publish(id, true);
    await f.maintenance.methods.observe(
      { ...input, text: 'Require approval from the change owner.' },
      'maintain',
    );
    assert.match(f.maintenance.methods.list()[0]!.text, /recovery plan/);
    assert.equal(f.maintenance.status().candidates.length, 1);
    await writeFile(
      f.store.sessionFile(source.c.id),
      JSON.stringify({
        id: 'changed',
        parentId: null,
        type: 'message',
        message: { role: 'user', content: 'Changed' },
      }) + '\n',
    );
    assert.throws(() => f.maintenance.methods.publish(id, false), /Source conversation changed/);
  } finally {
    await f.cleanup();
  }
});
test('active memory is capped at 30 and protected methods are never evicted automatically', async () => {
  const f = await fixture();
  try {
    const source = await f.seed(true);
    for (let i = 0; i < 31; i++)
      await f.maintenance.methods.observe(
        {
          ...note,
          title: `Method ${i}`,
          projectId: f.project.id,
          fingerprint: `method-${i}`,
          sourceId: source.c.id,
          sourceRevision: source.revision,
          confirmed: true,
        },
        'new',
      );
    assert.equal(f.maintenance.methods.list().length, 30);
    assert.equal(f.maintenance.status().candidates.length, 1);
    assert.throws(
      () => f.maintenance.methods.publish(f.maintenance.status().candidates[0]!.id, false),
      /Memory is full/,
    );
  } finally {
    await f.cleanup();
  }
});
test('SQL recall supplies cached structure without live discovery and excludes stale, changed-source or disabled SQL', async () => {
  const f = await fixture();
  try {
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.driver.count = 2;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    const source = await f.seed(true);
    await f.maintenance.methods.observe(
      {
        ...note,
        title: 'Customer lookup',
        text: 'Database: Dev\n\n```sql\nSELECT [id] FROM [dbo].[Table1] WHERE [id]=@p1\n```',
        discovery: {
          ...note.discovery,
          description: 'Customer lookup using a supplied identifier.',
          category: 'query_recipe',
        },
        projectId: f.project.id,
        fingerprint: 'sql',
        sourceId: source.c.id,
        sourceRevision: source.revision,
        confirmed: true,
        schemaRevision: f.mssql.schema.generation(f.project.id),
        schemaSource: f.mssql.schema.source(f.mssql.settings()),
        dependencies: queryDependencies(
          f.mssql,
          f.project.id,
          'Database: Dev\nSELECT [id] FROM [dbo].[Table1]',
        ),
      },
      'new',
    );
    const before = JSON.stringify(f.driver.calls);
    const pack = recall(
      f.maintenance.methods,
      f.mssql,
      f.project.id,
      'customer lookup',
      [],
      200000,
    );
    assert.equal(pack.reference.pages.length, 1);
    assert.equal(pack.reference.schema.length, 1);
    assert.equal(JSON.stringify(f.driver.calls), before);
    assert.equal(f.mssql.notes.search(f.project.id, 'please perform customer lookup').total, 1);
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    assert.equal(
      recall(f.maintenance.methods, f.mssql, f.project.id, 'customer lookup', [], 200000).reference
        .pages.length,
      1,
      'Unchanged catalog dependencies remain reusable after refresh',
    );
    f.mssql.schema.markStale(f.project.id);
    assert.equal(
      recall(f.maintenance.methods, f.mssql, f.project.id, 'customer lookup', [], 200000).reference
        .pages.length,
      0,
    );
    f.mssql.setProject(f.project.id, false);
    assert.equal(
      recall(f.maintenance.methods, f.mssql, f.project.id, 'customer lookup', [], 200000).reference
        .pages.length,
      0,
    );
  } finally {
    await f.cleanup();
  }
});
test('recall is bounded and task confirmation cannot originate from quoted or assistant text', () => {
  const docs = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: 'Maintenance',
    revision: '1',
    text: 'x'.repeat(7000),
    description: 'maintenance approval',
    method: true,
  }));
  const pack = knowledgeContext(docs, 'maintenance approval', 200000);
  assert(pack.length <= 3);
  assert(Buffer.byteLength(JSON.stringify(pack)) <= 12000);
  assert(pack.every((p) => p.truncated));
  assert.equal(knowledgeContext(docs, 'unrelated request', 200000).length, 0);
  const branch = (role: string, content: string) => [
    { type: 'message', message: { role, content } },
  ];
  assert(explicitRemember(branch('user', 'Please remember this method.')));
  assert(!explicitRemember(branch('assistant', 'Remember this method.')));
  assert(!explicitRemember(branch('user', 'Do not remember this method.')));
  assert(!explicitRemember(branch('user', 'The document says "Remember this method."')));
});
test('migration removes automatically created notes and SQL interpretations, preserves authored/uploaded content and schema, and runs once', async () => {
  const f = await fixture();
  let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    const learned = await f.knowledge.add(
      f.project.id,
      'Old method.md',
      Buffer.from('obsolete automatic method'),
      'wiki',
    );
    await f.wiki.record(f.project.id, learned.id, {
      generatedBy: 'frame-maintenance/1',
      maintenance: { fingerprint: 'old', sourceConversation: 'old-source' },
    });
    const human = await f.knowledge.add(
      f.project.id,
      'Handbook.md',
      Buffer.from('human procedure'),
      'wiki',
    );
    await f.wiki.record(f.project.id, human.id);
    // Metadata enrichment must not turn a human-created document into a cleanup target.
    await f.wiki.record(f.project.id, human.id, {
      generatedBy: 'frame-maintenance/1',
      discovery: note.discovery,
    });
    const upload = await f.knowledge.add(
      f.project.id,
      'Reference.md',
      Buffer.from('uploaded document'),
      'upload',
    );
    await f.wiki.record(f.project.id, upload.id);
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    f.driver.count = 1;
    f.mssql.schema.start(f.project.id, config);
    await f.mssql.schema.jobs.get(f.project.id)!.done;
    f.store.db
      .prepare('INSERT INTO mssql_pages VALUES (?,?,?,?,?,?,?,?)')
      .run(
        'old',
        f.project.id,
        'domain',
        'Old domain',
        'Generated',
        new Date().toISOString(),
        'test',
        'proposed',
      );
    f.store.db.prepare('DELETE FROM meta WHERE key=?').run('curated-memory-v1');
    await f.app.close();
    restarted = await createApp({
      dataDir: f.root,
      origin: 'http://127.0.0.1:3000',
      setupToken: 'test',
    });
    assert.deepEqual(
      new Set(restarted.knowledge.list(f.project.id).map((d) => d.id)),
      new Set([human.id, upload.id]),
    );
    assert.equal(restarted.mssql.notes.pages(f.project.id).length, 0);
    assert.equal(restarted.mssql.schema.facts(f.project.id).length, 1);
    assert.equal(restarted.store.meta('curated-memory-v1'), '1');
    await restarted.maintenance.initialize();
    assert.equal(restarted.knowledge.list(f.project.id).length, 2);
  } finally {
    await restarted?.app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('real SDK request receives method content automatically and activity references survive streaming', async () => {
  const { createServer } = await import('node:http');
  const requests: string[] = [];
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(raw);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'data: ' +
        JSON.stringify({
          id: 'test',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Check the approval and recovery plan.' },
              finish_reason: null,
            },
          ],
        }) +
        '\n\ndata: ' +
        JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  const f = await fixture();
  try {
    await f.seed(true);
    await f.run();
    f.store.saveSettings({
      ...f.store.settings(),
      modelId: 'local-test',
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
    });
    const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
    await f.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      headers,
      payload: { token: 'test', password: 'memory-test-password' },
    });
    const login = await f.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { password: 'memory-test-password' },
    });
    const auth = { ...headers, cookie: String(login.headers['set-cookie']).split(';')[0]! };
    const chat = f.store.createConversation(f.project.id);
    for (const text of ['How do I prepare maintenance approval?', 'And the recovery plan?']) {
      const response = await f.app.inject({
        method: 'POST',
        url: `/api/conversations/${chat.id}/messages`,
        headers: auth,
        payload: { requestId: randomUUID(), text },
      });
      assert.equal(response.statusCode, 202, response.body);
      const deadline = Date.now() + 15000;
      while (f.runner.active.has(chat.id) && Date.now() < deadline) {
        assert.equal(f.runner.snapshot(chat.id).memory?.[0]?.title, note.title);
        await new Promise((r) => setTimeout(r, 30));
      }
      assert.equal(f.runner.snapshot(chat.id).status, 'completed');
      assert.equal(f.runner.snapshot(chat.id).memory?.[0]?.title, note.title);
    }
    assert.equal(requests.length, 2);
    for (const request of requests) assert(request.includes(note.text));
    assert.equal(f.maintenance.methods.list()[0]!.uses, 2);
  } finally {
    await f.cleanup();
    await new Promise<void>((r) => model.close(() => r()));
  }
});

test('task grouping tolerates reordered titles without merging distinct calculations', () => {
  const prior = {
    ...note,
    fingerprint: 'same-task',
    title: 'Monthly customer sales report',
  } as any;
  assert.equal(taskFingerprint('Customer monthly sales report', 'procedure', [prior]), 'same-task');
  assert.notEqual(
    taskFingerprint('Monthly supplier cost report', 'procedure', [prior]),
    'same-task',
  );
});

test('an old confirmation never approves a later unconfirmed rule change', async () => {
  const f = await fixture();
  try {
    const a = await f.seed(true);
    const input = {
      ...note,
      projectId: f.project.id,
      fingerprint: 'rule',
      sourceId: a.c.id,
      sourceRevision: a.revision,
      confirmed: true,
    };
    await f.maintenance.methods.observe(input, 'maintain');
    const b = await f.seed();
    const c = await f.seed();
    await f.maintenance.methods.observe(
      { ...input, sourceId: b.c.id, sourceRevision: b.revision, confirmed: false },
      'maintain',
    );
    await f.maintenance.methods.observe(
      {
        ...input,
        sourceId: c.c.id,
        sourceRevision: c.revision,
        text: 'Skip approval entirely.',
        confirmed: false,
      },
      'maintain',
    );
    assert.equal(f.maintenance.methods.list()[0]!.text, note.text);
    assert.equal(f.maintenance.status().candidates.length, 1);
  } finally {
    await f.cleanup();
  }
});

test('cleanup resumes after database deletion and preserves human edits to generated pages', async () => {
  const f = await fixture();
  try {
    const orphan = await f.knowledge.add(f.project.id, 'Old.md', Buffer.from('generated'), 'wiki');
    const edited = await f.knowledge.add(
      f.project.id,
      'Edited.md',
      Buffer.from('human edit'),
      'wiki',
    );
    await f.wiki.record(f.project.id, edited.id, {
      generatedBy: 'frame-maintenance/1',
      maintenance: { fingerprint: 'old', sourceConversation: 'old' },
    });
    await f.wiki.record(f.project.id, edited.id);
    f.store.db.prepare('DELETE FROM meta WHERE key=?').run('curated-memory-v1');
    f.store.setMeta(
      'curated-memory-cleanup',
      JSON.stringify([{ projectId: f.project.id, id: orphan.id }]),
    );
    f.store.db.prepare('DELETE FROM documents WHERE id=?').run(orphan.id);
    await f.maintenance.initialize();
    const { existsSync } = await import('node:fs');
    assert(!existsSync(path.join(f.store.projectPath(f.project.id), 'knowledge', orphan.id)));
    assert.equal(f.knowledge.list(f.project.id)[0]?.id, edited.id);
    assert.equal(f.store.meta('curated-memory-cleanup'), undefined);
  } finally {
    await f.cleanup();
  }
});

test('remember requests remain attached to their method after later conversation messages', () => {
  const branch = [
    { role: 'user', content: 'Check approval and write a recovery plan before maintenance.' },
    { role: 'user', content: 'Remember this method.' },
    { role: 'user', content: 'Now discuss a different task: report formatting.' },
    { role: 'assistant', content: 'Use concise section headings.' },
  ].map((message, i) => ({ id: String(i), type: 'message', message }));
  const units = learningUnits(branch);
  assert.equal(units.length, 2);
  assert.equal(units[0]!.confirmed, true);
  assert(!units[1]!.confirmed);
  assert(!units[0]!.text.includes('report formatting'));
});
