import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { learningUnits, queryTemplate } from '../server/maintenance/extraction.js';
import { localSchedule } from '../server/maintenance/service.js';
import { rankKnowledge } from '../server/knowledge-discovery.js';
import { createServer } from 'node:http';
const note = {
  title: 'Maintenance Procedure',
  text: 'When to use: before maintenance.\nCheck the change approval and record the recovery plan.\nAsk if approval is missing.',
  discovery: {
    description: 'Use before planned maintenance to check approvals and recovery steps.',
    tags: ['maintenance'],
    aliases: ['change preparation'],
    category: 'procedure',
  },
};
async function fixture(generator: any = { complete: async () => JSON.stringify(note) }) {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-maintenance-'));
  const ctx = await createApp({
    dataDir: root,
    origin: 'http://127.0.0.1:3000',
    setupToken: 'maintenance-test',
    generator,
  });
  const project = ctx.store.createProject({ name: 'Test', instructions: '', toolsEnabled: false });
  ctx.maintenance.save({ ...ctx.maintenance.settings(), projectIds: [project.id] });
  const conversation = ctx.store.createConversation(project.id);
  const history = async (messages: any[]) => {
    const entries = messages.map((message, i) => ({
      id: `entry-${i}`,
      parentId: i ? `entry-${i - 1}` : null,
      type: 'message',
      message,
    }));
    await writeFile(
      ctx.store.sessionFile(conversation.id),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
    ctx.store.db
      .prepare('INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?)')
      .run('maintenance-run', conversation.id, 'completed', null, Date.now());
  };
  const run = async () => {
    ctx.maintenance.enqueue();
    for (let i = 0; i < 20; i++) {
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
    project,
    conversation,
    history,
    run,
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('SQL templates remove strings, numeric values, aliases and parameter names; unsupported SQL fails closed', () => {
  const result = queryTemplate(
    "SELECT TOP 25 c.Name AS [Private Person] FROM dbo.Customers c WHERE c.Name=N'Secret Name' AND c.Id=@RealCustomer AND c.Amount>199.95",
  );
  assert(result);
  assert.match(result, /dbo.*Customers/);
  assert.match(result, /@p\d/);
  assert.doesNotMatch(result, /Secret|Private|RealCustomer|199|25/);
  assert.equal(queryTemplate('EXEC secretProcedure'), undefined);
  assert.equal(queryTemplate("SELECT 1; SELECT 'secret'"), undefined);
  assert.equal(queryTemplate('SELECT 1 -- private note'), undefined);
  assert.equal(queryTemplate('malformed SQL'), undefined);
  const alias = queryTemplate('SELECT t.Name AS Name FROM dbo.Customers t ORDER BY Name');
  assert.match(alias!, /\[alias_\d\]\.\[Name\] AS \[alias_\d\]/);
  assert.match(alias!, /ORDER BY \[alias_\d\]/);
  const table = queryTemplate('SELECT Customers.Name FROM dbo.Customers AS Customers');
  assert.match(table!, /FROM \[dbo\]\.\[Customers\] AS \[alias_\d\]/);
});
test('general learning skips pasted SQL/data threads and keeps the tail of long conversations', () => {
  const branch = (texts: string[]) =>
    texts.map((content, i) => ({
      type: 'message',
      id: String(i),
      message: { role: i % 2 ? 'assistant' : 'user', content },
    }));
  assert.deepEqual(
    learningUnits(branch(['| Customer | Amount |', 'Remember Alice owes money'])),
    [],
  );
  const units = learningUnits(
    branch([
      'Always check the recovery plan. '.repeat(500) +
        'Correction: require the team lead approval.',
    ]),
  );
  assert(units.length > 1);
  assert(units.every((u) => u.text.length <= 5000));
  assert(units.at(-1)!.text.includes('Correction: require the team lead approval.'));
  assert.deepEqual(
    learningUnits([
      {
        type: 'message',
        id: 'thinking',
        message: { role: 'assistant', content: '<think>private reasoning without a closing tag' },
      },
    ]),
    [],
  );
});
test('SQL conversation learning excludes ALL prose, reasoning, parameter values and results', () => {
  const entries = [
    { role: 'user', content: 'Secret Name owes 99999' },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Secret Name' },
        {
          type: 'toolCall',
          id: 'call1',
          name: 'mssql_query',
          arguments: {
            database: 'Dev',
            sql: 'SELECT Name FROM dbo.Customers WHERE Id=123',
            parameters: [{ name: 'id', value: 'Secret Name' }],
          },
        },
      ],
    },
    {
      role: 'toolResult',
      toolCallId: 'call1',
      toolName: 'mssql_query',
      content: [{ type: 'text', text: 'Secret Name,99999' }],
    },
    { role: 'assistant', content: 'Secret Name owes 99999. Here is their chart.' },
  ].map((message, i) => ({ id: String(i), type: 'message', message }));
  const units = learningUnits(entries);
  assert.equal(units.length, 1);
  assert.equal(units[0]?.kind, 'query');
  assert.doesNotMatch(JSON.stringify(units), /Secret Name|99999|123|thinking/);
  (entries[2]!.message as any).isError = true;
  assert.equal(learningUnits(entries).length, 0);
});
test('schedule respects local dates, DST repeats and skipped start times', () => {
  assert.deepEqual(localSchedule(new Date('2026-11-01T08:30:00Z'), 'America/Los_Angeles'), {
    date: '2026-11-01',
    time: '01:30',
  });
  assert.deepEqual(localSchedule(new Date('2026-11-01T09:30:00Z'), 'America/Los_Angeles'), {
    date: '2026-11-01',
    time: '01:30',
  });
  assert.deepEqual(localSchedule(new Date('2026-03-08T10:00:00Z'), 'America/Los_Angeles'), {
    date: '2026-03-08',
    time: '03:00',
  });
});
test('description, tag and alias search ranks relevant pages without requiring every query word', () => {
  const docs = [
    { id: 'a', name: 'Unrelated', revision: '1', text: 'maintenance in a long page' },
    {
      id: 'b',
      name: 'Change process',
      revision: '1',
      text: 'Steps',
      description: 'Prepare planned maintenance',
      tags: ['approval'],
      aliases: ['change preparation'],
      verified: true,
    },
  ];
  assert.equal(rankKnowledge(docs, 'How should I prepare maintenance approval?')[0]?.doc.id, 'b');
});
test('drafts stay out of catalog until reviewed; repeats deduplicate and publishing adds metadata without verification', async () => {
  const f = await fixture();
  try {
    await f.history([
      {
        role: 'user',
        content: 'Before maintenance we must check change approval and record the recovery plan.',
      },
      { role: 'assistant', content: 'I will use that procedure.' },
    ]);
    await f.run();
    assert.equal(f.knowledge.list(f.project.id).length, 0);
    const draft = f.maintenance.status().candidates[0];
    assert(draft);
    await f.run();
    assert.equal(f.maintenance.status().candidates.length, 1);
    await f.maintenance.publish(draft.id, false);
    const catalog = await f.wiki.catalog(f.project.id);
    assert.equal(catalog.length, 1);
    assert.deepEqual(catalog[0]?.tags, ['maintenance']);
    assert(!catalog[0]?.verified);
    assert.match(catalog[0]!.text, /category: procedure/);
    await assert.rejects(() => f.maintenance.publish(draft.id, false), /no longer/);
  } finally {
    await f.cleanup();
  }
});
test('automatic new pages publish without verification; SQL recipes use no model requests or results', async () => {
  let calls = 0;
  const f = await fixture({
    complete: async () => {
      calls++;
      throw Error('Must not run model for SQL recipes');
    },
  });
  try {
    f.maintenance.save({ ...f.maintenance.settings(), policy: 'new' });
    await f.history([
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'q1',
            name: 'mssql_query',
            arguments: {
              database: 'Dev',
              sql: "SELECT Name FROM dbo.Customer WHERE Name='Private'",
            },
          },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'q1',
        toolName: 'mssql_query',
        content: [{ type: 'text', text: 'Private result 7654321' }],
      },
    ]);
    await f.run();
    assert.equal(calls, 0);
    const pages = await f.wiki.catalog(f.project.id);
    assert.equal(pages.length, 1);
    assert.doesNotMatch(pages[0]!.text, /Private|7654321/);
    assert(!pages[0]?.verified);
  } finally {
    await f.cleanup();
  }
});
test('maintenance aborts an in-flight model request for chat and resumes the unfinished item', async () => {
  let started: () => void = () => {};
  const ready = new Promise<void>((r) => (started = r));
  let attempts = 0;
  const f = await fixture({
    complete: async (_request: any, signal: AbortSignal) => {
      attempts++;
      if (attempts > 1) return JSON.stringify(note);
      started();
      await new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
      );
    },
  });
  try {
    await f.history([
      { role: 'user', content: 'Always check change approval before maintenance.' },
    ]);
    f.maintenance.enqueue();
    const running = f.maintenance.tick();
    await ready;
    f.runner.emit('foreground');
    await running;
    assert.equal(f.maintenance.status().runs[0]?.state, 'paused');
    assert.equal(f.maintenance.status().candidates.length, 0);
    await f.maintenance.tick();
    assert.equal(f.maintenance.status().candidates.length, 1);
    assert.equal(attempts, 2);
  } finally {
    await f.cleanup();
  }
});
test('scheduled jobs run once per date, recover checkpoints, honor budgets, and find broken links', async () => {
  const f = await fixture({ complete: async () => JSON.stringify(note.discovery) });
  try {
    const doc = await f.knowledge.add(
      f.project.id,
      'Guide.md',
      Buffer.from('[Missing](/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.md)'),
      'wiki',
    );
    await f.wiki.record(f.project.id, doc.id);
    f.maintenance.save({
      ...f.maintenance.settings(),
      enabled: true,
      time: '01:30',
      learnConversations: false,
    });
    await f.maintenance.tick(new Date('2026-11-01T08:30:00Z'));
    await f.maintenance.tick(new Date('2026-11-01T09:30:00Z'));
    assert.equal(f.maintenance.status().runs.length, 1);
    assert(f.maintenance.status().findings.some((x: any) => x.kind === 'broken-link'));
    f.maintenance.save({ ...f.maintenance.settings(), enabled: false });
    f.maintenance.enqueue();
    f.store.db.prepare("UPDATE maintenance_runs SET elapsed=99999999 WHERE state='queued'").run();
    await f.maintenance.tick();
    assert.equal(f.maintenance.status().runs[0]?.state, 'stopped');
  } finally {
    await f.cleanup();
  }
});
test('source changes block stale drafts and verified pages never auto-update', async () => {
  const f = await fixture();
  try {
    const doc = await f.knowledge.add(
      f.project.id,
      'Maintenance Procedure.md',
      Buffer.from('Administrator approved procedure.'),
      'wiki',
    );
    await f.wiki.record(f.project.id, doc.id, { verified: true, discovery: note.discovery as any });
    f.maintenance.save({ ...f.maintenance.settings(), policy: 'maintain' });
    await f.history([{ role: 'user', content: 'Check the change approval before maintenance.' }]);
    await f.run();
    assert.equal(
      (await f.knowledge.read(f.project.id, doc.id)).text,
      'Administrator approved procedure.',
    );
    const draft = f.maintenance.status().candidates[0];
    assert(draft);
    await f.history([
      { role: 'user', content: 'Updated source.' },
      { role: 'assistant', content: 'Changed.' },
    ]);
    await assert.rejects(
      () => f.maintenance.publish(draft.id, false),
      /Source conversation changed/,
    );
  } finally {
    await f.cleanup();
  }
});
test('incognito real SDK history remains memory-only across follow-ups and is removed on end', async () => {
  const prompts: string[] = [];
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    prompts.push(raw);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'data: ' +
        JSON.stringify({
          id: 'local',
          object: 'chat.completion.chunk',
          model: 'test',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Private reply' },
              finish_reason: null,
            },
          ],
        }) +
        '\n\ndata: ' +
        JSON.stringify({ id: 'local', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  const f = await fixture();
  try {
    f.store.saveSettings({
      ...f.store.settings(),
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      modelId: 'test',
    });
    const c = f.store.createConversation(f.project.id, true);
    f.incognito.touch(c.id);
    const turn = async (text: string) => {
      f.runner.start(c.id, randomUUID(), text);
      const deadline = Date.now() + 15000;
      while (f.runner.active.has(c.id) && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 30));
      assert(!f.runner.active.has(c.id));
      assert.equal(f.runner.snapshot(c.id).status, 'completed');
    };
    await turn('Private first prompt');
    await turn('Private follow-up');
    assert.equal(prompts.length, 2);
    assert.match(prompts[1]!, /Private first prompt/);
    assert(!existsSync(f.store.sessionFile(c.id)));
    assert.equal(f.store.meta(`metrics:${c.id}`), undefined);
    assert.equal(f.runner.snapshot(c.id).messages.filter((m) => m.role === 'user').length, 2);
    await f.run();
    assert.equal(f.maintenance.status().candidates.length, 0);
    await writeFile(path.join(f.store.artifacts(c), 'private.txt'), 'private output');
    f.incognito.end(c.id);
    assert.equal(f.store.conversation(c.id), undefined);
    assert(!f.runner.ephemeral.has(c.id));
    assert(!existsSync(f.store.artifacts(c)));
  } finally {
    await f.cleanup();
    await new Promise<void>((r) => model.close(() => r()));
  }
});

test('publication retries use the reserved page identity after an interrupted write', async () => {
  const f = await fixture();
  try {
    await f.history([{ role: 'user', content: 'Check approval and prepare a recovery plan.' }]);
    await f.run();
    const draft = f.maintenance.status().candidates[0];
    const record = f.wiki.record.bind(f.wiki);
    let first = true;
    f.wiki.record = async (...args: Parameters<typeof record>) => {
      if (first) {
        first = false;
        throw Error('simulated disk error');
      }
      return record(...args);
    };
    await assert.rejects(() => f.maintenance.publish(draft.id, false), /simulated disk error/);
    assert.equal(f.knowledge.list(f.project.id).length, 1);
    await f.maintenance.publish(draft.id, false);
    assert.equal(f.knowledge.list(f.project.id).length, 1);
    assert.equal(f.maintenance.status().candidates.length, 0);
  } finally {
    await f.cleanup();
  }
});
test('restart recovers a paused job and deletes abandoned incognito tool files and records', async () => {
  const f = await fixture();
  try {
    await f.history([
      { role: 'user', content: 'Check approval and the recovery plan before maintenance.' },
    ]);
    f.maintenance.enqueue();
    const c = f.store.createConversation(f.project.id, true);
    // Simulate a process dying without Incognito.close by leaving a row after shutdown.
    await f.app.close();
    const { Store } = await import('../server/store.js');
    const abandoned = new Store(f.root);
    const temp = abandoned.createConversation(f.project.id, true);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(abandoned.artifacts(temp), { recursive: true });
    await writeFile(path.join(abandoned.artifacts(temp), 'private.csv'), 'private data');
    abandoned.close();
    const restarted = await createApp({
      dataDir: f.root,
      origin: 'http://127.0.0.1:3000',
      setupToken: 'test',
      generator: { complete: async () => JSON.stringify(note) },
    });
    try {
      assert.equal(restarted.store.conversation(temp.id), undefined);
      assert(!existsSync(path.join(f.root, 'projects', f.project.id, 'outputs', temp.id)));
      assert.equal(restarted.maintenance.status().runs[0]?.state, 'paused');
      await restarted.maintenance.tick();
      assert.equal(restarted.maintenance.status().candidates.length, 1);
    } finally {
      await restarted.app.close();
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('maintenance APIs enforce authentication and incognito is excluded from listing and knowledge saves', async () => {
  const f = await fixture();
  const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
  try {
    assert.equal((await f.app.inject({ url: '/api/maintenance', headers })).statusCode, 401);
    await f.app.inject({
      url: '/api/auth/setup',
      method: 'POST',
      headers,
      payload: { token: 'maintenance-test', password: 'maintenance-password' },
    });
    const login = await f.app.inject({
      url: '/api/auth/login',
      method: 'POST',
      headers,
      payload: { password: 'maintenance-password' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const auth = { ...headers, cookie };
    const operation = randomUUID();
    f.store.db
      .prepare('INSERT INTO mssql_operations(id,conversationId,kind,sql,status) VALUES (?,?,?,?,?)')
      .run(
        operation,
        f.conversation.id,
        'read',
        "SELECT Name FROM dbo.Customers WHERE Name='Secret Customer'",
        'completed',
      );
    await f.history([
      {
        role: 'toolResult',
        toolName: 'mssql_query',
        toolCallId: 'sql-call',
        content: [{ type: 'text', text: 'Secret Customer owes 99999' }],
        details: {
          sqlResult: { operationId: operation, columns: ['Name'], rows: [['Secret Customer']] },
        },
      },
      { role: 'assistant', content: 'Secret Customer owes 99999' },
    ]);
    const sqlDraft = await f.app.inject({
      url: `/api/conversations/${f.conversation.id}/knowledge/0`,
      headers: auth,
    });
    assert.equal(sqlDraft.statusCode, 200, sqlDraft.body);
    assert.doesNotMatch(sqlDraft.body, /Secret Customer|99999/);
    assert.equal(sqlDraft.json().structuralOnly, true);
    assert.equal(
      (
        await f.app.inject({
          url: `/api/conversations/${f.conversation.id}/knowledge/1`,
          headers: auth,
        })
      ).statusCode,
      400,
    );
    const rejectedSave = await f.app.inject({
      url: `/api/conversations/${f.conversation.id}/knowledge/0`,
      method: 'POST',
      headers: auth,
      payload: { ...sqlDraft.json<Record<string, any>>(), text: sqlDraft.json().text + '\nSecret Customer owes 99999' },
    });
    assert.equal(rejectedSave.statusCode, 400);
    const saved = await f.app.inject({
      url: `/api/conversations/${f.conversation.id}/knowledge/0`,
      method: 'POST',
      headers: auth,
      payload: sqlDraft.json(),
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.doesNotMatch(
      await f.wiki.concept(f.project.id, saved.json().id),
      /Secret Customer|99999/,
    );
    const c = f.store.createConversation(f.project.id, true);
    f.incognito.touch(c.id);
    assert(
      !(await f.app.inject({ url: '/api/conversations', headers: auth }))
        .json()
        .some((x: any) => x.id === c.id),
    );
    assert.equal(
      (await f.app.inject({ url: `/api/conversations/${c.id}/knowledge/0`, headers: auth }))
        .statusCode,
      403,
    );
    const invalid = await f.app.inject({
      url: '/api/maintenance/settings',
      method: 'PUT',
      headers: auth,
      payload: { ...f.maintenance.settings(), timezone: 'Not/AZone' },
    });
    assert.equal(invalid.statusCode, 400);
    f.incognito.touched.set(c.id, Date.now() - 31 * 60000);
    f.incognito.sweep();
    assert.equal(f.store.conversation(c.id), undefined);
  } finally {
    await f.cleanup();
  }
});
