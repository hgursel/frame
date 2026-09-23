import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { flushWorkerMessage } from '../server/worker-ipc.js';
import type { WorkerOutput } from '../shared/types.js';

for (const size of [10_000, 250_000, 500_000]) {
  test(
    `worker drains ${size}-byte snapshots before disconnecting`,
    { timeout: 15000 },
    async (t) => {
      const child = fork(new URL('./fixtures/worker-ipc.ts', import.meta.url), [], {
        execArgv: ['--import', import.meta.resolve('tsx')],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      t.after(() => child.kill());
      const messages: string[] = [];
      child.on('message', (event: WorkerOutput) => {
        messages.push(event.type);
        if (event.type === 'snapshot') {
          assert.equal(event.messages[0].text.length, size);
          // Simulate a busy server consuming a large conversation snapshot.
          const until = performance.now() + 30;
          while (performance.now() < until) {}
        }
      });
      const closed = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
          try {
            assert.equal(code, 0);
            assert.equal(signal, null);
            assert.deepEqual(messages, ['snapshot', 'snapshot', 'snapshot', 'done']);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      child.send(size);
      await closed;
    },
  );
}

test('terminal delivery rejects a disconnected channel', async () => {
  await assert.rejects(flushWorkerMessage({ type: 'done' }), /disconnected/);
});
