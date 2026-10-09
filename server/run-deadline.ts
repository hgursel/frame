/** Counts execution time, excluding a pending user questionnaire. */
export class RunDeadline {
  private remaining: number;
  private started = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  constructor(
    private expire: () => void,
    duration = 60 * 60_000,
  ) {
    this.remaining = duration;
    this.resume();
  }
  pause() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.remaining = Math.max(0, this.remaining - (performance.now() - this.started));
  }
  resume() {
    if (this.closed || this.timer) return;
    this.started = performance.now();
    this.timer = setTimeout(() => {
      this.close();
      this.expire();
    }, this.remaining);
    this.timer.unref();
  }
  close() {
    this.pause();
    this.closed = true;
  }
}
