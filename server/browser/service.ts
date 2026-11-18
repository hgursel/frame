import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store.js';
import { digest, randomToken } from '../security.js';
import {
  browserBatchSchema,
  browserTabSchema,
  preparedActionSchema,
  type BrowserCommand,
  type BrowserReview,
  type BrowserState,
  type BrowserTab,
} from '../../shared/browser.js';
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
type Device = {
  id: string;
  userId: string;
  name: string;
  token: string;
  expires: number;
  seen: number;
};
type Pending = {
  deviceId: string;
  command: BrowserCommand;
  claimed: boolean;
  finish: (e?: Error, value?: unknown) => void;
};
export class Browsers extends EventEmitter {
  private commands = new Map<string, Pending>();
  private reviews = new Map<string, { review: BrowserReview; finish: (e?: Error) => void }>();
  constructor(readonly store: Store) {
    super();
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS browser_devices(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,token TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL,seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS browser_pairs(code TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS browser_sessions(conversationId TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,deviceId TEXT REFERENCES browser_devices(id) ON DELETE SET NULL,tabs TEXT NOT NULL DEFAULT '[]');`);
    // Bindings survive for history exclusion, never for silently resuming browser control.
    store.db.prepare("UPDATE browser_sessions SET deviceId=NULL,tabs='[]'").run();
    store.db.prepare('UPDATE browser_devices SET seen=0').run();
  }
  enabled() {
    return this.store.meta('browser:enabled') === 'true';
  }
  setEnabled(enabled: boolean) {
    this.store.setMeta('browser:enabled', String(enabled));
    if (!enabled) {
      this.close();
      this.store.db.prepare("UPDATE browser_sessions SET deviceId=NULL,tabs='[]'").run();
    }
  }
  projectEnabled(id: string) {
    return (
      this.enabled() &&
      !!(
        this.store.db
          .prepare("SELECT enabled FROM project_plugins WHERE projectId=? AND plugin='browser'")
          .get(id) as any
      )?.enabled
    );
  }
  used(id: string) {
    return !!this.store.db.prepare('SELECT 1 FROM browser_sessions WHERE conversationId=?').get(id);
  }
  pairCode(userId: string) {
    if (!this.enabled()) throw fail('An administrator must enable Frame for Browser first.');
    const code = randomToken();
    const expires = Date.now() + 10 * 60_000;
    this.store.db
      .prepare('DELETE FROM browser_pairs WHERE userId=? OR expires<?')
      .run(userId, Date.now());
    this.store.db
      .prepare('INSERT INTO browser_pairs VALUES (?,?,?)')
      .run(digest(code), userId, expires);
    return { code, expiresAt: expires };
  }
  pair(code: string, name: string) {
    if (!this.enabled()) throw fail('Browser capability is disabled.', 403);
    const p = this.store.db
      .prepare('SELECT * FROM browser_pairs WHERE code=? AND expires>?')
      .get(digest(code), Date.now()) as any;
    const user = p && this.store.user(p.userId);
    if (!p || !user || user.disabled || user.mustChangePassword)
      throw fail('Pairing code is invalid or expired.', 401);
    this.store.db.prepare('DELETE FROM browser_pairs WHERE code=?').run(digest(code));
    const id = randomUUID(),
      token = randomToken();
    this.store.db
      .prepare('INSERT INTO browser_devices VALUES (?,?,?,?,?,?)')
      .run(id, p.userId, name, digest(token), Date.now() + 30 * 86400_000, 0);
    return { id, token };
  }
  authenticate(token: string): Device {
    const d = this.store.db
      .prepare('SELECT * FROM browser_devices WHERE token=? AND expires>?')
      .get(digest(token), Date.now()) as Device | undefined;
    const user = d && this.store.user(d.userId);
    if (!d || !user || user.disabled || user.mustChangePassword || !this.enabled())
      throw fail('Reconnect your browser in Frame.', 401);
    return d;
  }
  devices(userId: string) {
    return this.store.db
      .prepare('SELECT id,name,expires,seen FROM browser_devices WHERE userId=?')
      .all(userId);
  }
  revoke(userId: string, id: string) {
    const d = this.store.db
      .prepare('SELECT id FROM browser_devices WHERE id=? AND userId=?')
      .get(id, userId);
    if (!d) throw fail('Browser not found.', 404);
    for (const s of this.store.db
      .prepare('SELECT conversationId FROM browser_sessions WHERE deviceId=?')
      .all(id) as any[])
      this.detach(s.conversationId);
    this.store.db.prepare('DELETE FROM browser_devices WHERE id=?').run(id);
  }
  private binding(id: string) {
    return this.store.db
      .prepare('SELECT * FROM browser_sessions WHERE conversationId=?')
      .get(id) as { deviceId: string | null; tabs: string } | undefined;
  }
  state(id: string): BrowserState {
    const chat = this.store.conversation(id);
    const b = this.binding(id);
    const d =
      b?.deviceId &&
      (this.store.db.prepare('SELECT * FROM browser_devices WHERE id=?').get(b.deviceId) as
        Device | undefined);
    return {
      enabled: !!chat && this.projectEnabled(chat.projectId),
      connected: !!d && Date.now() - d.seen < 20_000 && d.expires > Date.now(),
      device: d ? { id: d.id, name: d.name } : undefined,
      tabs: b ? JSON.parse(b.tabs) : [],
      review: this.reviews.get(id)?.review,
    };
  }
  bind(userId: string, id: string, deviceId: string, tabs: unknown) {
    const c = this.store.conversation(id);
    const device = this.store.db
      .prepare('SELECT * FROM browser_devices WHERE id=? AND userId=? AND expires>?')
      .get(deviceId, userId, Date.now());
    if (!c || !this.store.ownsConversation(userId, id) || !device)
      throw fail('Browser or conversation not found.', 404);
    if (
      c.incognito ||
      c.scheduled ||
      !this.projectEnabled(c.projectId) ||
      this.store.db.prepare('SELECT 1 FROM excel_sessions WHERE conversationId=?').get(id)
    )
      throw fail('Enable Browser in an ordinary project conversation.');
    const parsed = z.array(browserTabSchema).max(30).parse(tabs);
    const prior = this.binding(id);
    if (prior?.deviceId && prior.deviceId !== deviceId)
      throw fail('Disconnect the other browser before attaching this device.');
    for (const row of this.store.db
      .prepare('SELECT tabs FROM browser_sessions WHERE deviceId=? AND conversationId<>?')
      .all(deviceId, id) as { tabs: string }[]) {
      const other: BrowserTab[] = JSON.parse(row.tabs);
      if (parsed.some((t) => other.some((o) => o.id === t.id)))
        throw fail('A tab is already attached to another conversation. Detach it there first.');
    }

    if (new Set(parsed.map((t) => t.id)).size !== parsed.length)
      throw fail('Tab IDs must be unique.');
    this.detach(id);
    this.store.db
      .prepare(
        'INSERT INTO browser_sessions VALUES (?,?,?) ON CONFLICT(conversationId) DO UPDATE SET deviceId=excluded.deviceId,tabs=excluded.tabs',
      )
      .run(id, deviceId, JSON.stringify(parsed));
    this.emit('change', id);
  }
  detach(id: string) {
    this.cancel(id);
    this.store.db
      .prepare("UPDATE browser_sessions SET deviceId=NULL,tabs='[]' WHERE conversationId=?")
      .run(id);
    this.emit('change', id);
  }
  cancel(id: string) {
    for (const p of [...this.commands.values()])
      if (p.command.conversationId === id)
        p.finish(
          fail(
            'Browser action interrupted. Inspect the page before retrying; an in-flight action may have completed.',
          ),
        );
    this.reviews.get(id)?.finish(fail('Browser review cancelled.'));
  }
  close() {
    for (const p of [...this.commands.values()]) p.finish(fail('Browser disconnected.'));
    for (const p of [...this.reviews.values()]) p.finish(fail('Review cancelled.'));
  }
  private require(id: string) {
    const b = this.binding(id);
    const c = this.store.conversation(id);
    const d =
      b?.deviceId &&
      (this.store.db
        .prepare('SELECT * FROM browser_devices WHERE id=? AND expires>?')
        .get(b.deviceId, Date.now()) as Device | undefined);
    if (!c || !d || !this.store.ownsConversation(d.userId, id) || !this.projectEnabled(c.projectId))
      throw fail('Attach a connected browser to this conversation.');
    const user = this.store.user(d.userId);
    if (!user || user.disabled || user.mustChangePassword)
      throw fail('Browser account unavailable.');
    if (Date.now() - d.seen >= 20_000)
      throw fail('Browser offline. Open Chrome and the Frame side panel, then reconnect.');
    return d;
  }
  childTab(deviceId: string, opener: string, tab: BrowserTab) {
    const rows = this.store.db
      .prepare('SELECT conversationId,tabs FROM browser_sessions WHERE deviceId=?')
      .all(deviceId) as { conversationId: string; tabs: string }[];
    const parent = rows.find((r) =>
      (JSON.parse(r.tabs) as BrowserTab[]).some((t) => t.id === opener),
    );
    if (!parent) throw fail('Popup opener is not attached to this browser.');
    const tabs: BrowserTab[] = JSON.parse(parent.tabs);
    if (tabs.some((t) => t.id === tab.id)) return { conversationId: parent.conversationId };
    if (tabs.length >= 30) throw fail('Tab limit reached.');
    tabs.push(tab);
    this.store.db
      .prepare('UPDATE browser_sessions SET tabs=? WHERE conversationId=?')
      .run(JSON.stringify(tabs), parent.conversationId);
    this.emit('change', parent.conversationId);
    return { conversationId: parent.conversationId };
  }
  poll(deviceId: string) {
    this.store.db.prepare('UPDATE browser_devices SET seen=? WHERE id=?').run(Date.now(), deviceId);
    const sessions = this.store.db
      .prepare('SELECT conversationId,tabs FROM browser_sessions WHERE deviceId=?')
      .all(deviceId) as any[];
    const p = [...this.commands.values()].find((p) => p.deviceId === deviceId && !p.claimed);
    if (p) p.claimed = true; // Single delivery. A lost response is never retried as an action.
    return {
      command: p?.command,
      sessions: sessions.map((s) => ({
        conversationId: s.conversationId,
        tabs: JSON.parse(s.tabs),
      })),
    };
  }
  valid(deviceId: string, commandId: string) {
    const p = this.commands.get(commandId);
    if (!p || !p.claimed || p.deviceId !== deviceId || p.command.expiresAt < Date.now())
      throw fail('Browser command expired.');
    this.require(p.command.conversationId);
    return p;
  }
  respond(deviceId: string, commandId: string, result: unknown, error?: string) {
    const p = this.valid(deviceId, commandId);
    if (error) p.finish(fail(error));
    else p.finish(undefined, result);
    return { ok: true };
  }
  private command(
    id: string,
    runId: string,
    kind: BrowserCommand['kind'],
    payload: unknown,
    signal: AbortSignal,
  ): Promise<any> {
    const d = this.require(id);
    if (signal.aborted) return Promise.reject(fail('Task stopped.'));
    const command: BrowserCommand = {
      id: randomUUID(),
      conversationId: id,
      runId,
      kind,
      payload,
      expiresAt: Date.now() + 60_000,
    };
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, value?: unknown) => {
        if (!this.commands.delete(command.id)) return;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () =>
        finish(fail('Task stopped; inspect any in-flight change before retrying.'));
      const timer = setTimeout(
        () =>
          finish(
            fail('Browser did not respond. Outcome may be unknown; do not automatically retry.'),
          ),
        60_000,
      );
      this.commands.set(command.id, { deviceId: d.id, command, claimed: false, finish });
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  private review(
    id: string,
    runId: string,
    summary: string,
    actions: BrowserReview['actions'],
    signal: AbortSignal,
    handoff = false,
  ) {
    if (signal.aborted) return Promise.reject(fail('Task stopped.'));
    if (this.reviews.has(id)) throw fail('A browser review is already pending.');
    const review: BrowserReview = {
      id: randomUUID(),
      runId,
      summary,
      actions,
      handoff,
      expiresAt: Date.now() + 15 * 60_000,
    };
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        if (!this.reviews.delete(id)) return;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.emit('change', id);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(fail('Browser review cancelled.'));
      const timer = setTimeout(() => finish(fail('Browser review expired.')), 15 * 60_000);
      this.reviews.set(id, { review, finish });
      signal.addEventListener('abort', abort, { once: true });
      this.emit('change', id);
    });
  }
  decide(id: string, reviewId: string, runId: string, approve: boolean) {
    const p = this.reviews.get(id);
    if (
      !p ||
      p.review.id !== reviewId ||
      p.review.runId !== runId ||
      p.review.expiresAt < Date.now()
    )
      throw fail('This review is no longer pending.');
    this.require(id);
    p.finish(approve ? undefined : fail('User declined the browser actions.'));
    return { ok: true };
  }
  async invoke(id: string, runId: string, action: string, args: any, signal: AbortSignal) {
    this.require(id);
    if (action === 'browser_tabs') return this.state(id).tabs;
    if (action === 'browser_handoff') {
      const { message } = z
        .object({ message: z.string().min(1).max(2000) })
        .strict()
        .parse(args);
      await this.review(id, runId, message, [], signal, true);
      return { continued: true, notice: 'Read the page again before acting.' };
    }
    if (action === 'browser_snapshot' || action === 'browser_screenshot') {
      const { tab } = z
        .object({ tab: z.string().min(1).max(80) })
        .strict()
        .parse(args);
      if (!this.state(id).tabs.some((t) => t.id === tab))
        throw fail('Tab is not attached to this conversation.');
      if (action === 'browser_screenshot' && !this.store.settings().supportsImages)
        throw fail('The configured model does not support images.');
      const result = await this.command(
        id,
        runId,
        action === 'browser_snapshot' ? 'snapshot' : 'screenshot',
        { tab },
        signal,
      );
      if (action === 'browser_screenshot')
        return z
          .object({
            data: z.string().max(4_000_000),
            mimeType: z.literal('image/jpeg'),
            url: z.string().max(8192),
          })
          .strict()
          .parse(result);
      return z
        .object({
          url: z.string().max(8192),
          title: z.string().max(500),
          text: z.string().max(40000),
          elements: z
            .array(
              z
                .object({
                  ref: z.string().max(100),
                  role: z.string().max(50),
                  label: z.string().max(500),
                  value: z.string().max(1000).optional(),
                  options: z
                    .array(
                      z
                        .object({ value: z.string().max(1000), label: z.string().max(200) })
                        .strict(),
                    )
                    .max(100)
                    .optional(),
                })
                .strict(),
            )
            .max(300),
          truncated: z.boolean(),
        })
        .strict()
        .parse(result);
    }
    if (action !== 'browser_actions') throw fail('Unknown browser tool.');
    const batch = browserBatchSchema.parse(args);
    for (const a of batch.actions)
      if (a.tab && !this.state(id).tabs.some((t) => t.id === a.tab))
        throw fail('Tab is not attached to this conversation.');
    const prepared = z
      .array(preparedActionSchema)
      .min(1)
      .max(20)
      .parse(await this.command(id, runId, 'prepare', batch.actions, signal));
    if (
      prepared.length !== batch.actions.length ||
      prepared.some((p, i) => JSON.stringify(p.action) !== JSON.stringify(batch.actions[i]))
    )
      throw fail('Browser returned a mismatched action plan.');
    if (prepared.some((p) => p.review))
      await this.review(id, runId, batch.summary, prepared, signal);
    const results: unknown[] = [];
    for (const p of prepared) {
      if (signal.aborted) throw fail('Task stopped.');
      try {
        const result = z
          .object({ ok: z.literal(true), tab: browserTabSchema, notice: z.string().max(1000) })
          .strict()
          .parse(await this.command(id, runId, 'execute', p, signal));
        const b = this.binding(id)!;
        const tabs: BrowserTab[] = JSON.parse(b.tabs);
        const found = tabs.findIndex((t) => t.id === result.tab.id);
        if (found >= 0) tabs[found] = result.tab;
        else {
          if (tabs.length >= 30) throw fail('Tab limit reached; detach unused tabs.');
          tabs.push(result.tab);
        }
        this.store.db
          .prepare('UPDATE browser_sessions SET tabs=? WHERE conversationId=?')
          .run(JSON.stringify(tabs), id);
        results.push(result);
        this.emit('change', id);
      } catch (e) {
        return {
          results,
          stopped: true,
          error: (e as Error).message,
          notice:
            'Remaining actions were not dispatched. Inspect the last action before requesting a new batch; no automatic replay.',
        };
      }
    }
    return {
      results,
      notice:
        'Actions dispatched. Read the resulting pages to verify that the website saved the changes.',
    };
  }
}
