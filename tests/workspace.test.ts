import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Questions } from '../server/questions.js';
import { RunDeadline } from '../server/run-deadline.js';
import { appFixture, waitUntil } from './helpers.js';
const spec = {
  questions: [
    {
      id: 'format',
      header: 'Format',
      question: 'Which format?',
      options: [{ label: 'PDF' }, { label: 'Text' }],
    },
  ],
};

test('question answers validate scope, choices, duplicate delivery and cancellation', async () => {
  const service = new Questions();
  const signal = new AbortController();
  const runId = randomUUID();
  const pending = service.ask('chat', runId, spec, signal.signal);
  const q = service.get('chat')!;
  const value = { runId, answers: [{ questionId: 'format', selected: ['PDF'], text: '' }] };
  assert.throws(() => service.answer('other', q.id, value), /no longer/);
  assert.throws(() => service.answer('chat', q.id, { ...value, runId: randomUUID() }), /no longer/);
  assert.throws(() => service.answer('chat', q.id, { ...value, answers: [] }), /each question/);
  assert.throws(
    () =>
      service.answer('chat', q.id, {
        ...value,
        answers: [{ questionId: 'format', selected: ['Made up'] }],
      }),
    /available option/,
  );
  assert.deepEqual(service.answer('chat', q.id, value), { ok: true });
  assert.deepEqual(service.answer('chat', q.id, value), { ok: true });
  assert.equal(((await pending) as any).answers[0].selected[0], 'PDF');
  assert.equal(service.get('chat'), undefined);
  const cancelled = service.ask('chat', runId, spec, signal.signal);
  service.answer('chat', service.get('chat')!.id, { runId, cancelled: true });
  assert.deepEqual(await cancelled, { cancelled: true, answers: [] });
  const stopped = service.ask('chat', runId, spec, signal.signal);
  signal.abort();
  await assert.rejects(stopped, /stopped/);
  assert.equal(service.get('chat'), undefined);
  assert.throws(() =>
    service.ask(
      'chat',
      runId,
      { questions: [spec.questions[0], spec.questions[0]] },
      new AbortController().signal,
    ),
  );
});

test('task deadline is 60 minutes and excludes time waiting for user input', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let expired = 0;
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const deadline = new RunDeadline(() => expired++);
  clock += 59 * 60_000;
  t.mock.timers.tick(59 * 60_000);
  assert.equal(expired, 0);
  deadline.pause();
  t.mock.timers.tick(120 * 60_000);
  assert.equal(expired, 0);
  deadline.resume();
  t.mock.timers.tick(59_999);
  assert.equal(expired, 0);
  t.mock.timers.tick(1);
  assert.equal(expired, 1);
  const closed = new RunDeadline(() => expired++);
  closed.close();
  closed.resume();
  t.mock.timers.tick(60 * 60_000);
  assert.equal(expired, 1);
});

test('conversation uploads are isolated, explicitly promoted, and cleaned up with their conversation', async () => {
  const f = await appFixture('chat-files');
  try {
    await f.signIn();
    const p = f.store.createProject({ name: 'Uploads', instructions: '', toolsEnabled: false });
    const a = f.store.createConversation(p.id),
      b = f.store.createConversation(p.id);
    const files = f.knowledge.forConversation(a.id);
    const doc = await files.add(p.id, 'private.csv', Buffer.from('Name,Value\nA,2\nB,3'));
    assert.deepEqual(f.knowledge.list(p.id), []);
    assert.equal((await f.auth(`/conversations/${a.id}/files`)).json().length, 1);
    assert.equal((await f.auth(`/conversations/${b.id}/files`)).json().length, 0);
    assert.equal((await f.auth(`/projects/${p.id}/documents/${doc.id}`)).statusCode, 404);
    assert.equal((await f.auth(`/conversations/${b.id}/files/${doc.id}`)).statusCode, 404);
    assert.equal((await f.call(`/conversations/${a.id}/files/${doc.id}`)).statusCode, 401);
    assert.equal(
      (await f.auth(`/conversations/${a.id}/files/${doc.id}`)).body,
      'Name,Value\nA,2\nB,3',
    );
    const source = await f.charts.sources.list(a.id, { kind: 'document' });
    assert.equal(source.sources.length, 0, 'Unsent uploads are not exposed to source tools');
    await writeFile(
      f.store.sessionFile(a.id),
      JSON.stringify({
        type: 'custom_message',
        id: 'attachment',
        parentId: null,
        customType: 'frame_documents',
        details: { documents: [{ id: doc.id, name: doc.name }] },
      }) + '\n',
    );
    assert.equal(
      (await f.charts.sources.read(a.id, { kind: 'document', id: doc.id })).rows.length,
      2,
    );
    await assert.rejects(
      f.charts.sources.read(b.id, { kind: 'document', id: doc.id }),
      /not found/,
    );

    const url = `/conversations/${a.id}/files/${doc.id}/knowledge`;
    assert.equal((await f.auth(url, 'POST', {})).statusCode, 400);
    const promoted = (await f.auth(url, 'POST', { confirm: true })).json();
    assert(promoted.id && promoted.id !== doc.id);
    assert.equal((await f.auth(url, 'POST', { confirm: true })).json().id, promoted.id);
    assert.equal(f.knowledge.list(p.id).length, 1);
    assert.equal(
      (await f.auth(`/conversations/${a.id}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    assert(!existsSync(files.directory(doc)));
    assert.equal(f.knowledge.list(p.id).length, 1);
    assert.equal(f.store.db.prepare('SELECT count(*) as n FROM chat_documents').get()!.n, 0);
    const incognito = f.store.createConversation(p.id, true);
    const temporary = f.knowledge.forConversation(incognito.id);
    const temp = await temporary.add(p.id, 'temporary.txt', Buffer.from('private'));
    assert.equal(
      (
        await f.auth(`/conversations/${incognito.id}/files/${temp.id}/knowledge`, 'POST', {
          confirm: true,
        })
      ).statusCode,
      400,
    );
    await f.auth(`/conversations/${incognito.id}/end`, 'POST', {});
    await waitUntil(() => !f.store.conversation(incognito.id));
    assert(!existsSync(temporary.directory(temp)));
  } finally {
    await f.cleanup();
  }
});

test('real SDK asks, waits through reload, accepts an answer once, and retains scoped attachments on follow-up', async () => {
  const requests: any[] = [];
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    const chunk = (delta: object, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'question', object: 'chat.completion.chunk', model: 'local', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const tool = body.messages.findLast((m: any) => m.role === 'tool');
    if (!tool)
      res.end(
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'ask-1',
              type: 'function',
              function: { name: 'ask_user_question', arguments: JSON.stringify(spec) },
            },
          ],
        }) +
          chunk({}, 'tool_calls') +
          'data: [DONE]\n\n',
      );
    else res.end(chunk({ content: 'Answer received.' }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  const f = await appFixture('ask-sdk');
  try {
    await f.signIn();
    f.store.saveSettings({
      ...f.store.settings(),
      modelId: 'local',
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
    });
    const p = f.store.createProject({ name: 'Questions', instructions: '', toolsEnabled: false });
    const c = f.store.createConversation(p.id);
    const file = await f.knowledge
      .forConversation(c.id)
      .add(p.id, 'notes.md', Buffer.from('Only this chat knows about cobalt.'));
    const runId = randomUUID();
    assert.equal(
      (
        await f.auth(`/conversations/${c.id}/messages`, 'POST', {
          requestId: runId,
          text: 'Help me choose',
          documentIds: [file.id],
        })
      ).statusCode,
      202,
    );
    await waitUntil(() => !!f.runner.questions.get(c.id));
    assert.equal(requests.length, 1, 'No model work while awaiting an answer');
    const before = (await f.auth(`/conversations/${c.id}`)).json();
    const after = (await f.auth(`/conversations/${c.id}`)).json();
    assert.deepEqual(before.question, after.question);
    assert.equal(after.status, 'Waiting for your answer');
    assert(requests[0].tools.some((t: any) => t.function.name === 'ask_user_question'));
    assert(JSON.stringify(requests[0].messages).includes('cobalt'));
    const answerUrl = `/conversations/${c.id}/questions/${after.question.id}`;
    const answer = {
      runId,
      answers: [{ questionId: 'format', selected: ['PDF'], text: 'Include details' }],
    };
    assert.equal((await f.call(answerUrl, 'POST', answer)).statusCode, 401);
    assert.equal((await f.auth(answerUrl, 'POST', answer)).statusCode, 200);
    await waitUntil(() => !f.runner.snapshot(c.id).running);
    assert.equal(f.runner.snapshot(c.id).error, undefined);
    assert.equal(requests.length, 2);
    assert(JSON.stringify(requests[1].messages).includes('Include details'));
    assert.equal((await f.charts.sources.list(c.id, { kind: 'document' })).sources[0]?.id, file.id);
    await f.auth(`/conversations/${c.id}/messages`, 'POST', {
      requestId: randomUUID(),
      text: 'Follow up',
    });
    await waitUntil(() => !f.runner.snapshot(c.id).running);
    assert(JSON.stringify(requests.at(-1).messages).includes('cobalt'));
    assert.deepEqual(f.knowledge.list(p.id), []);
    const other = f.store.createConversation(p.id);
    assert.equal(
      (
        await f.auth(`/conversations/${other.id}/messages`, 'POST', {
          requestId: randomUUID(),
          text: 'Read it',
          documentIds: [file.id],
        })
      ).statusCode,
      404,
    );
  } finally {
    await f.cleanup();
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
  }
});
