import test from 'node:test';
import assert from 'node:assert/strict';
import { listenConfig } from '../server/listen-config.js';
import { requestId } from '../web/browser-compat.js';

test('LAN listening is explicit and validates the browser origin', () => {
  assert.deepEqual(listenConfig({}), {
    host: '127.0.0.1',
    port: 3000,
    origin: 'http://127.0.0.1:3000',
    httpLan: false,
  });
  const lan = {
    FRAME_HOST: '0.0.0.0',
    FRAME_ORIGIN: 'http://192.168.1.50:3000',
    FRAME_ALLOW_HTTP_LAN: 'true',
  };
  assert.equal(listenConfig(lan).httpLan, true);
  assert.equal(listenConfig({ ...lan, FRAME_HOST: '192.168.1.50' }).host, '192.168.1.50');
  assert.throws(() => listenConfig({ FRAME_HOST: '0.0.0.0' }), /FRAME_ORIGIN/);
  assert.throws(() => listenConfig({ ...lan, FRAME_ALLOW_HTTP_LAN: 'false' }), /HTTPS/);
  for (const origin of [
    'http://8.8.8.8:3000',
    'http://frame.example:3000',
    'http://0.0.0.0:3000',
    'http://localhost:3000',
    'ftp://192.168.1.50',
    'http://user:pass@192.168.1.50',
    'http://192.168.1.50/path',
    'http://192.168.1.50?x=1',
  ])
    assert.throws(() => listenConfig({ ...lan, FRAME_ORIGIN: origin }));
  assert.throws(() => listenConfig({ ...lan, FRAME_HOST: '8.8.8.8' }));
  assert.throws(() => listenConfig({ FRAME_PORT: '70000' }));
  assert.equal(listenConfig({ FRAME_ORIGIN: 'https://frame.example.internal' }).httpLan, false);
  assert.equal(listenConfig({ FRAME_HOST: '::1' }).origin, 'http://[::1]:3000');
});

test('LAN browsers generate valid unique request IDs without crypto.randomUUID', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!;
  const source = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: source.getRandomValues.bind(source) },
  });
  try {
    const ids = Array.from({ length: 100 }, () => requestId());
    assert.equal(new Set(ids).size, 100);
    for (const id of ids)
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', original);
  }
});
