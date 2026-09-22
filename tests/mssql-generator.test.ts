import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { LocalGenerator } from '../server/plugins/mssql/generate.js';
import { defaults } from '../server/store.js';

test('Local knowledge generator bounds context and responses, rejects redirects, and honors cancellation', async () => {
  let mode = 'ok';
  let received: any;
  let activeClosed = false;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    received = JSON.parse(raw);
    if (mode === 'hang') {
      res.on('close', () => {
        activeClosed = true;
      });
      return;
    }
    if (mode === 'redirect') {
      res.writeHead(302, { location: 'http://example.com/' });
      res.end();
      return;
    }
    if (mode === 'large') {
      res.end('x'.repeat(1_000_001));
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: mode === 'length' ? 'length' : 'stop',
            message: { content: '{"purpose":"Catalog note"}' },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const settings = {
    ...defaults,
    modelId: 'small-local',
    contextWindow: 2048,
    maxTokens: 1024,
    baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
  };
  const generator = new LocalGenerator(() => settings);
  const request = {
    system: 'Use catalog facts.',
    prompt: 'Tables: ' + 'açıklama '.repeat(2000) + ' Reply with JSON.',
    maxTokens: 900,
  };
  try {
    assert.match(await generator.complete(request, new AbortController().signal), /Catalog note/);
    assert(received.max_tokens <= 1024);
    assert(
      Buffer.byteLength(received.messages.map((m: any) => m.content).join('')) +
        received.max_tokens +
        400 <=
        2048,
    );
    assert.match(received.messages[1].content, /Reply with JSON/);
    const shape =
      'Reply with exactly this JSON shape:\n{"purpose":"short note","columnNotes":{}}\nUse exact shown column names only.';
    await generator.complete(
      { ...request, prompt: 'Dev.dbo.WideTable\n' + 'column '.repeat(5000) + '\n' + shape },
      new AbortController().signal,
    );
    assert(received.messages[1].content.endsWith(shape));
    assert.match(received.messages[1].content, /^Dev.dbo.WideTable/);
    mode = 'large';
    await assert.rejects(generator.complete(request, new AbortController().signal), /size limit/);
    mode = 'length';
    await assert.rejects(generator.complete(request, new AbortController().signal), /output limit/);
    mode = 'redirect';
    await assert.rejects(generator.complete(request, new AbortController().signal));
    mode = 'hang';
    await assert.rejects(generator.complete(request, AbortSignal.timeout(50)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert(activeClosed);
    settings.baseUrl = 'https://example.com/v1';
    await assert.rejects(
      generator.complete(request, new AbortController().signal),
      /local|private|loopback/i,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Knowledge generation retries only the current item for output/context limits with fresh bounded messages', async () => {
  let mode = 'reasoning';
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requests.push(body);
    if (mode === 'context' || mode === 'context-fail') {
      if (mode === 'context-fail' || requests.length === 1) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              type: 'exceed_context_size_error',
              message: 'request exceeds available context size',
            },
          }),
        );
        return;
      }
    }
    if (mode === 'unauthorized') {
      res.writeHead(401);
      res.end('{}');
      return;
    }
    const truncated = mode === 'reasoning' && body.max_tokens < 4096;
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: truncated ? 'length' : 'stop',
            message: truncated
              ? { content: '', reasoning_content: 'thinking...' }
              : { content: '{"purpose":"A complete note"}' },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const settings = {
    ...defaults,
    modelId: 'reasoning-local',
    baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
  };
  const generator = new LocalGenerator(() => settings);
  const request = {
    system: 'Return a short JSON note.',
    prompt: 'Dev.dbo.Table1\n' + 'açıklama '.repeat(3000) + '\nReply with JSON.',
    maxTokens: 700,
  };
  try {
    assert.match(await generator.complete(request, new AbortController().signal), /complete note/);
    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.map((r) => r.max_tokens),
      [1024, 4096],
    );
    for (const r of requests) {
      assert.equal(r.messages.length, 2);
      assert.equal(r.response_format.type, 'json_object');
      assert.equal(r.chat_template_kwargs.enable_thinking, false);
      assert.equal(r.reasoning_effort, 'none');
      assert(Buffer.byteLength(r.messages[1].content) <= 8192);
      assert.match(r.messages[1].content, /^Dev.dbo.Table1/);
      assert.match(r.messages[1].content, /Reply with JSON\.$/);
      assert(!r.messages[1].content.includes('\ufffd'));
    }
    requests.length = 0;
    mode = 'context';
    await generator.complete(request, new AbortController().signal);
    assert.equal(requests.length, 2);
    assert(
      Buffer.byteLength(requests[1].messages[1].content) <=
        Buffer.byteLength(requests[0].messages[1].content) / 2,
    );
    assert(requests[1].max_tokens < requests[0].max_tokens);
    requests.length = 0;
    mode = 'context-fail';
    await assert.rejects(
      generator.complete(request, new AbortController().signal),
      /single-item request.*context/,
    );
    assert.equal(requests.length, 3);
    requests.length = 0;
    mode = 'unauthorized';
    await assert.rejects(generator.complete(request, new AbortController().signal), /401/);
    assert.equal(requests.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
