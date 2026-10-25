import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { appFixture, apiRoutes, waitUntil } from './helpers.js';
import { Store } from '../server/store.js';
import { hashPassword } from '../server/security.js';
import { ModelCapacity } from '../server/model-capacity.js';
import { sandboxExec, sandboxArgs } from '../server/sandbox.js';
const password = 'temporary-password-12345';
async function user(f: Awaited<ReturnType<typeof appFixture>>, username: string, role = 'user') {
  const created = await f.auth('/admin/users', 'POST', { username, password, role });
  assert.equal(created.statusCode, 200, created.body);
  const login = await f.call('/auth/login', 'POST', { username, password });
  const cookie = String(login.headers['set-cookie']).split(';')[0]!;
  const call = (url: string, method = 'GET', body?: unknown) => f.call(url, method, body, cookie);
  assert.equal((await call('/projects')).statusCode, 403);
  assert.equal(
    (
      await call('/auth/password', 'POST', {
        currentPassword: password,
        password: 'changed-password-12345',
      })
    ).statusCode,
    200,
  );
  return { id: created.json().id, call, cookie };
}
test('personal workspaces deny every cross-owner project/chat route, including administrators and Excel', async () => {
  const f = await appFixture('owners');
  await f.signIn();
  try {
    const alice = await user(f, 'alice');
    const bob = await user(f, 'bob');
    const p = (await alice.call('/projects', 'POST', { name: 'Alice private' })).json();
    const c = (await alice.call('/conversations', 'POST', { projectId: p.id })).json();
    assert.equal(
      (
        await alice.call(`/projects/${p.id}`, 'PUT', {
          name: 'Edited',
          instructions: 'private',
          toolsEnabled: true,
        })
      ).statusCode,
      200,
    );
    assert.deepEqual(
      (await bob.call('/projects')).json().map((p: any) => p.name),
      ['Arena'],
    );
    assert.deepEqual(
      (await f.auth('/projects')).json().map((p: any) => p.name),
      ['Arena'],
    );
    assert.deepEqual((await bob.call('/conversations')).json(), []);
    for (const route of apiRoutes(f.app)) {
      if (!/^\/api\/(projects\/|conversations\/|excel\/sessions\/)/.test(route.url)) continue;
      const id = route.url.startsWith('/api/projects/') ? p.id : c.id;
      const url = route.url.replace('00000000-0000-4000-8000-000000000000', id).slice(4);
      for (const call of [bob.call, f.auth]) {
        const response = await call(url, route.method, route.method === 'GET' ? undefined : {});
        assert.equal(response.statusCode, 404, `${route.method} ${url}: ${response.body}`);
      }
    }
    assert.equal((await bob.call('/conversations', 'POST', { projectId: p.id })).statusCode, 404);
    assert.equal((await bob.call('/excel/sessions', 'POST', { projectId: p.id })).statusCode, 404);
    for (const [url, method] of [
      ['/settings', 'PUT'],
      ['/settings/test', 'POST'],
      ['/admin/users', 'GET'],
      ['/skills', 'PUT'],
      ['/plugins/mssql', 'GET'],
      ['/plugins/charts', 'PUT'],
      ['/document-tools/install', 'POST'],
      ['/excel/config', 'PUT'],
      ['/library/import', 'POST'],
      ['/maintenance', 'GET'],
    ]) {
      assert.equal(
        (await alice.call(url!, method!, method === 'GET' ? undefined : {})).statusCode,
        403,
        url,
      );
    }
    assert.equal(
      (await alice.call(`/projects/${p.id}/plugins`, 'PUT', { charts: true })).statusCode,
      200,
    );
    assert.equal(
      (await alice.call(`/projects/${p.id}/skills`, 'PUT', { enabled: [] })).statusCode,
      403,
    );
    assert.equal(
      (
        await alice.call(`/projects/${p.id}/wiki`, 'POST', {
          name: 'Personal notes',
          text: '# Mine',
        })
      ).statusCode,
      200,
    );
    assert.equal((await alice.call('/settings')).json().baseUrl, '');
    assert.equal(
      (await f.auth(`/admin/users/${bob.id}`, 'PATCH', { disabled: true })).statusCode,
      200,
    );
    assert.equal((await bob.call('/projects')).statusCode, 401);
    assert.equal((await alice.call('/projects')).statusCode, 200);
    await f.auth(`/admin/users/${alice.id}`, 'PATCH', { password });
    assert.equal((await alice.call('/projects')).statusCode, 401);
  } finally {
    await f.cleanup();
  }
});
test('legacy password and content migrate once to admin; old sessions are revoked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-migration-'));
  try {
    const db = new DatabaseSync(path.join(root, 'frame.db'));
    db.exec(
      'CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,instructions TEXT NOT NULL,toolsEnabled INTEGER NOT NULL); CREATE TABLE logins(token TEXT PRIMARY KEY,expires INTEGER NOT NULL)',
    );
    db.prepare('INSERT INTO meta VALUES (?,?)').run('password', hashPassword(password));
    const id = randomUUID();
    db.prepare('INSERT INTO projects VALUES (?,?,?,?)').run(id, 'Legacy', 'Keep me', 0);
    db.prepare('INSERT INTO logins VALUES (?,?)').run('old-session', Date.now() + 100000);
    db.close();
    let store = new Store(root);
    const admin = store.db.prepare('SELECT * FROM users').get() as any;
    assert.equal(admin.username, 'admin');
    assert(store.ownsProject(admin.id, id));
    assert.equal(store.meta('password'), undefined);
    assert.equal((store.db.prepare('SELECT count(*) n FROM logins').get() as any).n, 0);
    store.close();
    store = new Store(root);
    assert.equal((store.db.prepare('SELECT count(*) n FROM users').get() as any).n, 1);
    assert.equal(store.project(id)?.instructions, 'Keep me');
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('capacity is FIFO, cancellable, and releases slots without a per-user limit', async () => {
  const gate = new ModelCapacity(() => 1);
  const a = new AbortController(),
    b = new AbortController(),
    c = new AbortController();
  await gate.acquire('a', a.signal);
  let entered = false;
  const second = gate.acquire('b', b.signal);
  const rejected = assert.rejects(second, /stopped/);
  const third = gate.acquire('c', c.signal).then(() => {
    entered = true;
  });
  b.abort();
  await rejected;
  assert.equal(entered, false);
  gate.release('a');
  await third;
  assert(entered);
  gate.release('c');
});
test(
  'same-project conversations queue independently; logout and cancellation do not stop other runs',
  { timeout: 45000 },
  async () => {
    const pending: any[] = [];
    const paths: string[] = [];
    const model = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      paths.push(req.url!);
      pending.push({ res, body: JSON.parse(body) });
    });
    await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
    const f = await appFixture('concurrent');
    await f.signIn();
    const finish = (index: number) => {
      const res = pending[index].res;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(
        'data: ' +
          JSON.stringify({
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: 'Finished independently.' },
                finish_reason: 'stop',
              },
            ],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    };
    try {
      f.store.saveSettings({
        ...f.store.settings(),
        baseUrl: `http://127.0.0.1:${(model.address() as any).port}/compatible/api`,
        modelId: 'engine-independent',
        maxConcurrentRequests: 1,
      });
      const p = f.store.createProject({ name: 'Parallel', instructions: '', toolsEnabled: false });
      const chats = [0, 1, 2].map(() => f.store.createConversation(p.id));
      for (const c of chats)
        assert.equal(
          (
            await f.auth(`/conversations/${c.id}/messages`, 'POST', {
              requestId: randomUUID(),
              text: 'Do work',
            })
          ).statusCode,
          202,
        );
      await waitUntil(() => pending.length === 1);
      const running = chats.find((c) => f.runner.snapshot(c.id).status === 'Waiting for model')!;
      await waitUntil(
        () =>
          chats.filter((c) => f.runner.snapshot(c.id).status === 'Queued for model').length === 2,
      );
      const queued = chats.filter((c) => c.id !== running.id);
      assert.equal(
        (
          await f.auth(`/conversations/${running.id}/messages`, 'POST', {
            requestId: randomUUID(),
            text: 'Duplicate concurrent',
          })
        ).statusCode,
        409,
      );
      await f.auth(`/conversations/${queued[0]!.id}/stop`, 'POST', {});
      await waitUntil(() => !f.runner.active.has(queued[0]!.id));
      await f.auth('/auth/logout', 'POST', {});
      assert(f.runner.active.has(running.id));
      finish(0);
      await waitUntil(() => pending.length === 2);
      finish(1);
      await waitUntil(() => f.runner.active.size === 0);
      assert.equal(f.runner.snapshot(running.id).status, 'completed');
      assert.equal(f.runner.snapshot(queued[1]!.id).status, 'completed');
      assert.equal(f.runner.snapshot(queued[0]!.id).status, 'stopped');
      assert.deepEqual(paths, [
        '/compatible/api/chat/completions',
        '/compatible/api/chat/completions',
      ]);
      const login = await f.call('/auth/login', 'POST', { password: 'test-password-12345' });
      const cookie = String(login.headers['set-cookie']).split(';')[0]!;
      assert(
        (await f.call(`/conversations/${running.id}`, 'GET', undefined, cookie)).body.includes(
          'Finished independently',
        ),
      );
    } finally {
      await f.cleanup();
      model.closeAllConnections();
      await new Promise<void>((resolve) => model.close(() => resolve()));
    }
  },
);
test('isolated file tools cannot read other conversations or credentials, including symlink escapes', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-isolation-'));
  try {
    const work = path.join(root, 'work'),
      knowledge = path.join(root, 'knowledge');
    await mkdir(work);
    await mkdir(knowledge);
    await writeFile(path.join(root, 'secret'), 'PRIVATE');
    await writeFile(path.join(knowledge, 'reference'), 'REFERENCE');
    const config = { writable: work, readonly: [knowledge] };
    try {
      await sandboxExec(config, 'true', undefined, 3);
    } catch (e) {
      if (
        /Operation not permitted|No permissions|user namespace|Isolated tools unavailable|timed out/.test(
          String(e),
        )
      ) {
        t.skip('This host does not permit nested user namespaces; isolated tools fail closed.');
        return;
      }
      throw e;
    }
    assert.equal((await sandboxExec(config, `cat '${knowledge}/reference'`)).trim(), 'REFERENCE');
    await assert.rejects(sandboxExec(config, `cat '${root}/secret'`));
    await assert.rejects(sandboxExec(config, `echo changed > '${knowledge}/reference'`));
    await sandboxExec(config, `ln -s '${root}/secret' escape`);
    await assert.rejects(sandboxExec(config, 'cat escape'));
    await sandboxExec(config, 'echo result > output.txt');
    assert.match(await readFile(path.join(work, 'output.txt'), 'utf8'), /result/);
    await assert.rejects(sandboxExec(config, 'cat /proc/1/root' + root + '/secret'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sandbox mount plan masks private roots before exposing only designated references and outputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-mounts-'));
  try {
    const work = path.join(root, 'outputs'),
      knowledge = path.join(root, 'knowledge');
    await mkdir(work);
    await mkdir(knowledge);
    const args = sandboxArgs({ writable: work, readonly: [knowledge], hidden: [root] }, 'true');
    const hidden = args.findIndex((v, i) => v === '--tmpfs' && args[i + 1] === root);
    const bind = args.findIndex((v, i) => v === '--bind' && args[i + 1] === work);
    assert(hidden >= 0 && bind > hidden);
    assert(!args.some((v, i) => v === '--ro-bind' && args[i + 1] === root));
    assert.throws(
      () => sandboxArgs({ writable: work, readonly: [root] }, 'true'),
      /must not contain/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('background knowledge generation shares the foreground capacity budget', async () => {
  let calls = 0;
  const f = await appFixture('background-capacity', {
    generator: {
      async complete() {
        calls++;
        return 'generated';
      },
    },
  });
  try {
    f.store.saveSettings({ ...f.store.settings(), maxConcurrentRequests: 1 });
    const signal = new AbortController().signal;
    await f.runner.capacity.acquire('foreground', signal);
    const pending = f.mssql.notes.generator.complete(
      { system: 'test', prompt: 'test', maxTokens: 128 },
      signal,
    );
    await Promise.resolve();
    assert.equal(calls, 0);
    f.runner.capacity.release('foreground');
    assert.equal(await pending, 'generated');
    assert.equal(calls, 1);
    await f.runner.capacity.acquire('next', signal);
    f.runner.capacity.release('next');
  } finally {
    await f.cleanup();
  }
});
