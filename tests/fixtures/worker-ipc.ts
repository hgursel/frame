import { flushWorkerMessage } from '../../server/worker-ipc.js';
import type { WorkerOutput } from '../../shared/types.js';

process.once('message', async (size: number) => {
  const snapshot = { type: 'snapshot', messages: [{ text: 'x'.repeat(size) }] } as WorkerOutput;
  await flushWorkerMessage(snapshot);
  process.send!(snapshot);
  process.send!(snapshot);
  await flushWorkerMessage({ type: 'done' });
  process.disconnect();
});
