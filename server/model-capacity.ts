/** FIFO model-request permits. Tools, user questions and idle sessions hold no permit. */
export class ModelCapacity {
  private holders = new Set<string>();
  private waiting: {
    id: string;
    resolve: () => void;
    reject: (e: Error) => void;
    cleanup: () => void;
  }[] = [];
  constructor(private limit: () => number) {}
  acquire(id: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error('Task stopped'));
    if (this.holders.has(id) || this.waiting.some((w) => w.id === id))
      return Promise.reject(new Error('Model request already pending'));
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.waiting = this.waiting.filter((w) => w !== entry);
        this.holders.delete(id);
        cleanup();
        reject(new Error('Task stopped'));
        this.drain();
      };
      const cleanup = () => signal.removeEventListener('abort', abort);
      const entry = {
        id,
        resolve: () => {
          cleanup();
          resolve();
        },
        reject,
        cleanup,
      };
      signal.addEventListener('abort', abort, { once: true });
      this.waiting.push(entry);
      this.drain();
    });
  }
  release(id: string) {
    for (const entry of this.waiting.filter((entry) => entry.id === id)) {
      entry.cleanup();
      entry.reject(new Error('Task stopped'));
    }
    this.waiting = this.waiting.filter((entry) => entry.id !== id);
    this.holders.delete(id);
    this.drain();
  }
  private drain() {
    while (this.waiting.length && this.holders.size < this.limit()) {
      const entry = this.waiting.shift()!;
      this.holders.add(entry.id);
      entry.resolve();
    }
  }
}
