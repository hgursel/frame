import type { Store } from './store.js';
import type { Runner } from './runner.js';
import type { Knowledge } from './knowledge.js';
import { deleteWorkspaceData } from './deletion.js';
/** Transcript/compaction state stays in Runner memory; transient plugin files use normal cleanup. */
export class Incognito {
  readonly touched = new Map<string, number>();
  readonly ending = new Set<string>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    readonly store: Store,
    readonly runner: Runner,
    readonly knowledge: Knowledge,
  ) {
    for (const c of store.conversations().filter((c) => c.incognito)) this.ending.add(c.id);
    this.sweep();
    this.timer = setInterval(() => this.sweep(), 15000);
    this.timer.unref();
  }
  touch(id: string) {
    if (this.store.conversation(id)?.incognito && !this.ending.has(id))
      this.touched.set(id, Date.now());
  }
  end(id: string) {
    this.ending.add(id);
    this.runner.stop(id);
    this.sweep();
  }
  sweep() {
    for (const [id, at] of this.touched) if (Date.now() - at > 30 * 60000) this.ending.add(id);
    for (const id of this.ending) {
      this.runner.stop(id);
      const c = this.store.conversation(id);
      if (c)
        try {
          deleteWorkspaceData(this.store, this.runner, this.knowledge, c.projectId, id);
        } catch {
          continue;
        }
      this.runner.ephemeral.delete(id);
      this.touched.delete(id);
      this.ending.delete(id);
    }
  }
  close() {
    clearInterval(this.timer);
    for (const c of this.store.conversations().filter((c) => c.incognito)) this.ending.add(c.id);
    this.sweep();
  }
}
