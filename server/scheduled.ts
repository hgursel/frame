import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import type { Runner } from './runner.js';
import type { Email } from './email.js';
import { deleteWorkspaceData } from './deletion.js';
import { emailAddressSchema } from './auth.js';
import {
  nextOccurrence,
  validTimezone,
  type ScheduledTask,
  type ScheduledRun,
} from '../shared/scheduled.js';
const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const timingSchema = z
  .object({
    kind: z.enum(['once', 'daily', 'weekdays', 'weekly', 'monthly']),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.kind === 'once' &&
        (!v.date ||
          !Number.isFinite(Date.parse(v.date)) ||
          new Date(v.date).toISOString().slice(0, 10) !== v.date)) ||
      (v.kind === 'weekly' && v.weekday === undefined) ||
      (v.kind === 'monthly' && !v.day)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Specify a valid date, weekday, or monthly day for this schedule.',
      });
  });
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().min(1).max(16000),
    timing: timingSchema,
    recipients: z.array(emailAddressSchema).max(20).default([]),
    attachments: z.enum(['none', 'generated']).default('none'),
  })
  .strict();
const revisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export class Scheduled {
  private timer?: NodeJS.Timeout;
  private tickWork?: Promise<void>;
  private closing = false;
  readonly jobs = new Map<string, Promise<void>>();
  constructor(
    readonly store: Store,
    readonly runner: Runner,
    readonly email: Email,
    readonly startRun: (
      conversationId: string,
      runId: string,
      task: ScheduledTask,
    ) => Promise<void>,
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        ownerId TEXT NOT NULL REFERENCES users(id), sourceConversationId TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'draft', nextRunAt INTEGER, createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scheduled_runs (
        id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
        conversationId TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
        status TEXT NOT NULL, scheduledAt INTEGER NOT NULL, startedAt INTEGER NOT NULL,
        finishedAt INTEGER, error TEXT, notification TEXT, taskSnapshot TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS scheduled_due ON scheduled_tasks(state,nextRunAt);
      CREATE INDEX IF NOT EXISTS scheduled_source ON scheduled_tasks(sourceConversationId);
      CREATE INDEX IF NOT EXISTS scheduled_owner ON scheduled_tasks(ownerId,createdAt);
      CREATE INDEX IF NOT EXISTS scheduled_history ON scheduled_runs(taskId,startedAt);
      CREATE UNIQUE INDEX IF NOT EXISTS scheduled_one_running ON scheduled_runs(taskId) WHERE status='running';
    `);
    store.db.exec(
      "UPDATE scheduled_runs SET notification='uncertain' WHERE notification='sending'",
    );
    store.db
      .prepare(
        "UPDATE scheduled_runs SET status='interrupted',finishedAt=?,error='Frame restarted during this run. It was not replayed; check email status before running again.' WHERE status='running'",
      )
      .run(Date.now());
    store.db.exec(
      "UPDATE email_drafts SET status='cancelled' WHERE status='draft' AND conversationId IN (SELECT conversationId FROM scheduled_runs WHERE status='interrupted')",
    );
  }
  timezone() {
    return this.store.meta('scheduled:timezone') || 'UTC';
  }
  saveTimezone(input: unknown) {
    const { timezone } = z
      .object({
        timezone: z.string().max(100).refine(validTimezone, 'Choose a valid IANA timezone.'),
      })
      .strict()
      .parse(input);
    if (this.jobs.size)
      throw fail('Wait for scheduled runs to finish before changing the timezone.', 409);
    if (timezone !== this.timezone()) {
      this.store.db.exec('SAVEPOINT schedule_zone');
      try {
        this.store.setMeta('scheduled:timezone', timezone);
        // A timezone change alters the authorization card; require fresh review.
        this.store.db.exec(
          "UPDATE scheduled_tasks SET state='draft',nextRunAt=NULL,revision=revision+1 WHERE state<>'completed'",
        );
        this.store.db.exec('RELEASE schedule_zone');
      } catch (e) {
        this.store.db.exec('ROLLBACK TO schedule_zone; RELEASE schedule_zone');
        throw e;
      }
    }
    return { timezone };
  }
  private row(row: any): ScheduledTask {
    return {
      ...JSON.parse(row.payload),
      id: row.id,
      projectId: row.projectId,
      ownerId: row.ownerId,
      sourceConversationId: row.sourceConversationId,
      revision: row.revision,
      state: row.state,
      nextRunAt: row.nextRunAt,
      createdAt: row.createdAt,
      timezone: this.timezone(),
    };
  }
  get(id: string, ownerId?: string) {
    const row = this.store.db.prepare('SELECT * FROM scheduled_tasks WHERE id=?').get(id) as any;
    if (!row || (ownerId && row.ownerId !== ownerId)) throw fail('Scheduled task not found.', 404);
    return this.row(row);
  }
  list(ownerId: string) {
    return (
      this.store.db
        .prepare('SELECT * FROM scheduled_tasks WHERE ownerId=? ORDER BY createdAt DESC')
        .all(ownerId) as any[]
    ).map((r) => this.row(r));
  }
  forConversation(id: string) {
    return (
      this.store.db
        .prepare('SELECT * FROM scheduled_tasks WHERE sourceConversationId=? ORDER BY createdAt')
        .all(id) as any[]
    ).map((r) => this.row(r));
  }
  private validateOwner(task: ScheduledTask) {
    const user = this.store.user(task.ownerId);
    if (
      !user ||
      user.disabled ||
      user.mustChangePassword ||
      !this.store.ownsProject(task.ownerId, task.projectId)
    )
      throw fail('Task owner or project is no longer available.', 403);
  }
  private validateDelivery(task: Pick<ScheduledTask, 'recipients'>) {
    if (!task.recipients.length) return;
    const settings = this.email.settings();
    if (!settings.enabled) throw fail('Configure SMTP before activating email delivery.');
    if (task.recipients.some((r) => !settings.domains.includes(r.split('@')[1]!)))
      throw fail('Every recipient must use an admin-approved internal domain.');
  }
  prepare(conversationId: string, input: unknown) {
    const chat = this.store.conversation(conversationId);
    if (!chat || chat.incognito || chat.scheduled)
      throw fail('Create schedules from a regular project conversation.');
    const project = this.store.project(chat.projectId)!;
    const data = taskSchema.parse(input);
    const task = { ...data, ownerId: project.ownerId!, projectId: project.id } as ScheduledTask;
    this.validateOwner(task);
    this.validateDelivery(task);
    if (!nextOccurrence(data.timing, this.timezone(), Date.now()))
      throw fail('Choose a future date and time.');
    const id = randomUUID();
    this.store.db
      .prepare(
        'INSERT INTO scheduled_tasks(id,projectId,ownerId,sourceConversationId,payload,createdAt) VALUES (?,?,?,?,?,?)',
      )
      .run(
        id,
        project.id,
        project.ownerId!,
        conversationId,
        JSON.stringify({ ...data, recipients: [...new Set(data.recipients)] }),
        Date.now(),
      );
    this.runner.emit(conversationId);
    return this.get(id);
  }
  private editable(task: ScheduledTask, revision: number) {
    if (revision !== task.revision)
      throw fail('This schedule changed. Review its latest version.', 409);
    if (
      this.jobs.has(task.id) ||
      this.store.db
        .prepare("SELECT 1 FROM scheduled_runs WHERE taskId=? AND status='running'")
        .get(task.id)
    )
      throw fail('Wait for this scheduled run to finish.', 409);
  }
  update(id: string, ownerId: string, input: unknown) {
    const { revision, ...data } = z
      .object({ revision: revisionSchema.shape.revision, ...taskSchema.shape })
      .strict()
      .parse(input);
    const task = this.get(id, ownerId);
    this.editable(task, revision);
    this.validateOwner(task);
    this.validateDelivery(data);
    if (!nextOccurrence(data.timing, this.timezone(), Date.now()))
      throw fail('Choose a future date and time.');
    this.store.db
      .prepare(
        "UPDATE scheduled_tasks SET payload=?,revision=revision+1,state='draft',nextRunAt=NULL WHERE id=?",
      )
      .run(JSON.stringify({ ...data, recipients: [...new Set(data.recipients)] }), id);
    if (task.sourceConversationId) this.runner.emit(task.sourceConversationId);
    return this.get(id);
  }
  action(id: string, ownerId: string, action: string, input: unknown) {
    const { revision } = revisionSchema.parse(input);
    const task = this.get(id, ownerId);
    this.editable(task, revision);
    if (action === 'activate' || action === 'resume') {
      if (action === 'activate' && task.state !== 'draft')
        throw fail('This task is already activated.');
      if (action === 'resume' && task.state !== 'paused')
        throw fail('Only paused tasks can resume.');
      this.validateOwner(task);
      this.validateDelivery(task);
      if (!this.store.settings().modelId) throw fail('Configure a model before activating tasks.');
      const next = nextOccurrence(task.timing, task.timezone, Date.now());
      if (!next) throw fail('Choose a future date and time.');
      this.store.db
        .prepare(
          "UPDATE scheduled_tasks SET state='active',nextRunAt=?,revision=revision+1 WHERE id=?",
        )
        .run(next, id);
    } else if (action === 'pause') {
      if (task.state !== 'active') throw fail('Only active tasks can pause.');
      this.store.db
        .prepare(
          "UPDATE scheduled_tasks SET state='paused',nextRunAt=NULL,revision=revision+1 WHERE id=?",
        )
        .run(id);
    } else if (action === 'run') {
      if (!['active', 'paused', 'completed'].includes(task.state))
        throw fail('Activate this schedule before running it.');
      this.validateOwner(task);
      this.validateDelivery(task);
      this.store.db.prepare('UPDATE scheduled_tasks SET revision=revision+1 WHERE id=?').run(id);
      this.launch({ ...task, revision: task.revision + 1 }, Date.now(), false);
    } else throw fail('Unknown schedule action.');
    if (task.sourceConversationId) this.runner.emit(task.sourceConversationId);
    return this.get(id);
  }
  remove(id: string, ownerId: string, input: unknown) {
    const task = this.get(id, ownerId);
    this.editable(task, revisionSchema.parse(input).revision);
    for (const run of this.store.db
      .prepare('SELECT conversationId FROM scheduled_runs WHERE taskId=?')
      .all(id) as { conversationId: string }[])
      deleteWorkspaceData(
        this.store,
        this.runner,
        this.runner.uploads!,
        task.projectId,
        run.conversationId,
      );
    this.store.db.prepare('DELETE FROM scheduled_tasks WHERE id=?').run(id);
    if (task.sourceConversationId) this.runner.emit(task.sourceConversationId);
    return { ok: true };
  }
  runs(id: string, ownerId: string): ScheduledRun[] {
    this.get(id, ownerId);
    return this.store.db
      .prepare(
        'SELECT id,taskId,conversationId,status,scheduledAt,startedAt,finishedAt,error,notification FROM scheduled_runs WHERE taskId=? ORDER BY startedAt DESC LIMIT 100',
      )
      .all(id) as unknown as ScheduledRun[];
  }
  authorizeRun(conversationId: string) {
    if (this.closing) throw fail('Frame is shutting down.');
    const row = this.store.db
      .prepare(
        "SELECT taskSnapshot,taskId FROM scheduled_runs WHERE conversationId=? AND status='running'",
      )
      .get(conversationId) as any;
    if (!row) throw fail('Scheduled run is no longer active.');
    const task = JSON.parse(row.taskSnapshot) as ScheduledTask;
    const current = this.get(row.taskId);
    if (current.revision !== task.revision) throw fail('Schedule changed during this run.');
    this.validateOwner(task);
    this.validateDelivery(task);
    return task;
  }
  async prepareEmail(conversationId: string, input: unknown) {
    const task = this.authorizeRun(conversationId);
    if (!task.recipients.length) throw fail('Email delivery was not authorized for this task.');
    const data = z
      .object({
        subject: z.string(),
        body: z.string(),
        attachments: z.array(z.string()).default([]),
      })
      .strict()
      .parse(input);
    if (task.attachments === 'none' && data.attachments.length)
      throw fail('Attachments were not authorized for this task.');
    return this.email.prepare(conversationId, { ...data, to: task.recipients });
  }
  private launch(task: ScheduledTask, now: number, advance: boolean) {
    if (this.closing || this.jobs.has(task.id)) return;
    const runId = randomUUID();
    let conversationId = '';
    this.store.db.exec('SAVEPOINT schedule_claim');
    try {
      // Claim and advance before starting work. A restart must never replay an accepted run.
      const chat = this.store.createConversation(task.projectId);
      conversationId = chat.id;
      this.store.db
        .prepare('UPDATE conversations SET scheduled=1,title=? WHERE id=?')
        .run(task.title, chat.id);
      let scheduledAt = now;
      if (advance) {
        scheduledAt = task.nextRunAt!;
        // At most the latest missed occurrence, without iterating through years of downtime.
        let cursor = Math.max(scheduledAt - 1, now - 63 * 86400000);
        for (let i = 0; i < 65; i++) {
          const at = nextOccurrence(task.timing, task.timezone, cursor);
          if (at === null || at > now) break;
          scheduledAt = at;
          cursor = at;
        }
        const next = nextOccurrence(task.timing, task.timezone, now);
        this.store.db
          .prepare('UPDATE scheduled_tasks SET nextRunAt=?,state=? WHERE id=?')
          .run(next, next === null ? 'completed' : 'active', task.id);
      }
      this.store.db
        .prepare(
          "INSERT INTO scheduled_runs(id,taskId,conversationId,status,scheduledAt,startedAt,taskSnapshot) VALUES (?,?,?,'running',?,?,?)",
        )
        .run(runId, task.id, conversationId, scheduledAt, Date.now(), JSON.stringify(task));
      this.store.db.exec('RELEASE schedule_claim');
    } catch (e) {
      this.store.db.exec('ROLLBACK TO schedule_claim; RELEASE schedule_claim');
      throw e;
    }
    const job = this.execute(task, conversationId, runId).finally(() => this.jobs.delete(task.id));
    this.jobs.set(task.id, job);
  }
  private async execute(task: ScheduledTask, conversationId: string, runId: string) {
    let error: string | undefined;
    let dispose = () => {};
    try {
      this.authorizeRun(conversationId);
      const ended = new Promise<{ status: string; error?: string }>((resolve) => {
        const listener = (id: string, result: { status: string; error?: string }) => {
          if (id === runId) resolve(result);
        };
        this.runner.on('finished', listener);
        dispose = () => this.runner.off('finished', listener);
      });
      await this.startRun(conversationId, runId, task);
      const result = await ended;
      if (result.status !== 'completed') throw new Error(result.error || `Run ${result.status}.`);
      this.authorizeRun(conversationId);
      const reported = this.store.db
        .prepare('SELECT error FROM scheduled_runs WHERE id=?')
        .get(runId) as any;
      if (reported?.error) throw new Error(reported.error);
      if (task.recipients.length) {
        const draft = this.email.list(conversationId).find((d) => d.status === 'draft');
        if (!draft)
          throw new Error('Task finished without preparing its scheduled email. Nothing was sent.');
        if (
          JSON.stringify(draft.to) !== JSON.stringify(task.recipients) ||
          (task.attachments === 'none' && draft.attachments.length)
        )
          throw new Error('Email does not match the activated schedule.');
        const sent = await this.email.send(conversationId, draft.id, draft.revision);
        if (sent.status !== 'accepted') throw new Error(sent.message);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Scheduled task failed.';
    } finally {
      dispose();
    }
    if (error) {
      for (const draft of this.email.list(conversationId))
        if (draft.status === 'draft') this.email.cancel(conversationId, draft.id, draft.revision);
    }
    this.store.db
      .prepare('UPDATE scheduled_runs SET status=?,error=?,finishedAt=? WHERE id=?')
      .run(error ? 'failed' : 'completed', error || null, Date.now(), runId);
    if (error && !this.closing) await this.notifyFailure(runId);
  }
  private async notifyFailure(runId: string) {
    const row = this.store.db.prepare('SELECT * FROM scheduled_runs WHERE id=?').get(runId) as any;
    if (!row || row.notification !== null) return;
    const task = JSON.parse(row.taskSnapshot) as ScheduledTask;
    // Claim notification before any await; uncertain sends are never automatically retried.
    this.store.db
      .prepare(
        "UPDATE scheduled_runs SET notification='sending' WHERE id=? AND notification IS NULL",
      )
      .run(runId);
    try {
      this.validateOwner(task);
      const user = this.store.user(task.ownerId);
      if (!user.email || !this.email.settings().enabled)
        throw new Error('No email notification: SMTP or owner email unavailable.');
      for (const d of this.email.list(row.conversationId))
        if (d.status === 'draft') this.email.cancel(row.conversationId, d.id, d.revision);
      const draft = await this.email.prepare(row.conversationId, {
        to: [user.email],
        subject: `Scheduled task failed: ${task.title}`.slice(0, 250),
        body: `The scheduled task “${task.title}” did not complete successfully.\n\n${row.error}\n\nOpen Scheduled in Frame to review the result.`,
        attachments: [],
      });
      const sent = await this.email.send(row.conversationId, draft.id, draft.revision);
      this.store.db
        .prepare('UPDATE scheduled_runs SET notification=? WHERE id=?')
        .run(sent.status, runId);
    } catch (e) {
      this.store.db
        .prepare('UPDATE scheduled_runs SET notification=? WHERE id=?')
        .run(e instanceof Error ? e.message : 'Notification failed.', runId);
    }
  }
  tick(now = Date.now()): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.tickWork) return this.tickWork;
    this.tickWork = this.doTick(now).finally(() => {
      this.tickWork = undefined;
    });
    return this.tickWork;
  }
  private async doTick(now: number) {
    for (const row of this.store.db
      .prepare(
        "SELECT * FROM scheduled_tasks WHERE state='active' AND nextRunAt<=? ORDER BY nextRunAt",
      )
      .all(now) as any[]) {
      if (this.jobs.size >= (this.store.settings().maxConcurrentRequests || 2)) break;
      const task = this.row(row);
      if (!this.jobs.has(task.id)) this.launch(task, now, true);
    }
    for (const row of this.store.db
      .prepare(
        "SELECT id FROM scheduled_runs WHERE status IN ('failed','interrupted') AND notification IS NULL",
      )
      .all() as any[])
      await this.notifyFailure(row.id);
  }
  busy(projectId: string) {
    return [...this.jobs.keys()].some((id) => {
      try {
        return this.get(id).projectId === projectId;
      } catch {
        return false;
      }
    });
  }
  startTimer() {
    this.timer = setInterval(() => {
      void this.tick().catch(() => {
        console.error('Scheduled task dispatch failed. Check Frame storage and configuration.');
      });
    }, 15000);
    this.timer.unref();
  }
  async close() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.tickWork?.catch(() => {});
    await this.runner.close();
    await Promise.allSettled(this.jobs.values());
  }
}
export function scheduledApi(app: FastifyInstance, scheduled: Scheduled) {
  app.get('/api/scheduled', (request) => ({
    tasks: scheduled.list(request.user.id),
    timezone: scheduled.timezone(),
  }));
  app.get('/api/admin/scheduled', () => ({ timezone: scheduled.timezone() }));
  app.put('/api/admin/scheduled', (request) => scheduled.saveTimezone(request.body));
  app.get<{ Params: { id: string } }>('/api/scheduled/:id', (request) =>
    scheduled.get(request.params.id, request.user.id),
  );
  app.get<{ Params: { id: string } }>('/api/scheduled/:id/runs', (request) =>
    scheduled.runs(request.params.id, request.user.id),
  );
  app.patch<{ Params: { id: string } }>('/api/scheduled/:id', (request) =>
    scheduled.update(request.params.id, request.user.id, request.body),
  );
  app.delete<{ Params: { id: string } }>('/api/scheduled/:id', (request) =>
    scheduled.remove(request.params.id, request.user.id, request.body),
  );
  for (const action of ['activate', 'pause', 'resume', 'run'])
    app.post<{ Params: { id: string } }>(`/api/scheduled/:id/${action}`, (request) =>
      scheduled.action(request.params.id, request.user.id, action, request.body),
    );
}
