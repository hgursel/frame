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
    assert(received.max_tokens <= 512);
    assert(
      Buffer.byteLength(received.messages.map((m: any) => m.content).join('')) +
        received.max_tokens +
        400 <=
        2048,
    );
    assert.match(received.messages[1].content, /Reply with JSON/);
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
