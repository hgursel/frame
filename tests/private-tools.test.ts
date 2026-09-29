import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, chmod, symlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { appFixture, waitUntil } from './helpers.js';
import type { PrivateTool } from '../shared/private-tools.js';

async function fixture() {
  const f = await appFixture('private-tools');
  await f.signIn();
  const project = f.store.createProject({
    name: 'Private integration',
    instructions: '',
    toolsEnabled: false,
  });
  const chat = f.store.createConversation(project.id);
  const script = path.join(f.root, 'wrapper.cjs');
  const envFile = path.join(f.root, 'private.env');
  await writeFile(envFile, 'API_TOKEN=local-test-secret\nAPI_LITERAL="$(touch not-executed)"\n', {
    mode: 0o600,
  });
  await writeFile(
    script,
    `let text=''; process.stdin.on('data', b=>text+=b); process.stdin.on('end',()=>console.log(JSON.stringify({input:JSON.parse(text), fixed:process.argv.slice(2), token:process.env.API_TOKEN, inherited:process.env.FRAME_TEST_PRIVATE_SENTINEL || null, literal:process.env.API_LITERAL})));`,
  );
  const tool: PrivateTool = {
    id: 'echo',
    name: 'Echo request',
    description: 'Return the supplied text.',
    parameters: [{ name: 'text', type: 'string', description: 'Text to return', required: true }],
    executable: process.execPath,
    args: [script, 'fixed;not-a-command'],
    envFile,
    approval: 'automatic',
    timeoutSeconds: 5,
    maxOutputBytes: 4096,
  };
  const save = (changes: Partial<PrivateTool> = {}) =>
    f.privateTools.save({
      enabled: true,
      instructions: 'Private local usage guidance.',
      tools: [{ ...tool, ...changes }],
    });
  save();
  f.privateTools.setProject(project.id, true);
  const invoke = (signal = new AbortController().signal, input: unknown = { text: 'hello' }) =>
    f.privateTools.invoke(chat.id, 'test-run', { id: tool.id, input }, signal);
  return { ...f, project, chat, script, envFile, tool, save, invoke };
}

test('private tools validate inputs, keep credentials out of settings/context, and execute literal stdin without shell expansion', async () => {
  const f = await fixture();
  process.env.FRAME_TEST_PRIVATE_SENTINEL = 'not-for-script';
  try {
    assert.equal((await f.call('/plugins/private-tools')).statusCode, 401);
    const settings = await f.auth('/plugins/private-tools');
    assert(!settings.body.includes('local-test-secret'));
    const context = JSON.stringify(f.privateTools.context(f.project.id));
    assert(
      !context.includes(f.script) &&
        !context.includes(f.envFile) &&
        !context.includes('local-test-secret'),
    );
    assert(context.includes('Echo request'));
    const output = JSON.parse(
      (await f.invoke(undefined, { text: '$(touch /tmp/never-frame); a "quote"' })).output,
    );
    assert.equal(output.input.text, '$(touch /tmp/never-frame); a "quote"');
    assert.deepEqual(output.fixed, ['fixed;not-a-command']);
    assert.equal(output.token, '[REDACTED]');
    assert.equal(output.literal, '[REDACTED]');
    assert.equal(output.inherited, null);
    await assert.rejects(f.invoke(undefined, { text: 10 }));
    await assert.rejects(f.invoke(undefined, { text: 'ok', extra: 'no' }));
    await assert.rejects(f.invoke(undefined, {}));
    f.privateTools.setProject(f.project.id, false);
    await assert.rejects(f.invoke(), /disabled/);
    assert.equal(f.privateTools.context(f.project.id), undefined);
    const duplicate = { ...f.privateTools.settings(), tools: [f.tool, f.tool] };
    assert.equal((await f.auth('/plugins/private-tools', 'PUT', duplicate)).statusCode, 400);
    assert.equal(
      (
        await f.auth('/projects/' + f.project.id + '/plugins', 'PUT', {
          charts: true,
          privateTools: true,
        })
      ).statusCode,
      200,
    );
    assert.equal(f.charts.projectEnabled(f.project.id), true);
    assert.equal(f.privateTools.projectEnabled(f.project.id), true);
    await chmod(f.envFile, 0o644);
    await assert.rejects(f.invoke(), /environment file/);
    await chmod(f.envFile, 0o600);
    await writeFile(f.envFile, 'NODE_OPTIONS=--inspect\n');
    await assert.rejects(f.invoke(), /environment file/);
    const link = path.join(f.root, 'linked.env');
    await symlink(f.envFile, link);
    f.save({ envFile: link });
    await assert.rejects(f.invoke(), /environment file/);
  } finally {
    delete process.env.FRAME_TEST_PRIVATE_SENTINEL;
    await f.cleanup();
  }
});

test('private approvals are exact, consumed once, and cancellation/denial never launches the script', async () => {
  const f = await fixture();
  try {
    const marker = path.join(f.root, 'executions');
    await writeFile(
      f.script,
      `require('fs').appendFileSync(${JSON.stringify(marker)},'x'); console.log('Done');`,
    );
    f.save({ approval: 'always' });
    const task = f.invoke();
    await waitUntil(() => !!f.privateTools.approvals(f.chat.id).length);
    const approval = f.privateTools.approvals(f.chat.id)[0]!;
    assert.deepEqual(approval.input, { text: 'hello' });
    assert.throws(
      () => f.privateTools.decide(randomUUID(), approval.id, 'test-run', true),
      /expired/,
    );
    assert.throws(
      () => f.privateTools.decide(f.chat.id, approval.id, 'wrong-run', true),
      /expired/,
    );
    f.privateTools.decide(f.chat.id, approval.id, 'test-run', true);
    assert.throws(() => f.privateTools.decide(f.chat.id, approval.id, 'test-run', true), /expired/);
    assert.match((await task).output, /Done/);
    assert.equal(await readFile(marker, 'utf8'), 'x');
    const denied = assert.rejects(f.invoke(), /denied/);
    const next = f.privateTools.approvals(f.chat.id)[0]!;
    f.privateTools.decide(f.chat.id, next.id, 'test-run', false);
    await denied;
    const controller = new AbortController();
    const cancelled = assert.rejects(f.invoke(controller.signal), /cancelled/);
    controller.abort();
    await cancelled;
    assert.equal(f.privateTools.approvals(f.chat.id).length, 0);
    assert.equal(await readFile(marker, 'utf8'), 'x');
  } finally {
    await f.cleanup();
  }
});

test('private tool failures, output limits, timeouts and Stop return no stderr or partial secrets', async () => {
  const f = await fixture();
  try {
    await writeFile(f.script, "console.error('local-test-secret'); process.exit(4);");
    await assert.rejects(f.invoke(), /exited unsuccessfully/);
    await writeFile(f.script, "console.log('x'.repeat(10000)); setInterval(()=>{},1000);");
    await assert.rejects(f.invoke(), /output limit/);
    f.save({ timeoutSeconds: 1 });
    await writeFile(f.script, 'setInterval(()=>{},1000);');
    await assert.rejects(f.invoke(), /timed out/);
    const controller = new AbortController();
    const stopped = assert.rejects(f.invoke(controller.signal), /stopped/);
    setTimeout(() => controller.abort(), 150);
    await stopped;
  } finally {
    await f.cleanup();
  }
});

test(
  'real SDK exposes only enabled private tools, waits for API approval, and persists redacted output',
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const requests: any[] = [];
    const model = createServer(async (req, res) => {
      let raw = '';
      for await (const b of req) raw += b;
      const body = JSON.parse(raw);
      requests.push(body);
      const tool = body.tools?.some((t: any) => t.function.name === 'private_echo');
      const call = tool && body.messages.at(-1)?.role !== 'tool';
      const delta = call
        ? {
            tool_calls: [
              {
                index: 0,
                id: 'private-call',
                type: 'function',
                function: { name: 'private_echo', arguments: '{"text":"hello"}' },
              },
            ],
          }
        : { content: 'Finished local operation.' };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        `data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
      );
    });
    try {
      await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
      f.store.saveSettings({
        ...f.store.settings(),
        modelId: 'test',
        baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      });
      f.save({ approval: 'always' });
      const runId = randomUUID();
      assert.equal(
        (
          await f.auth(`/conversations/${f.chat.id}/messages`, 'POST', {
            requestId: runId,
            text: 'Use echo.',
          })
        ).statusCode,
        202,
      );
      await waitUntil(() => !!f.privateTools.approvals(f.chat.id).length);
      const approval = f.runner.snapshot(f.chat.id).privateApprovals![0]!;
      assert.equal(f.runner.snapshot(f.chat.id).status, 'Awaiting tool approval');
      assert.equal(
        (await f.auth('/plugins/private-tools', 'PUT', f.privateTools.settings())).statusCode,
        409,
      );
      assert.equal(
        (
          await f.auth(
            `/conversations/${f.chat.id}/private-tool-approvals/${approval.id}`,
            'POST',
            { runId, approve: true },
          )
        ).statusCode,
        200,
      );
      await waitUntil(() => !f.runner.active.has(f.chat.id));
      assert.equal(f.runner.snapshot(f.chat.id).status, 'completed');
      assert.equal(requests.length, 2);
      const prompts = JSON.stringify(requests);
      assert(
        !prompts.includes('local-test-secret') &&
          !prompts.includes(f.envFile) &&
          !prompts.includes(f.script),
      );
      assert(prompts.includes('[REDACTED]'));
      assert(!requests[0].tools.some((t: any) => t.function.name === 'bash'));
      assert(
        !(await readFile(f.store.sessionFile(f.chat.id), 'utf8')).includes('local-test-secret'),
      );
      assert.equal(
        (
          await f.auth(
            `/conversations/${f.chat.id}/private-tool-approvals/${approval.id}`,
            'POST',
            { runId, approve: true },
          )
        ).statusCode,
        409,
      );
      f.privateTools.setProject(f.project.id, false);
      const fresh = f.store.createConversation(f.project.id);
      await f.auth(`/conversations/${fresh.id}/messages`, 'POST', {
        requestId: randomUUID(),
        text: 'Hello',
      });
      await waitUntil(() => !f.runner.active.has(fresh.id));
      assert(!requests.at(-1).tools.some((t: any) => t.function.name.startsWith('private_')));
    } finally {
      await f.cleanup();
      model.closeAllConnections();
      await new Promise<void>((r) => model.close(() => r()));
    }
  },
);
