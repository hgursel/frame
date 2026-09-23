import type { WorkerOutput } from '../shared/types.js';

/** Wait for queued IPC writes before the worker disconnects. */
export function flushWorkerMessage(message: WorkerOutput): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.connected || !process.send) {
      reject(new Error('Worker IPC channel is disconnected'));
      return;
    }
    process.send(message, (error) => (error ? reject(error) : resolve()));
  });
}
