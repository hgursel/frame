import { randomUUID } from 'node:crypto';
import type { WorkbookRequest } from '../../shared/excel-workbook.js';

/** Read-only requests to the originating authenticated task pane. Never executes edits. */
export class WorkbookBridge {
  private pending = new Map<
    string,
    { request: WorkbookRequest; resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  peek(conversationId: string) {
    const p = this.pending.get(conversationId);
    return p && { id: p.request.id, runId: p.request.runId };
  }
  get(conversationId: string, id: string) {
    const p = this.pending.get(conversationId);
    if (!p || p.request.id !== id)
      throw Object.assign(new Error('Workbook request expired or belongs to another session.'), {
        statusCode: 409,
      });
    return p.request;
  }
  respond(conversationId: string, id: string, result: unknown, error?: string) {
    this.get(conversationId, id);
    const p = this.pending.get(conversationId)!;
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  }
  request(
    conversationId: string,
    request: Omit<WorkbookRequest, 'id'>,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (this.pending.has(conversationId))
      return Promise.reject(
        new Error('Another workbook read is pending. Request ranges sequentially.'),
      );
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const finish = (error?: Error, value?: unknown) => {
        if (this.pending.get(conversationId)?.request.id !== id) return;
        this.pending.delete(conversationId);
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () => finish(new Error('Workbook request cancelled.'));
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'Excel did not respond. Keep the originating task pane open, then try again.',
            ),
          ),
        90000,
      );
      this.pending.set(conversationId, {
        request: { ...request, id },
        resolve: (v) => finish(undefined, v),
        reject: (e) => finish(e),
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}
