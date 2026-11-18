import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { learningUnits } from '../server/maintenance/extraction.js';
import { waitUntil } from './helpers.js';
const origin = 'https://frame.test';
const extensionOrigin = `chrome-extension://${'a'.repeat(32)}`;
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-browser-'));
  const f = await createApp({ dataDir: root, origin, setupToken: 'setup' });
  const alice = f.store.createUser('alice', 'long-password-12345', 'admin', false);
  const bob = f.store.createUser('bob', 'long-password-12345', 'user', false);
  const project = f.store.createProject(
    { name: 'Browser', instructions: '', toolsEnabled: true },
    alice.id,
  );
  f.store.db
    .prepare("INSERT OR REPLACE INTO project_plugins VALUES (?,'browser',1)")
    .run(project.id);
  f.browser.setEnabled(true);
  const chat = f.store.createConversation(project.id);
  const pair = f.browser.pair(f.browser.pairCode(alice.id).code, 'Alice Chrome');
  const other = f.browser.pair(f.browser.pairCode(bob.id).code, 'Bob Chrome');
  const tab = { id: '123', url: 'https://internal.test/records', title: 'Records' };
  f.browser.poll(pair.id);
  f.browser.bind(alice.id, chat.id, pair.id, [tab]);
  const call = (url: string, method = 'GET', body?: unknown, token = pair.token) =>
    f.app.inject({
      url: `/api${url}`,
      method: method as any,
      payload: body as any,
      headers: { host: 'frame.test', origin: extensionOrigin, authorization: `Bearer ${token}` },
    });
  return {
    ...f,
    root,
    alice,
    bob,
    project,
    chat,
    pair,
    other,
    tab,
    call,
    async cleanup() {
      await f.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('browser device scopes, account isolation, one-time pairing and revocation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/projects')).statusCode, 200);
    assert.equal(
      (await f.call(`/conversations/${f.chat.id}/browser`, 'GET', undefined, f.other.token))
        .statusCode,
      404,
    );
    assert.equal((await f.call('/admin/users')).statusCode, 403);
    assert.equal((await f.call('/settings', 'PUT', {})).statusCode, 403);
    assert.equal(
      (await f.call(`/projects/${f.project.id}/plugins`, 'PUT', { browser: true })).statusCode,
      403,
    );
    assert.equal(
      (
        await f.call(
          `/conversations/${f.chat.id}/browser/reviews/${randomUUID()}`,
          'POST',
          { runId: randomUUID(), approve: true },
          f.other.token,
        )
      ).statusCode,
      404,
    );
    assert.equal((await f.call('/browser/device/poll')).headers['cache-control'], 'no-store');
    const code = f.browser.pairCode(f.alice.id).code;
    const p = await f.app.inject({
      url: '/api/browser/device/pair',
      method: 'POST',
      headers: { host: 'frame.test', origin: extensionOrigin },
      payload: { code, name: 'Second browser' },
    });
    assert.equal(p.statusCode, 200, p.body);
    assert.throws(() => f.browser.pair(code, 'replay'), /invalid or expired/);
    f.browser.revoke(f.alice.id, f.pair.id);
    assert.equal((await f.call('/projects')).statusCode, 401);
    assert.equal(f.browser.state(f.chat.id).device, undefined);
    assert.ok(f.browser.used(f.chat.id), 'revoking a device must preserve learning exclusion');
  } finally {
    await f.cleanup();
  }
});
test('browser actions require exact batch approval, deliver once, and stop after uncertain failure', async () => {
  const f = await fixture();
  try {
    const run = randomUUID(),
      signal = new AbortController();
    const actions = [
      { kind: 'fill', tab: f.tab.id, ref: '0/doc:1', value: 'New department' },
      { kind: 'click', tab: f.tab.id, ref: '0/doc:2' },
    ];
    const promise = f.browser.invoke(
      f.chat.id,
      run,
      'browser_actions',
      { summary: 'Update department and save record 42', actions },
      signal.signal,
    );
    const prepare = f.browser.poll(f.pair.id).command!;
    assert.equal(prepare.kind, 'prepare');
    assert.equal(
      f.browser.poll(f.pair.id).command,
      undefined,
      'claimed commands are not redelivered',
    );
    assert.throws(() => f.browser.respond(f.other.id, prepare.id, []), /expired/);
    const prepared = actions.map((action, i) => ({
      action,
      url: f.tab.url,
      title: f.tab.title,
      label: i ? 'Save record 42' : 'Department',
      fingerprint: `fingerprint-${i}`,
      review: true,
      reason: 'Changes data',
    }));
    f.browser.respond(f.pair.id, prepare.id, prepared);
    await waitUntil(() => !!f.browser.state(f.chat.id).review);
    assert.equal(f.browser.poll(f.pair.id).command, undefined, 'nothing executes before approval');
    const review = f.browser.state(f.chat.id).review!;
    assert.throws(() => f.browser.decide(f.chat.id, review.id, randomUUID(), true), /no longer/);
    f.browser.decide(f.chat.id, review.id, run, true);
    assert.throws(() => f.browser.decide(f.chat.id, review.id, run, true), /no longer/);
    await new Promise((r) => setImmediate(r));
    const first = f.browser.poll(f.pair.id).command!;
    assert.equal(first.kind, 'execute');
    assert.deepEqual(first.payload, prepared[0]);
    f.browser.respond(f.pair.id, first.id, { ok: true, tab: f.tab, notice: 'Filled' });
    await new Promise((r) => setImmediate(r));
    const second = f.browser.poll(f.pair.id).command!;
    f.browser.respond(
      f.pair.id,
      second.id,
      undefined,
      'Connection lost after click; outcome unknown',
    );
    const result = (await promise) as any;
    assert.equal(result.results.length, 1);
    assert.equal(result.stopped, true);
    assert.match(result.error, /unknown/);
    assert.equal(f.browser.poll(f.pair.id).command, undefined);
    assert.throws(() => f.browser.respond(f.pair.id, second.id, {}), /expired/);
  } finally {
    await f.cleanup();
  }
});
test('stop, disable, ownership checks, disconnect, screenshot support and stale results fail closed', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.browser.invoke(
        f.chat.id,
        randomUUID(),
        'browser_snapshot',
        { tab: '999' },
        new AbortController().signal,
      ),
      /not attached/,
    );
    const c = new AbortController();
    const work = f.browser.invoke(
      f.chat.id,
      randomUUID(),
      'browser_snapshot',
      { tab: '123' },
      c.signal,
    );
    const command = f.browser.poll(f.pair.id).command!;
    c.abort();
    await assert.rejects(work, /stopped/);
    assert.throws(() => f.browser.respond(f.pair.id, command.id, {}), /expired/);
    f.store.saveSettings({ ...f.store.settings(), supportsImages: false });
    await assert.rejects(
      f.browser.invoke(
        f.chat.id,
        randomUUID(),
        'browser_screenshot',
        { tab: '123' },
        new AbortController().signal,
      ),
      /does not support/,
    );
    assert.throws(() => f.browser.bind(f.bob.id, f.chat.id, f.other.id, [f.tab]), /not found/);
    const p = f.browser.invoke(
      f.chat.id,
      randomUUID(),
      'browser_handoff',
      { message: 'Sign in, then continue' },
      new AbortController().signal,
    );
    assert.ok(f.browser.state(f.chat.id).review?.handoff);
    f.browser.setEnabled(false);
    await assert.rejects(p, /cancelled/);
    assert.equal((await f.call('/projects')).statusCode, 401);
    assert.ok(f.browser.used(f.chat.id));
  } finally {
    await f.cleanup();
  }
});
test('browser learning exclusion covers derived prose and SQL in the same branch', () => {
  const branch = [
    { type: 'message', message: { role: 'user', content: 'Remember these account balances' } },
    {
      type: 'message',
      message: {
        role: 'toolResult',
        toolName: 'browser_snapshot',
        content: [{ type: 'text', text: 'Private table' }],
      },
    },
    {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'The private balance is 1000.' }],
      },
    },
  ];
  assert.deepEqual(learningUnits(branch), []);
});

test('real Pi worker exposes browser tools, waits for approved execution, and persists browser results', async () => {
  const { createServer } = await import('node:http');
  const requests: any[] = [];
  let step = 0;
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requests.push(body);
    const plan = [
      { name: 'browser_snapshot', args: { tab: '123' } },
      {
        name: 'browser_actions',
        args: {
          summary: 'Save record 42',
          actions: [{ kind: 'click', tab: '123', ref: '0/doc:1' }],
        },
      },
    ][step++];
    const delta = plan
      ? {
          tool_calls: [
            {
              index: 0,
              id: `call-${step}`,
              type: 'function',
              function: { name: plan.name, arguments: JSON.stringify(plan.args) },
            },
          ],
        }
      : { content: 'Action dispatched. Inspect the website receipt.' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      `data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: plan ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  const f = await fixture();
  let ticking = false;
  const poll = setInterval(() => {
    if (ticking) return;
    ticking = true;
    try {
      const command = f.browser.poll(f.pair.id).command;
      if (command?.kind === 'snapshot')
        f.browser.respond(f.pair.id, command.id, {
          url: f.tab.url,
          title: 'Record 42',
          text: 'Record 42',
          elements: [{ ref: '0/doc:1', role: 'button', label: 'Save record 42' }],
          truncated: false,
        });
      if (command?.kind === 'prepare')
        f.browser.respond(
          f.pair.id,
          command.id,
          (command.payload as any[]).map((action) => ({
            action,
            url: f.tab.url,
            title: 'Record 42',
            label: 'Save record 42',
            fingerprint: 'same-page',
            review: true,
            reason: 'Changes data',
          })),
        );
      if (command?.kind === 'execute')
        f.browser.respond(f.pair.id, command.id, { ok: true, tab: f.tab, notice: 'Dispatched' });
    } finally {
      ticking = false;
    }
  }, 20);
  try {
    f.store.saveSettings({
      ...f.store.settings(),
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      modelId: 'local',
      contextWindow: 16000,
      maxTokens: 2048,
    });
    const runId = randomUUID();
    f.runner.start(f.chat.id, runId, 'Save record 42');
    await waitUntil(() => !!f.browser.state(f.chat.id).review || !f.runner.active.has(f.chat.id));
    const review = f.browser.state(f.chat.id).review;
    assert.ok(review, JSON.stringify(f.runner.snapshot(f.chat.id)));
    assert.equal(step, 2, 'model is suspended at approval');
    f.browser.decide(f.chat.id, review.id, runId, true);
    await waitUntil(() => !f.runner.active.has(f.chat.id));
    const snapshot = f.runner.snapshot(f.chat.id);
    assert.equal(snapshot.error, undefined);
    assert.ok(
      snapshot.messages.some((m) => m.name === 'browser_actions' && m.text.includes('Dispatched')),
    );
    assert.ok(requests[0].tools.some((t: any) => t.function.name === 'browser_snapshot'));
    assert.ok(!requests[0].tools.some((t: any) => t.function.name === 'bash'));
    const { readSessionBranch } = await import('../server/history.js');
    assert.deepEqual(learningUnits(readSessionBranch(f.store.sessionFile(f.chat.id))), []);
  } finally {
    clearInterval(poll);
    await f.cleanup();
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
  }
});
