import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, get } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { deleteWorkspaceData } from '../server/deletion.js';
import { readHistory, displayMessages } from '../server/history.js';
import { applyUpdate } from '../web/snapshots.js';
import { unzipSync, strFromU8 } from 'fflate';
import YAML from 'yaml';
import { documentCommand } from '../server/python.js';
import { SessionManager } from '@earendil-works/pi-coding-agent';

const origin = 'http://127.0.0.1:3000';
test('reasoning projection handles structured and tagged streams without animating history', () => {
  const message = {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'Compare sources.' },
      { type: 'text', text: 'Answer' },
    ],
  };
  assert.equal(displayMessages([message], true)[0]?.thinkingActive, true);
  assert.equal(displayMessages([message])[0]?.thinkingActive, false);
  const tagged = { role: 'assistant', content: '<think>Still working' };
  assert.equal(displayMessages([tagged], true)[0]?.thinking, 'Still working');
  assert.equal(displayMessages([tagged])[0]?.thinkingActive, false);
  assert.equal(
    displayMessages([{ role: 'assistant', content: '<think>Done</think>Final' }])[0]?.text,
    'Final',
  );
  assert.equal(
    displayMessages([{ role: 'assistant', content: 'An example: <think>not reasoning</think>' }])[0]
      ?.thinking,
    undefined,
  );
});
test('a data directory reached through a symlink stores knowledge and deletes projects', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-symlink-test-'));
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await mkdir(path.join(root, 'real'));
    await symlink(path.join(root, 'real'), path.join(root, 'link'));
    const created = await createApp({
      dataDir: path.join(root, 'link', 'data'),
      origin,
      setupToken: 'test',
    });
    app = created.app;
    const project = created.store.createProject({
      name: 'Linked',
      instructions: '',
      toolsEnabled: false,
    });
    const doc = await created.knowledge.add(project.id, 'notes.md', Buffer.from('# Notes'));
    await created.wiki.record(project.id, doc.id);
    assert.equal((await created.wiki.catalog(project.id))[0]?.revision, doc.revision);
    assert.deepEqual(created.store.project(project.id), project);
    assert.equal(created.knowledge.get(project.id, doc.id).truncated, false);
    deleteWorkspaceData(created.store, created.runner, created.knowledge, project.id);
    assert.equal(created.store.project(project.id), undefined);
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('production static UI is served with security headers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-static-test-'));
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    const webDir = path.join(root, 'web');
    await mkdir(webDir);
    await writeFile(path.join(webDir, 'index.html'), '<html><body>Frame</body></html>');
    ({ app } = await createApp({
      dataDir: path.join(root, 'data'),
      origin,
      setupToken: 'test',
      webDir,
    }));
    const response = await app.inject({ url: '/', headers: { host: '127.0.0.1:3000' } });
    assert.equal(response.statusCode, 200);
    assert(response.body.includes('Frame'));
    assert.match(String(response.headers['content-security-policy']), /frame-ancestors 'none'/);
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-app-test-'));
  const ctx = await createApp({ dataDir: root, origin, setupToken: 'test-setup-token' });
  const call = (url: string, method = 'GET', payload?: unknown, token = '') =>
    ctx.app.inject({
      url: `/api${url}`,
      method: method as any,
      payload: payload as any,
      headers: { host: '127.0.0.1:3000', origin, ...(token ? { cookie: token } : {}) },
    });
  const setup = await call('/auth/setup', 'POST', {
    token: 'test-setup-token',
    password: 'test-password-12345',
  });
  assert.equal(setup.statusCode, 200);
  const login = await call('/auth/login', 'POST', { password: 'test-password-12345' });
  const token = String(login.headers['set-cookie']).split(';')[0]!;
  const auth = (url: string, method = 'GET', payload?: unknown) =>
    call(url, method, payload, token);
  return {
    ...ctx,
    root,
    call,
    auth,
    token,
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('authentication, origin checks, settings secrecy, and project boundaries', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/projects')).statusCode, 401);
    const blocked = await f.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { host: '127.0.0.1:3000', origin: 'https://evil.test', cookie: f.token },
      payload: { name: 'No' },
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(
      (await f.app.inject({ url: '/api/auth/status', headers: { host: 'evil.test' } })).statusCode,
      403,
    );
    assert.equal(
      (
        await f.call('/auth/setup', 'POST', {
          password: 'another-password',
          token: 'test-setup-token',
        })
      ).statusCode,
      409,
    );
    const saved = await f.auth('/settings', 'PUT', {
      ...f.store.settings(),
      modelId: 'local-test',
      apiKey: 'do-not-return-this',
    });
    assert.equal(saved.statusCode, 200);
    const settings = await f.auth('/settings');
    assert.equal(settings.json().hasApiKey, true);
    assert(!settings.body.includes('do-not-return-this'));
    assert.equal(
      (
        await f.auth('/settings', 'PUT', {
          ...f.store.settings(),
          baseUrl: 'https://cloud.example/v1',
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await f.auth('/conversations', 'POST', { projectId: randomUUID() })).statusCode,
      404,
    );
    const p = (await f.auth('/projects', 'POST', { name: 'Research' })).json();
    assert.equal(p.toolsEnabled, false);
    const c = (await f.auth('/conversations', 'POST', { projectId: p.id })).json();
    await mkdir(f.store.artifacts(c), { recursive: true });
    await writeFile(path.join(f.store.artifacts(c), 'test.html'), '<script>alert(1)</script>');
    const download = await f.auth(`/conversations/${c.id}/artifacts/test.html`);
    assert.equal(download.statusCode, 200);
    assert.match(String(download.headers['content-disposition']), /^attachment/);
    assert.equal(download.headers['content-type'], 'application/octet-stream');
    await f.auth('/auth/logout', 'POST', {});
    assert.equal((await f.auth('/projects')).statusCode, 401);
  } finally {
    await f.cleanup();
  }
});

async function waitUntil(test: () => boolean, timeout = 25000) {
  const end = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > end) throw new Error('Timed out waiting for agent');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

test(
  'SDK compaction checkpoints preserve history, resume once, expose usage and throughput, and survive failure/cancellation',
  { timeout: 60000 },
  async () => {
    const requests: any[] = [];
    let mode: 'normal' | 'error' | 'hold' = 'normal';
    const mock = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      if (mode === 'error') {
        res.writeHead(500);
        res.end('summary unavailable');
        return;
      }
      if (mode === 'hold') return;
      const summary = JSON.stringify(body.messages).includes('<conversation>');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (delta: object, finish: string | null = null, usage?: object) =>
        `data: ${JSON.stringify({ id: 'context-test', object: 'chat.completion.chunk', model: 'context-model', choices: [{ index: 0, delta, finish_reason: finish }], usage })}\n\n`;
      res.write(
        event({
          role: 'assistant',
          content: summary
            ? '# Goal\nPreserve the deployment decision.\n# Next steps\nContinue safely; completed actions must not be replayed.'
            : 'Continued exactly once.',
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 180));
      res.end(
        event({}, 'stop', { prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000 }) +
          'data: [DONE]\n\n',
      );
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const f = await fixture();
    try {
      f.store.saveSettings({
        ...f.store.settings(),
        baseUrl: `http://127.0.0.1:${(mock.address() as { port: number }).port}/v1`,
        modelId: 'context-model',
        contextWindow: 8192,
        maxTokens: 1024,
      });
      const p = f.store.createProject({
        name: 'Context test',
        instructions: '',
        toolsEnabled: false,
      });
      const seed = (tokens = 1500) => {
        const c = f.store.createConversation(p.id);
        const manager = SessionManager.open(
          f.store.sessionFile(c.id),
          path.dirname(f.store.sessionFile(c.id)),
          f.store.projectPath(p.id),
        );
        for (let i = 0; i < 12; i++) {
          manager.appendMessage({
            role: 'user',
            content: `Question ${i}: ${'source facts '.repeat(100)}`,
            timestamp: Date.now(),
          });
          manager.appendMessage({
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: `Decision ${i}: keep verified sources. ${'detailed explanation '.repeat(100)}`,
              },
            ],
            api: 'openai-completions',
            provider: 'frame-local',
            model: 'context-model',
            usage: {
              input: tokens - 100,
              output: 100,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: tokens,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
          });
        }
        return c;
      };
      const c = seed();
      const original = readHistory(f.store.sessionFile(c.id));
      const id = randomUUID();
      assert.equal(
        (await f.call(`/conversations/${c.id}/compact`, 'POST', { requestId: id })).statusCode,
        401,
      );
      assert.equal(
        (await f.auth(`/conversations/${c.id}/compact`, 'POST', { requestId: id })).statusCode,
        202,
      );
      assert(
        (await f.auth(`/conversations/${c.id}/compact`, 'POST', { requestId: id })).json()
          .duplicate,
      );
      await waitUntil(() => !f.runner.active.has(c.id));
      let snapshot = f.runner.snapshot(c.id);
      assert.equal(snapshot.error, undefined);
      assert.equal(snapshot.metrics?.context.compactions, 1);
      assert(
        snapshot.metrics?.context.estimated,
        'Post-summary usage must not reuse pre-summary provider counts',
      );
      assert.match(snapshot.metrics!.context.lastCompaction!.summary, /deployment decision/);
      assert.deepEqual(
        snapshot.messages,
        original,
        'Compaction must retain all visible original messages',
      );
      assert.equal(
        snapshot.metrics?.generation,
        undefined,
        'Summary generation is not chat throughput',
      );
      const requestCount = requests.length;
      const checkpointSize = snapshot.metrics!.context.lastCompaction!.after;
      await f.auth(`/conversations/${c.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'Continue with nonce-438',
      });
      await waitUntil(() => !f.runner.active.has(c.id));
      assert.equal(requests.length, requestCount + 1, 'Only one continuation request');
      assert.match(JSON.stringify(requests.at(-1)), /deployment decision/);
      assert.match(JSON.stringify(requests.at(-1)), /nonce-438/);
      snapshot = f.runner.snapshot(c.id);
      assert.equal(snapshot.metrics?.context.tokens, 1000);
      assert.equal(snapshot.metrics?.context.estimated, false);
      assert.equal(snapshot.metrics?.generation?.tokens, 100);
      assert((snapshot.metrics?.generation?.tokensPerSecond || 0) > 0);
      assert.equal(snapshot.metrics?.generation?.estimated, false);
      assert.equal(snapshot.messages.length, original.length + 2);
      await f.auth(`/conversations/${c.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'One more follow-up',
      });
      await waitUntil(() => !f.runner.active.has(c.id));
      assert.equal(
        f.runner.snapshot(c.id).metrics?.context.lastCompaction?.after,
        checkpointSize,
        'A saved checkpoint size must not grow as later messages accumulate',
      );
      f.store.saveSettings({ ...f.store.settings(), modelId: 'changed-model' });
      assert.equal(
        f.runner.snapshot(c.id).metrics?.context.tokens,
        null,
        'Changing models invalidates cached counts',
      );
      f.store.saveSettings({ ...f.store.settings(), modelId: 'context-model' });

      const auto = seed(6900);
      const beforeAuto = requests.length;
      await f.auth(`/conversations/${auto.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'Continue automatic checkpoint',
      });
      await waitUntil(() => !f.runner.active.has(auto.id));
      assert.equal(f.runner.snapshot(auto.id).error, undefined);
      assert.equal(f.runner.snapshot(auto.id).metrics?.context.compactions, 1);
      assert(requests.length >= beforeAuto + 2, 'Summary must precede the pending prompt');
      assert.equal(
        requests
          .slice(beforeAuto)
          .filter((r) => JSON.stringify(r.messages).includes('Continue automatic checkpoint'))
          .length,
        1,
      );
      // Exercise the public SDK transform hook against an actual outbound request.
      f.store.saveSettings({ ...f.store.settings(), autoCompaction: false });
      const projected = f.store.createConversation(p.id);
      const manager = SessionManager.open(
        f.store.sessionFile(projected.id),
        path.dirname(f.store.sessionFile(projected.id)),
        f.store.projectPath(p.id),
      );
      const assistant = (content: any[], stopReason: 'stop' | 'toolUse' = 'stop') => ({
        role: 'assistant' as const,
        content,
        api: 'openai-completions' as const,
        provider: 'frame-local',
        model: 'context-model',
        usage: {
          input: 900,
          output: 100,
          totalTokens: 1000,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
        },
        stopReason,
        timestamp: Date.now(),
      });
      manager.appendMessage({ role: 'user', content: 'Read the source', timestamp: Date.now() });
      manager.appendMessage(
        assistant(
          [
            {
              type: 'toolCall',
              id: 'old-read',
              name: 'read_knowledge',
              arguments: { id: 'source' },
            },
          ],
          'toolUse',
        ),
      );
      const fullOutput = `SOURCE START ${'original source detail '.repeat(700)} SOURCE END`;
      manager.appendMessage({
        role: 'toolResult',
        toolCallId: 'old-read',
        toolName: 'read_knowledge',
        content: [{ type: 'text', text: fullOutput }],
        isError: false,
        timestamp: Date.now(),
      });
      for (let i = 0; i < 2; i++) {
        manager.appendMessage(assistant([{ type: 'text', text: 'Acknowledged.' }]));
        manager.appendMessage({ role: 'user', content: `Follow-up ${i}`, timestamp: Date.now() });
      }
      manager.appendMessage(assistant([{ type: 'text', text: 'Ready.' }]));
      await f.auth(`/conversations/${projected.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'Summarize the source',
      });
      await waitUntil(() => !f.runner.active.has(projected.id));
      const sentTool = requests.at(-1).messages.find((m: any) => m.role === 'tool');
      assert.equal(sentTool.tool_call_id, 'old-read');
      assert.match(sentTool.content, /older read-only output shortened/);
      assert(sentTool.content.length < fullOutput.length);
      assert.equal(
        readHistory(f.store.sessionFile(projected.id)).find((m) => m.role === 'tool')?.text,
        fullOutput,
      );
      assert.equal(f.runner.snapshot(projected.id).metrics?.context.compactions, 0);
      assert((f.runner.snapshot(projected.id).metrics?.context.prunedTokens || 0) > 0);
      f.store.saveSettings({ ...f.store.settings(), autoCompaction: true });
      for (const behavior of ['error', 'hold'] as const) {
        mode = behavior;
        const failed = seed();
        const before = readHistory(f.store.sessionFile(failed.id));
        const count = requests.length;
        await f.auth(`/conversations/${failed.id}/compact`, 'POST', { requestId: randomUUID() });
        await waitUntil(() => requests.length > count);
        if (behavior === 'hold') await f.auth(`/conversations/${failed.id}/stop`, 'POST', {});
        await waitUntil(() => !f.runner.active.has(failed.id));
        assert.deepEqual(readHistory(f.store.sessionFile(failed.id)), before);
        assert.equal(f.runner.snapshot(failed.id).metrics?.context.compactions, 0);
        if (behavior === 'error') assert(f.runner.snapshot(failed.id).error);
        else assert.equal(f.runner.snapshot(failed.id).status, 'stopped');
        assert.equal(
          requests.length,
          count + 1,
          'Never retry/replay a failed or cancelled compaction automatically',
        );
      }
      // Stop during automatic preflight must not submit the queued follow-up afterward.
      mode = 'hold';
      f.store.saveSettings({ ...f.store.settings(), autoCompaction: true });
      const cancelledFollowup = seed(6900);
      const beforeCancel = requests.length;
      await f.auth(`/conversations/${cancelledFollowup.id}/messages`, 'POST', {
        requestId: randomUUID(), text: 'Never submit this follow-up after Stop',
      });
      await waitUntil(() => requests.length > beforeCancel);
      await f.auth(`/conversations/${cancelledFollowup.id}/stop`, 'POST', {
        runId: f.runner.snapshot(cancelledFollowup.id).runId,
      });
      await waitUntil(() => !f.runner.active.has(cancelledFollowup.id));
      assert.equal(f.runner.snapshot(cancelledFollowup.id).status, 'stopped');
      assert.equal(requests.length, beforeCancel + 1, 'Cancellation must not launch the queued prompt');
    } finally {
      await f.cleanup();
      mock.closeAllConnections();
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  },
);

test(
  'real Pi SDK worker: streamed local completion, deduplication, resume, and no cloud fallback',
  { timeout: 60000 },
  async () => {
    const requests: any[] = [];
    const mock = createServer(async (req, res) => {
      if (req.url === '/v1/models') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'frame-test-model' }] }));
        return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const reason = (text: string) =>
        `data: ${JSON.stringify({ id: 'cmpl-test', object: 'chat.completion.chunk', created: 1, model: 'frame-test-model', choices: [{ index: 0, delta: { reasoning_content: text }, finish_reason: null }] })}\n\n`;
      res.write(reason('First I inspect the sources. '));
      await new Promise((resolve) => setTimeout(resolve, 150));
      res.write(reason('Then I compare the findings.'));
      await new Promise((resolve) => setTimeout(resolve, 150));
      res.write(
        `data: ${JSON.stringify({ id: 'cmpl-test', object: 'chat.completion.chunk', created: 1, model: 'frame-test-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello from the local test model.' }, finish_reason: null }] })}\n\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      res.end(
        `data: ${JSON.stringify({ id: 'cmpl-test', object: 'chat.completion.chunk', created: 1, model: 'frame-test-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } })}\n\ndata: [DONE]\n\n`,
      );
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const port = (mock.address() as { port: number }).port;
    const f = await fixture();
    try {
      f.store.saveSettings({
        ...f.store.settings(),
        baseUrl: `http://127.0.0.1:${port}/v1`,
        modelId: 'frame-test-model',
      });
      assert.equal((await f.auth('/settings/test', 'POST', {})).json().selectedModelFound, true);
      const p = (
        await f.auth('/projects', 'POST', { name: 'SDK test', instructions: 'Keep it brief.' })
      ).json();
      const c = (await f.auth('/conversations', 'POST', { projectId: p.id })).json();
      const requestId = randomUUID();
      const first = await f.auth(`/conversations/${c.id}/messages`, 'POST', {
        requestId,
        text: 'Hello',
      });
      assert.equal(first.statusCode, 202, first.body);
      const duplicate = await f.auth(`/conversations/${c.id}/messages`, 'POST', {
        requestId,
        text: 'Hello',
      });
      assert.equal(duplicate.json().duplicate, true);
      assert.equal(
        (
          await f.auth(`/conversations/${c.id}/messages`, 'POST', {
            requestId: randomUUID(),
            text: 'Concurrent',
          })
        ).statusCode,
        409,
      );
      assert.equal((await f.auth('/settings', 'PUT', f.store.settings())).statusCode, 409);
      let sawStream = false;
      const thinking: string[] = [];
      f.runner.on(c.id, () => {
        for (const message of f.runner.snapshot(c.id).messages)
          if (message.thinkingActive) thinking.push(message.thinking || '');
        if (
          f.runner.snapshot(c.id).running &&
          f.runner.snapshot(c.id).messages.some((m) => m.text.includes('Hello from'))
        )
          sawStream = true;
      });
      // A tab holding the finished messages receives only the streaming tail.
      let client = f.runner.snapshot(c.id);
      let tails = 0;
      const mismatches: string[] = [];
      f.runner.on(c.id, () => {
        const update = f.runner.update(c.id);
        const merged = update && applyUpdate(client, update);
        const full = f.runner.snapshot(c.id);
        if (!merged) {
          client = full;
          return;
        }
        if (update.tail) tails++;
        if (JSON.stringify(merged.messages) !== JSON.stringify(full.messages))
          mismatches.push(JSON.stringify({ merged: merged.messages, full: full.messages }));
        client = merged;
      });
      await waitUntil(() => !f.runner.active.has(c.id));
      const snapshot = f.runner.snapshot(c.id);
      assert.equal(snapshot.error, undefined, JSON.stringify(snapshot));
      assert.equal(snapshot.status, 'completed');
      assert.equal(requests.length, 1);
      assert(sawStream);
      assert(tails > 0, 'Streaming should produce tail-only updates');
      assert.deepEqual(mismatches, []);
      assert.equal(applyUpdate(client, snapshot), snapshot);
      assert(thinking.some((t) => t.includes('First I inspect')));
      assert(thinking.some((t) => t.includes('Then I compare')));
      assert(!snapshot.messages.some((m) => m.thinkingActive));
      assert(
        readHistory(f.store.sessionFile(c.id)).some((m) => m.thinking?.includes('Then I compare')),
      );
      assert(
        snapshot.messages.some(
          (m) => m.role === 'assistant' && m.text.includes('local test model'),
        ),
      );
      assert.equal(requests[0].model, 'frame-test-model');
      assert.deepEqual(requests[0].tools.map((t: any) => t.function.name).sort(), [
        'propose_knowledge',
        'read_knowledge',
        'search_knowledge',
      ]);
      const second = await f.auth(`/conversations/${c.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'Continue',
      });
      assert.equal(second.statusCode, 202);
      await waitUntil(() => !f.runner.active.has(c.id));
      assert.equal(f.runner.snapshot(c.id).status, 'completed');
      assert.equal(requests.length, 2);
      assert(
        requests[1].messages.some(
          (m: any) => m.role === 'assistant' && m.content.includes('local test model'),
        ),
      );
      assert.equal(
        readHistory(f.store.sessionFile(c.id)).filter((m) => m.role === 'user').length,
        2,
      );
      // Reconnecting subscribes to state; it must never resubmit a prompt.
      await f.app.listen({ host: '127.0.0.1', port: 0 });
      const httpPort = (f.app.server.address() as { port: number }).port;
      for (let i = 0; i < 2; i++) {
        await new Promise<void>((resolve, reject) => {
          const request = get(
            `http://127.0.0.1:${httpPort}/api/conversations/${c.id}/events`,
            {
              headers: { host: '127.0.0.1:3000', cookie: f.token },
            },
            (response) => {
              response.once('data', (chunk) => {
                try {
                  assert.equal(response.statusCode, 200);
                  assert(String(chunk).includes('local test model'));
                  resolve();
                } catch (error) {
                  reject(error);
                } finally {
                  request.destroy();
                }
              });
            },
          );
          request.on('error', reject);
        });
      }
      assert.equal(
        (
          await f.auth(`/conversations/${c.id}/messages`, 'POST', { requestId, text: 'Hello' })
        ).json().duplicate,
        true,
      );
      assert.equal(requests.length, 2);
    } finally {
      await f.cleanup();
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  },
);

test(
  'SDK tools create artifacts; stopping and endpoint failures finish visibly',
  { timeout: 60000 },
  async () => {
    let behavior: 'tool' | 'hang' | 'redirect' | 'error' = 'tool';
    let modelCalls = 0;
    let requested = false;
    let artifactFile = '';
    const mock = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requested = true;
      if (behavior === 'redirect') {
        res.writeHead(302, { Location: 'https://example.com/v1/chat/completions' });
        res.end();
        return;
      }
      if (behavior === 'error') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Template mismatch' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta: unknown, finish: string | null = null) =>
        `data: ${JSON.stringify({ id: 'tool-test', object: 'chat.completion.chunk', created: 1, model: 'frame-test-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      if (behavior === 'hang') {
        res.write(chunk({ role: 'assistant', content: 'Working…' }));
        return;
      }
      modelCalls++;
      if (modelCalls === 1) {
        const request = JSON.parse(raw);
        assert(request.tools.some((t: any) => t.function.name === 'write'));
        res.write(
          chunk({
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_write',
                type: 'function',
                function: {
                  name: 'write',
                  arguments: JSON.stringify({
                    path: artifactFile,
                    content: 'Frame integration artifact',
                  }),
                },
              },
            ],
          }),
        );
        res.end(chunk({}, 'tool_calls') + 'data: [DONE]\n\n');
      } else {
        res.end(
          chunk({ role: 'assistant', content: 'Created your file.' }) +
            chunk({}, 'stop') +
            'data: [DONE]\n\n',
        );
      }
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const f = await fixture();
    try {
      f.store.saveSettings({
        ...f.store.settings(),
        modelId: 'frame-test-model',
        baseUrl: `http://127.0.0.1:${(mock.address() as any).port}/v1`,
      });
      const p = f.store.createProject({
        name: 'Trusted tool test',
        instructions: '',
        toolsEnabled: true,
      });
      const c = f.store.createConversation(p.id);
      artifactFile = path.join(f.store.artifacts(c), 'report.txt');
      f.runner.start(c.id, randomUUID(), 'Create a report.');
      await waitUntil(() => !f.runner.active.has(c.id));
      assert.equal(
        f.runner.snapshot(c.id).status,
        'completed',
        JSON.stringify(f.runner.snapshot(c.id)),
      );
      assert.equal(modelCalls, 2);
      assert(f.runner.snapshot(c.id).messages.some((m) => m.role === 'tool'));
      assert.equal(
        (await f.auth(`/conversations/${c.id}/artifacts/report.txt`)).body,
        'Frame integration artifact',
      );
      behavior = 'hang';
      requested = false;
      const stopChat = f.store.createConversation(p.id);
      const stopRun = randomUUID();
      f.runner.start(stopChat.id, stopRun, 'Keep going');
      await waitUntil(() => requested);
      const observed = f.runner.snapshot(stopChat.id);
      assert.equal(observed.runId, stopRun);
      assert(f.runner.snapshot(stopChat.id).revision! > observed.revision!);
      assert.equal((await f.call(`/conversations/${stopChat.id}/stop`, 'POST', { runId: stopRun })).statusCode, 401);
      assert.equal((await f.auth(`/conversations/${stopChat.id}/stop`, 'POST', { runId: randomUUID() })).statusCode, 409);
      assert.equal(f.runner.active.get(stopChat.id)?.stopRequested, false);
      assert.equal((await f.auth(`/conversations/${stopChat.id}/stop`, 'POST', { runId: stopRun })).statusCode, 200);
      assert.equal((await f.auth(`/conversations/${stopChat.id}/stop`, 'POST', { runId: stopRun })).statusCode, 200);
      await waitUntil(() => !f.runner.active.has(stopChat.id));
      assert.equal(f.runner.snapshot(stopChat.id).status, 'stopped');
      for (const mode of ['error', 'redirect'] as const) {
        behavior = mode;
        const failed = f.store.createConversation(p.id);
        f.runner.start(failed.id, randomUUID(), 'Hello');
        await waitUntil(() => !f.runner.active.has(failed.id));
        assert.equal(f.runner.snapshot(failed.id).status, 'failed');
        assert(f.runner.snapshot(failed.id).error);
      }
    } finally {
      await f.cleanup();
      mock.closeAllConnections();
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  },
);

test('uploads, OKF export, reviewed conversation updates, revisions, and project boundaries', async () => {
  const f = await fixture();
  try {
    const p = f.store.createProject({
      name: 'Knowledge test',
      instructions: '',
      toolsEnabled: false,
    });
    const other = f.store.createProject({ name: 'Other', instructions: '', toolsEnabled: false });
    const upload = (name: string, content: Buffer, cookie = f.token) =>
      f.app.inject({
        method: 'POST',
        url: `/api/projects/${p.id}/documents`,
        headers: {
          host: '127.0.0.1:3000',
          origin,
          cookie,
          'content-type': 'multipart/form-data; boundary=frame-test',
        },
        payload: Buffer.concat([
          Buffer.from(
            `--frame-test\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
          ),
          content,
          Buffer.from('\r\n--frame-test--\r\n'),
        ]),
      });
    assert.equal((await upload('private.md', Buffer.from('x'), '')).statusCode, 401);
    assert.equal((await upload('payload.exe', Buffer.from('x'))).statusCode, 400);
    assert.equal((await upload('bad.txt', Buffer.from([255, 255]))).statusCode, 400);
    assert.equal((await upload('not.pdf', Buffer.from('not a PDF'))).statusCode, 400);
    const result = await upload(
      'runbook.md',
      Buffer.from('# Runbook\n\nThe backup window is 02:00 UTC.'),
    );
    assert.equal(result.statusCode, 200, result.body);
    const source = result.json();
    assert.equal((await f.auth(`/projects/${other.id}/documents/${source.id}`)).statusCode, 404);
    assert.match((await f.auth(`/projects/${p.id}/documents/${source.id}/download`)).body, /02:00/);
    assert.equal(
      (
        await f.auth(`/projects/${p.id}/documents/${source.id}`, 'PUT', {
          text: 'Overwrite source',
          revision: source.revision,
        })
      ).statusCode,
      400,
    );
    const chat = f.store.createConversation(p.id);
    const history = [
      { type: 'session', id: 'session-test', version: 3 },
      {
        type: 'custom_message',
        id: 'attachment',
        parentId: null,
        customType: 'frame_documents',
        display: false,
        content: 'private excerpt',
        details: { documents: [{ id: source.id, name: 'runbook.md' }] },
      },
      {
        type: 'message',
        id: 'question',
        parentId: 'attachment',
        message: { role: 'user', content: 'What is the backup window?' },
      },
      {
        type: 'message',
        id: 'answer',
        parentId: 'question',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Private model reasoning' },
            { type: 'text', text: 'Backups run at 02:00 UTC.' },
          ],
        },
      },
    ];
    await writeFile(
      f.store.sessionFile(chat.id),
      history.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
    const preview = (await f.auth(`/conversations/${chat.id}/knowledge/1`)).json();
    assert.equal(preview.text, 'Backups run at 02:00 UTC.');
    assert(!JSON.stringify(preview).includes('Private model reasoning'));
    const saved = await f.auth(`/conversations/${chat.id}/knowledge/1`, 'POST', {
      ...preview,
      title: 'Backup policy',
      text: `# Backup policy\n\nBackups run at 02:00 UTC. See [runbook](/${source.id}.md).`,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const note = saved.json();
    assert.equal(f.wiki.metadata(note.id).verified, undefined, 'Saving is not verification');
    const text = '# Backup policy\n\nReview completed against the runbook.';
    const edited = await f.auth(`/projects/${p.id}/documents/${note.id}`, 'PUT', {
      text,
      revision: note.revision,
      verified: true,
    });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(f.wiki.metadata(note.id).verified[0].by, 'human:administrator');
    assert.equal(
      (
        await f.auth(`/projects/${p.id}/documents/${note.id}`, 'PUT', {
          text: 'Stale overwrite',
          revision: note.revision,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await f.auth(`/projects/${p.id}/documents/${note.id}/revisions`)).json().length,
      2,
    );
    const exportResult = await f.auth(`/projects/${p.id}/knowledge/export`);
    assert.equal(exportResult.statusCode, 200, exportResult.body.slice(0, 100));
    const files = unzipSync(exportResult.rawPayload);
    const index = strFromU8(files['wiki/index.md']!);
    assert.match(index, /okf_version: "0.2"/);
    assert.match(strFromU8(files['wiki/log.md']!), /## \d{4}-\d{2}-\d{2}/);
    for (const [filename, bytes] of Object.entries(files))
      if (filename.startsWith('wiki/') && !/\/(index|log)\.md$/.test(filename)) {
        const match = /^---\n([\s\S]*?)\n---/.exec(strFromU8(bytes));
        assert(match, filename);
        const metadata = YAML.parse(match[1]!);
        assert.equal(typeof metadata.type, 'string');
        assert(metadata.sources.every((s: any) => typeof s.resource === 'string'));
      }
    assert(Object.keys(files).some((n) => n.includes('evidence-')));
    assert(
      !Object.entries(files).some(
        ([name, bytes]) =>
          name.includes('evidence-') && strFromU8(bytes).includes('Private model reasoning'),
      ),
    );
    f.knowledge.locks.add(p.id);
    assert.equal(
      (
        await f.auth(`/projects/${p.id}/wiki`, 'POST', {
          name: 'Blocked',
          text: 'No concurrent changes',
        })
      ).statusCode,
      409,
    );
    f.knowledge.locks.delete(p.id);
    await mkdir(path.join(f.store.projectPath(other.id), 'outside'));
    await symlink(
      path.join(f.store.projectPath(other.id), 'outside'),
      path.join(f.store.projectPath(other.id), 'knowledge'),
    );
    assert.equal(
      (
        await f.auth(`/projects/${other.id}/wiki`, 'POST', {
          name: 'Escape',
          text: 'Must not write through symlink',
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.cleanup();
  }
});

test(
  'managed Python generates DOCX, rejects legacy PDFs, and extracts uploads offline',
  { skip: !process.env.FRAME_PYTHON },
  async () => {
    const f = await fixture();
    try {
      assert.equal((await f.python.status()).state, 'ready');
      const p = f.store.createProject({ name: 'Documents', instructions: '', toolsEnabled: true });
      const chat = f.store.createConversation(p.id);
      const directory = f.store.artifacts(chat);
      await mkdir(directory, { recursive: true });
      for (const format of ['docx']) {
        const value = await documentCommand(f.python.executable, {
          command: 'generate',
          directory,
          format,
          filename: `report-${format}`,
          title: 'Frame verification report',
          markdown:
            '# Findings\n\nBackup checks passed.\n\n- Review the runbook\n- Keep provenance',
        });
        assert(value.bytes > 1000);
        const bytes = await readFile(path.join(directory, value.name));
        const upload = await f.knowledge.add(p.id, value.name, bytes);
        const extracted = await f.knowledge.read(p.id, upload.id);
        assert.match(extracted.text, /Backup checks passed/);
        const download = await f.auth(`/conversations/${chat.id}/artifacts/${value.name}`);
        assert.equal(download.statusCode, 200);
        assert.deepEqual(download.rawPayload, bytes);
        await assert.rejects(
          documentCommand(f.python.executable, {
            command: 'generate',
            directory,
            format,
            filename: `report-${format}`,
            title: 'Overwrite',
            markdown: 'Must fail',
          }),
        );
        assert.deepEqual(await readFile(path.join(directory, value.name)), bytes);
      }
      await assert.rejects(
        documentCommand(f.python.executable, {
          command: 'generate',
          directory,
          format: 'pdf',
          filename: 'legacy-report',
          title: 'Old PDF',
          markdown: 'Must never publish.',
        }),
        /PDF generation is available only through the Reports plugin/,
      );
      assert(!(await readdir(directory)).some((name) => name.endsWith('.pdf')));
      await assert.rejects(
        documentCommand(f.python.executable, {
          command: 'generate',
          directory,
          format: 'docx',
          filename: '../escape',
          title: 'No',
          markdown: 'No',
        }),
      );
    } finally {
      await f.cleanup();
    }
  },
);

test(
  'SDK searches knowledge, proposes a reviewed update, and calls the Python document tool',
  { skip: !process.env.FRAME_PYTHON, timeout: 45000 },
  async () => {
    const f = await fixture();
    let calls = 0;
    let sourceId = '';
    let observed: any[] = [];
    const mock = createServer(async (req, res) => {
      let raw = '';
      for await (const part of req) raw += part;
      const request = JSON.parse(raw);
      observed.push(request);
      calls++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta: unknown, finish: string | null = null) =>
        `data: ${JSON.stringify({ id: 'knowledge-test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      const actions = [
        { name: 'search_knowledge', args: { query: 'maintenance' } },
        { name: 'read_knowledge', args: { id: sourceId } },
        {
          name: 'propose_knowledge',
          args: {
            title: 'Maintenance policy',
            text: `# Maintenance policy\n\nMaintenance starts at 02:00 UTC. [Source](/${sourceId}.md).`,
          },
        },
        {
          name: 'create_document',
          args: {
            filename: 'maintenance',
            title: 'Maintenance report',
            markdown: '# Schedule\nMaintenance starts at 02:00 UTC.',
            format: 'docx',
          },
        },
      ];
      const action = actions[calls - 1];
      res.end(
        action
          ? chunk({
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: `call_${calls}`,
                  type: 'function',
                  function: { name: action.name, arguments: JSON.stringify(action.args) },
                },
              ],
            }) +
              chunk({}, 'tool_calls') +
              'data: [DONE]\n\n'
          : chunk({
              role: 'assistant',
              content: 'Your report is ready. Review the knowledge draft to save it.',
            }) +
              chunk({}, 'stop') +
              'data: [DONE]\n\n',
      );
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    try {
      const p = f.store.createProject({
        name: 'Tool workflow',
        instructions: '',
        toolsEnabled: true,
      });
      const source = await f.knowledge.add(
        p.id,
        'maintenance.md',
        Buffer.from('Maintenance starts at 02:00 UTC.'),
      );
      sourceId = source.id;
      await f.wiki.record(p.id, source.id);
      const c = f.store.createConversation(p.id);
      f.store.saveSettings({
        ...f.store.settings(),
        modelId: 'test-model',
        baseUrl: `http://127.0.0.1:${(mock.address() as any).port}/v1`,
      });
      const started = await f.auth(`/conversations/${c.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'Read maintenance, draft a wiki note, and generate a Word document.',
        documentIds: [source.id],
      });
      assert.equal(started.statusCode, 202, started.body);
      await waitUntil(() => !f.runner.active.has(c.id));
      assert.equal(calls, 5);
      const docTool = observed[0].tools.find((t: any) => t.function.name === 'create_document');
      assert.equal(docTool.function.parameters.properties.format.const, 'docx');
      assert(JSON.stringify(observed[0].messages).includes('which is disabled for this project'));
      const snapshot = f.runner.snapshot(c.id);
      assert.equal(snapshot.error, undefined, JSON.stringify(snapshot));
      const toolMessages = snapshot.messages.filter((m) => m.role === 'tool');
      assert.equal(toolMessages.length, 4);
      assert(
        toolMessages.every((m) => !m.failed),
        JSON.stringify(toolMessages),
      );
      assert(
        observed[2].messages.some(
          (m: any) => m.role === 'tool' && String(m.content).includes('02:00 UTC'),
        ),
      );
      assert.equal(f.knowledge.list(p.id).length, 1, 'Proposal must not mutate knowledge');
      const proposalIndex = snapshot.messages.findIndex((m) => !!m.proposal);
      assert(proposalIndex >= 0);
      const preview = (await f.auth(`/conversations/${c.id}/knowledge/${proposalIndex}`)).json();
      assert.equal(preview.title, 'Maintenance policy');
      const save = await f.auth(
        `/conversations/${c.id}/knowledge/${proposalIndex}`,
        'POST',
        preview,
      );
      assert.equal(save.statusCode, 200, save.body);
      assert.equal(f.knowledge.list(p.id).length, 2);
      assert.equal(
        (await f.auth(`/conversations/${c.id}/artifacts/maintenance.docx`)).statusCode,
        200,
      );
      assert.equal(readHistory(f.store.sessionFile(c.id))[0]?.attachments?.[0]?.id, source.id);
    } finally {
      await f.cleanup();
      mock.closeAllConnections();
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  },
);

test('server restart preserves metadata/history and marks unfinished tasks interrupted', async () => {
  const f = await fixture();
  let second: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    const p = f.store.createProject({
      name: 'Persist',
      instructions: 'Saved instruction',
      toolsEnabled: false,
    });
    const c = f.store.createConversation(p.id);
    const requestId = randomUUID();
    f.store.db
      .prepare('INSERT INTO runs VALUES (?, ?, ?, NULL, ?)')
      .run(requestId, c.id, 'running', Date.now());
    await writeFile(
      f.store.sessionFile(c.id),
      JSON.stringify({ type: 'session', id: 'session-test', version: 3 }) +
        '\n' +
        JSON.stringify({
          type: 'message',
          id: 'message-test',
          parentId: null,
          message: { role: 'user', content: 'Persist this' },
        }) +
        '\n',
    );
    await f.app.close();
    second = await createApp({ dataDir: f.root, origin, setupToken: 'different-token' });
    assert.equal(second.store.project(p.id)?.instructions, 'Saved instruction');
    assert.equal(second.runner.snapshot(c.id).status, 'interrupted');
    assert.equal(second.runner.snapshot(c.id).messages[0]?.text, 'Persist this');
    assert.equal(second.runner.start(c.id, requestId, 'Do not replay').duplicate, true);
    assert.equal(second.runner.active.size, 0);
  } finally {
    if (second) await second.app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('knowledge deletion checks scope, revisions, locks, catalog cleanup, and rollback', async () => {
  const f = await fixture();
  try {
    const p = f.store.createProject({ name: 'Deletion test', instructions: '', toolsEnabled: false });
    const other = f.store.createProject({ name: 'Other', instructions: '', toolsEnabled: false });
    const create = async (name: string) => (await f.auth('/projects/' + p.id + '/wiki', 'POST', { name, text: '# Source\n\nA retained fact.' })).json();
    const doc = await create('Temporary page');
    const endpoint = '/projects/' + p.id + '/documents/' + doc.id;
    assert.equal((await f.call(endpoint, 'DELETE', { revision: doc.revision })).statusCode, 401);
    assert.equal((await f.auth('/projects/' + other.id + '/documents/' + doc.id, 'DELETE', { revision: doc.revision })).statusCode, 404);
    assert.equal((await f.auth(endpoint, 'DELETE', { revision: '0'.repeat(64) })).statusCode, 409);
    f.knowledge.locks.add(p.id);
    assert.equal((await f.auth(endpoint, 'DELETE', { revision: doc.revision })).statusCode, 409);
    f.knowledge.locks.delete(p.id);
    f.runner.active.set('test-lock', { projectId: p.id } as any);
    assert.equal((await f.auth(endpoint, 'DELETE', { revision: doc.revision })).statusCode, 409);
    f.runner.active.delete('test-lock');
    const sync = f.wiki.sync;
    f.wiki.sync = async () => { throw new Error('Simulated index write failure'); };
    assert.equal((await f.auth(endpoint, 'DELETE', { revision: doc.revision })).statusCode, 500);
    f.wiki.sync = sync;
    assert.equal((await f.auth(endpoint)).statusCode, 200, 'Failed index update must restore the source');
    assert(f.wiki.revisions(p.id, doc.id).length > 0);
    const result = await f.auth(endpoint, 'DELETE', { revision: doc.revision });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal((await f.auth(endpoint)).statusCode, 404);
    assert.equal((await f.auth(endpoint + '/download')).statusCode, 404);
    assert.equal((await f.auth(endpoint + '/revisions')).statusCode, 404);
    assert(!(await f.wiki.catalog(p.id)).some((entry) => entry.id === doc.id));
    await assert.rejects(readFile(path.join(f.knowledge.directory(doc), 'source.md')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(f.store.projectPath(p.id), 'knowledge', 'wiki', doc.id + '.md')), { code: 'ENOENT' });
    const archive = unzipSync(await f.wiki.export(p.id));
    assert(!Object.keys(archive).some((key) => key.includes(doc.id)));
    assert(!strFromU8(archive['wiki/index.md']!).includes(doc.id));
    assert(!strFromU8(archive['wiki/log.md']!).includes(doc.id));
    const upload = await f.knowledge.add(p.id, 'source.txt', Buffer.from('Uploaded source'));
    await f.wiki.record(p.id, upload.id);
    assert.equal((await f.auth('/projects/' + p.id + '/documents/' + upload.id, 'DELETE', { revision: upload.revision })).statusCode, 200);
    assert.equal(f.knowledge.list(p.id).length, 0);
  } finally {
    f.runner.active.delete('test-lock');
    f.knowledge.locks.clear();
    await f.cleanup();
  }
});

test(
  'worker crashes retain signal diagnostics and never replay an accepted request',
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      f.store.saveSettings({ ...f.store.settings(), modelId: 'crash-test-model' });
      const p = (await f.auth('/projects', 'POST', { name: 'Crash test' })).json();
      const c = (await f.auth('/conversations', 'POST', { projectId: p.id })).json();
      const requestId = randomUUID();
      const payload = { requestId, text: 'Do not replay this task' };
      assert.equal(
        (await f.auth(`/conversations/${c.id}/messages`, 'POST', payload)).statusCode,
        202,
      );
      const child = f.runner.active.get(c.id)!.process;
      child.kill('SIGKILL');
      await waitUntil(() => !f.runner.active.has(c.id));
      const snapshot = f.runner.snapshot(c.id);
      assert.equal(snapshot.status, 'interrupted');
      assert.match(snapshot.error!, /signal SIGKILL/);
      assert.equal(
        (await f.auth(`/conversations/${c.id}/messages`, 'POST', payload)).json().duplicate,
        true,
      );
      assert.equal(f.runner.active.has(c.id), false);
    } finally {
      await f.cleanup();
    }
  },
);

test(
  'large SDK responses and follow-up history finish without false interruption',
  { timeout: 60000 },
  async () => {
    const answer = 'A completed local answer. '.repeat(12000);
    let calls = 0;
    const mock = createServer(async (req, res) => {
      for await (const _ of req) {
        /* Consume the request. */
      }
      calls++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        `data: ${JSON.stringify({ id: 'large-answer', object: 'chat.completion.chunk', created: 1, model: 'large-model', choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'large-answer', object: 'chat.completion.chunk', created: 1, model: 'large-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
      );
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const f = await fixture();
    try {
      f.store.saveSettings({
        ...f.store.settings(),
        baseUrl: `http://127.0.0.1:${(mock.address() as { port: number }).port}/v1`,
        modelId: 'large-model',
        contextWindow: 262144,
        autoCompaction: false,
      });
      const p = (await f.auth('/projects', 'POST', { name: 'Large history' })).json();
      const c = (await f.auth('/conversations', 'POST', { projectId: p.id })).json();
      for (const text of ['First answer', 'Follow up']) {
        assert.equal(
          (
            await f.auth(`/conversations/${c.id}/messages`, 'POST', {
              requestId: randomUUID(),
              text,
            })
          ).statusCode,
          202,
        );
        await waitUntil(() => !f.runner.active.has(c.id));
        const snapshot = f.runner.snapshot(c.id);
        assert.equal(snapshot.status, 'completed', snapshot.error);
        assert.equal(snapshot.error, undefined);
        assert.equal(snapshot.messages.at(-1)?.text, answer.slice(0, 100_000));
      }
      assert.equal(calls, 2);
    } finally {
      await f.cleanup();
      mock.closeAllConnections();
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  },
);
