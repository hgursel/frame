import { invoke } from './plugin-rpc.js';
/** Preserve streaming/backpressure and release capacity on EOF, cancellation, or failure. */
export function modelTransport(
  transport: typeof fetch,
  endpoint: string,
  abort: AbortSignal,
): typeof fetch {
  return async (request, init) => {
    const url = new URL(request instanceof Request ? request.url : String(request));
    const base = new URL(endpoint);
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')
    )
      throw new Error('Only the configured model endpoint is allowed');
    const source = init?.signal ?? (request instanceof Request ? request.signal : undefined);
    const signal = AbortSignal.any([abort, ...(source ? [source] : [])]);
    try {
      await invoke('model_acquire', {}, signal);
    } catch (error) {
      await invoke('model_release', {}).catch(() => {});
      throw error;
    }
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        void invoke('model_release', {}).catch(() => {});
      }
    };
    signal.addEventListener('abort', release, { once: true });
    const finish = () => {
      signal.removeEventListener('abort', release);
      release();
    };
    try {
      const response = await transport(request, { ...init, signal, redirect: 'error' });
      if (!response.body) {
        finish();
        return response;
      }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              finish();
              controller.close();
            } else controller.enqueue(part.value);
          } catch (error) {
            finish();
            controller.error(error);
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            finish();
          }
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      finish();
      throw error;
    }
  };
}
