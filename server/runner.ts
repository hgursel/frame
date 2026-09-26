import type { ReportsPlugin } from './plugins/reports/service.js';
import type { ChartsPlugin } from './plugins/charts/service.js';
import type { MssqlPlugin } from './plugins/mssql/service.js';
import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatSnapshot, WorkerOutput, WorkerInput } from '../shared/types.js';
import { readHistory } from './history.js';
import { Store } from './store.js';
import { emptyMetrics, metricsKey } from './context.js';

type ActiveRun = {
  process: ChildProcess;
  projectId: string;
  runId: string;
  snapshot: ChatSnapshot;
  stopRequested: boolean;
  pluginAbort: AbortController;
};
export class Runner extends EventEmitter {
  private revision = Date.now() * 1000;
  readonly ephemeral = new Map<string, { entries: unknown[]; snapshot?: ChatSnapshot }>();
  readonly active = new Map<string, ActiveRun>();
  constructor(
    readonly store: Store,
    readonly mssql?: MssqlPlugin,
    readonly charts?: ChartsPlugin,
    readonly reports?: ReportsPlugin,
  ) {
    super();
    this.setMaxListeners(100);
    store.ephemeralBranch = (id) => (this.ephemeral.get(id)?.entries || []) as any[];
    mssql?.on('change', (id: string) => this.emit(id));
  }
  snapshot(id: string): ChatSnapshot {
    const live = this.active.get(id);
    if (live) {
      const sqlApproval = this.mssql?.approval(id);
      return {
        ...live.snapshot,
        sqlApproval,
        status: sqlApproval && !live.stopRequested ? 'Awaiting SQL approval' : live.snapshot.status,
        runId: live.runId,
        revision: ++this.revision,
      };
    }
    if (this.store.conversation(id)?.incognito)
      return {
        ...(this.ephemeral.get(id)?.snapshot || { messages: [], running: false, status: 'Ready' }),
        revision: ++this.revision,
      };
    const settings = this.store.settings();
    const project = this.store.project(this.store.conversation(id)!.projectId)!;
    const saved = this.store.meta(`metrics:${id}`);
    const cached = saved ? JSON.parse(saved) : undefined;
    const last = this.store.db
      .prepare(
        'SELECT status, error FROM runs WHERE conversationId=? ORDER BY createdAt DESC, rowid DESC LIMIT 1',
      )
      .get(id) as { status: string; error?: string } | undefined;
    return {
      revision: ++this.revision,
      memory: JSON.parse(this.store.meta(`memory:${id}`) || '[]'),
      messages: readHistory(this.store.sessionFile(id)),
      running: false,
      status: last?.status || 'Ready',
      error: last?.error || undefined,
      metrics:
        cached?.key === metricsKey(settings, project) ? cached.metrics : emptyMetrics(settings),
    };
  }
  projectBusy(id: string) {
    return [...this.active.values()].some((run) => run.projectId === id);
  }
  start(
    id: string,
    runId: string,
    prompt: string,
    documents?: WorkerInput['documents'],
    pythonPath?: string,
    knowledge?: WorkerInput['knowledge'],
    operation: WorkerInput['operation'] = 'prompt',
    reference?: WorkerInput['reference'],
  ) {
    const existing = this.store.db
      .prepare('SELECT conversationId, status FROM runs WHERE id=?')
      .get(runId) as { conversationId: string; status: string } | undefined;
    if (existing) {
      if (existing.conversationId !== id)
        throw Object.assign(new Error('Request ID already used'), { statusCode: 409 });
      return { id: runId, status: existing.status, duplicate: true };
    }
    const conversation = this.store.conversation(id)!;
    const originalProject = this.store.project(conversation.projectId)!;
    const project = conversation.incognito
      ? { ...originalProject, toolsEnabled: false }
      : originalProject;
    if (this.reports?.busy(project.id))
      throw Object.assign(new Error('Wait for report operations to finish.'), { statusCode: 409 });
    if (this.mssql?.schema.jobs.has(project.id))
      throw Object.assign(new Error('Wait for schema initialization to finish.'), {
        statusCode: 409,
      });
    if (this.projectBusy(project.id))
      throw Object.assign(new Error('Another task is running in this project. Stop it or wait.'), {
        statusCode: 409,
      });
    if (this.active.size >= 2)
      throw Object.assign(new Error('Two tasks are already running. Wait for one to finish.'), {
        statusCode: 409,
      });
    const settings = this.store.settings();
    if (!settings.modelId)
      throw Object.assign(new Error('Configure your local model in Settings first.'), {
        statusCode: 400,
      });
    this.emit('foreground');
    if (conversation.incognito && !this.ephemeral.has(id)) this.ephemeral.set(id, { entries: [] });
    const history = conversation.incognito
      ? this.snapshot(id).messages
      : readHistory(this.store.sessionFile(id));
    this.store.db
      .prepare('INSERT INTO runs VALUES (?, ?, ?, NULL, ?)')
      .run(runId, id, 'running', Date.now());
    if (operation !== 'compact' && conversation.title === 'New conversation')
      this.store.db
        .prepare('UPDATE conversations SET title=? WHERE id=?')
        .run(prompt.slice(0, 70), id);
    const workerFile = fileURLToPath(
      new URL(
        import.meta.url.endsWith('.ts') ? './pi-worker.ts' : './pi-worker.js',
        import.meta.url,
      ),
    );
    let child: ChildProcess;
    try {
      child = fork(workerFile, [], {
        cwd: this.store.projectPath(project.id),
        detached: true,
        execArgv: workerFile.endsWith('.ts') ? ['--import', import.meta.resolve('tsx')] : [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: {
          PATH: process.env.PATH,
          LANG: 'C.UTF-8',
          PI_OFFLINE: '1',
          PI_TELEMETRY: '0',
          DO_NOT_TRACK: '1',
          PI_ARTIFACT_DIR: this.store.artifacts(conversation),
          PI_CODING_AGENT_DIR: path.join(this.store.root, 'agent', id),
          ...(pythonPath ? { FRAME_PYTHON: pythonPath } : {}),
        },
      });
    } catch {
      this.store.db
        .prepare(
          "UPDATE runs SET status='failed', error='Could not start agent process' WHERE id=?",
        )
        .run(runId);
      throw new Error('Could not start agent process');
    }
    const active: ActiveRun = {
      process: child,
      projectId: project.id,
      runId,
      snapshot: {
        ...this.snapshot(id),
        messages: history,
        error: undefined,
        running: true,
        status: operation === 'compact' ? 'Compacting context' : 'Preparing conversation',
      },
      stopRequested: false,
      pluginAbort: new AbortController(),
    };
    active.snapshot.memory =
      reference?.pages.filter((p) => p.method).map((p) => ({ id: p.id, title: p.title })) || [];
    if (!conversation.incognito)
      this.store.setMeta(`memory:${id}`, JSON.stringify(active.snapshot.memory));
    this.active.set(id, active);
    let completed = false;
    let error: string | undefined;
    const deadline = setTimeout(() => {
      error = 'Task reached the 30-minute limit and was stopped.';
      this.stop(id);
    }, 30 * 60_000);
    child.on('message', (event: WorkerOutput) => {
      if (this.active.get(id) !== active) return;
      if (event.type === 'ephemeral_session') {
        if (conversation.incognito)
          this.ephemeral.set(id, { ...this.ephemeral.get(id), entries: event.entries });
        return;
      }
      if (active.stopRequested) return;
      if (event.type === 'plugin_call') {
        void Promise.resolve()
          .then<unknown>(() => {
            if (active.stopRequested) throw new Error('Task stopped.');
            if (event.action === 'reports_sources' && this.reports)
              return this.reports.sources(id, event.args);
            if (event.action === 'reports_create' && this.reports)
              return this.reports.create(id, event.args, active.pluginAbort.signal);
            if (event.action === 'charts_sources' && this.charts)
              return this.charts.listSources(id, event.args);
            if (event.action === 'charts_import' && this.charts)
              return this.charts.importSource(id, event.args);
            if (event.action === 'charts_transform' && this.charts)
              return this.charts.transform(id, event.args);
            if (event.action === 'charts_create' && this.charts)
              return this.charts.create(id, event.args);
            if (event.action === 'charts_datasets' && this.charts) return this.charts.list(id);
            if (!this.mssql) throw new Error('Plugin unavailable');
            return this.mssql.invoke(id, runId, event.action, event.args);
          })
          .then(
            (result) => {
              if (child.connected && this.active.get(id) === active && !active.stopRequested)
                child.send({ type: 'plugin_result', id: event.id, result }, () => {});
            },
            (error) => {
              if (child.connected && this.active.get(id) === active && !active.stopRequested)
                child.send(
                  {
                    type: 'plugin_result',
                    id: event.id,
                    error: error instanceof Error ? error.message : 'Plugin tool failed',
                  },
                  () => {},
                );
            },
          );
      } else if (event.type === 'snapshot') {
        active.snapshot = {
          memory: active.snapshot.memory,
          messages: event.messages,
          running: true,
          status: active.stopRequested ? 'Stopping' : event.status,
          metrics: event.metrics,
        };
        this.emit(id);
      } else {
        completed = event.type === 'done';
        error ||= event.error;
      }
    });
    let finished = false;
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      active.pluginAbort.abort();
      this.mssql?.cancelRun(runId);
      this.killGroup(child);
      const status = error
        ? 'failed'
        : active.stopRequested
          ? 'stopped'
          : completed && code === 0 && !signal
            ? 'completed'
            : 'interrupted';
      if (status === 'interrupted')
        error = `Agent process exited unexpectedly (${signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`}). Review history before retrying.`;
      this.store.db
        .prepare('UPDATE runs SET status=?, error=? WHERE id=?')
        .run(status, error || null, runId);
      if (conversation.incognito)
        this.ephemeral.set(id, {
          entries: this.ephemeral.get(id)?.entries || [],
          snapshot: { ...active.snapshot, running: false, status, error },
        });
      if (active.snapshot.metrics && !conversation.incognito)
        this.store.setMeta(
          `metrics:${id}`,
          JSON.stringify({ key: metricsKey(settings, project), metrics: active.snapshot.metrics }),
        );
      this.active.delete(id);
      this.emit(id);
    };
    child.once('error', () => {
      error = 'Agent process failed to start.';
    });
    // Unlike exit, close follows delivery of buffered IPC messages.
    child.once('close', finish);
    child.send(
      {
        cwd: this.store.projectPath(project.id),
        agentDir: path.join(this.store.root, 'agent', id),
        sessionFile: this.store.sessionFile(id),
        ephemeralEntries: conversation.incognito
          ? this.ephemeral.get(id)?.entries || []
          : undefined,
        artifactDir: this.store.artifacts(conversation),
        settings,
        project,
        prompt,
        documents,
        pythonPath,
        knowledge,
        reference,
        operation,
        reports:
          this.reports?.enabled() && this.reports.projectEnabled(project.id)
            ? this.reports.context(project.id)
            : undefined,
        charts: !!this.charts?.enabled() && this.charts.projectEnabled(project.id),
        mssql:
          this.mssql?.projectEnabled(project.id) && this.mssql.settings().enabled
            ? {
                databases: this.mssql.settings().databases,
                map: this.mssql.knowledgeMap(project.id),
              }
            : undefined,
      },
      (sendError) => {
        if (sendError) {
          error = 'Could not initialize agent process.';
          this.killGroup(child);
        }
      },
    );
    this.emit(id);
    return { id: runId, status: 'running', duplicate: false };
  }
  stop(id: string, expectedRunId?: string) {
    const run = this.active.get(id);
    if (!run) return;
    if (expectedRunId && run.runId !== expectedRunId)
      throw Object.assign(
        new Error('This task has already ended. Refresh before stopping another task.'),
        { statusCode: 409 },
      );
    if (run.stopRequested) return;
    run.stopRequested = true;
    run.pluginAbort.abort();
    this.mssql?.cancelRun(run.runId);
    run.snapshot.status = 'Stopping';
    this.emit(id);
    if (run.process.connected) run.process.send({ type: 'abort' }, () => {});
    setTimeout(() => {
      if (this.active.get(id) === run) this.killGroup(run.process);
    }, 3000).unref();
  }
  private killGroup(child: ChildProcess) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Already exited. */
      }
    }
  }
  async close() {
    const exits = [...this.active.values()].map(
      (run) => new Promise<void>((resolve) => run.process.once('close', () => resolve())),
    );
    for (const id of this.active.keys()) this.stop(id);
    await Promise.all(exits);
  }
}
