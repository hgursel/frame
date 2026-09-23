import { randomUUID } from 'node:crypto';
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
process.on('message', (message: any) => {
  if (message?.type !== 'plugin_result') return;
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id);
  if (message.error) call.reject(new Error(message.error));
  else call.resolve(message.result);
});
export async function invoke(action: string, args: unknown, signal?: AbortSignal) {
  const id = randomUUID();
  return new Promise<any>((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      reject(new Error('Plugin tool cancelled'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    const finish = () => signal?.removeEventListener('abort', abort);
    pending.set(id, {
      resolve: (v) => {
        finish();
        resolve(v);
      },
      reject: (e) => {
        finish();
        reject(e);
      },
    });
    process.send?.({ type: 'plugin_call', id, action, args }, (error) => {
      if (error) {
        pending.delete(id);
        finish();
        reject(new Error('Plugin service unavailable'));
      }
    });
  });
}
