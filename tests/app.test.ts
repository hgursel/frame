import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, get } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { readHistory } from '../server/history.js';

const origin = 'http://127.0.0.1:3000';
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
      f.runner.on(c.id, () => {
        if (
          f.runner.snapshot(c.id).running &&
          f.runner.snapshot(c.id).messages.some((m) => m.text.includes('Hello from'))
        )
          sawStream = true;
      });
      await waitUntil(() => !f.runner.active.has(c.id));
      const snapshot = f.runner.snapshot(c.id);
      assert.equal(snapshot.error, undefined, JSON.stringify(snapshot));
      assert.equal(snapshot.status, 'completed');
      assert.equal(requests.length, 1);
      assert(sawStream);
      assert(
        snapshot.messages.some(
          (m) => m.role === 'assistant' && m.text.includes('local test model'),
        ),
      );
      assert.equal(requests[0].model, 'frame-test-model');
      assert(!requests[0].tools?.length);
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
      f.runner.start(stopChat.id, randomUUID(), 'Keep going');
      await waitUntil(() => requested);
      f.runner.stop(stopChat.id);
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
