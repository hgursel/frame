import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatSnapshot, WorkerOutput, WorkerInput } from '../shared/types.js';
import { readHistory } from './history.js';
import { Store } from './store.js';

type ActiveRun = {
  process: ChildProcess;
  projectId: string;
  runId: string;
  snapshot: ChatSnapshot;
  stopRequested: boolean;
};
export class Runner extends EventEmitter {
  readonly active = new Map<string, ActiveRun>();
  constructor(readonly store: Store) {
    super();
    this.setMaxListeners(100);
  }
  snapshot(id: string): ChatSnapshot {
    const live = this.active.get(id);
    if (live) return live.snapshot;
    const last = this.store.db
      .prepare(
        'SELECT status, error FROM runs WHERE conversationId=? ORDER BY createdAt DESC, rowid DESC LIMIT 1',
      )
      .get(id) as { status: string; error?: string } | undefined;
    return {
      messages: readHistory(this.store.sessionFile(id)),
      running: false,
      status: last?.status || 'Ready',
      error: last?.error || undefined,
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
    const project = this.store.project(conversation.projectId)!;
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
    const history = readHistory(this.store.sessionFile(id));
    this.store.db
      .prepare('INSERT INTO runs VALUES (?, ?, ?, NULL, ?)')
      .run(runId, id, 'running', Date.now());
    if (conversation.title === 'New conversation')
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
      snapshot: { messages: history, running: true, status: 'Starting local model' },
      stopRequested: false,
    };
    this.active.set(id, active);
    let completed = false;
    let error: string | undefined;
    const deadline = setTimeout(() => {
      error = 'Task reached the 10-minute limit and was stopped.';
      this.stop(id);
    }, 600_000);
    child.on('message', (event: WorkerOutput) => {
      if (event.type === 'snapshot') {
        active.snapshot = {
          messages: event.messages,
          running: true,
          status: active.stopRequested ? 'Stopping' : event.status,
        };
        this.emit(id);
      } else {
        completed = event.type === 'done';
        error ||= event.error;
      }
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      this.killGroup(child);
      const status = error
        ? 'failed'
        : active.stopRequested
          ? 'stopped'
          : completed
            ? 'completed'
            : 'interrupted';
      if (status === 'interrupted')
        error = 'Agent process exited unexpectedly. Review history before retrying.';
      this.store.db
        .prepare('UPDATE runs SET status=?, error=? WHERE id=?')
        .run(status, error || null, runId);
      this.active.delete(id);
      this.emit(id);
    };
    child.once('error', () => {
      error = 'Agent process failed to start.';
      finish();
    });
    child.once('exit', finish);
    child.send(
      {
        cwd: this.store.projectPath(project.id),
        agentDir: path.join(this.store.root, 'agent', id),
        sessionFile: this.store.sessionFile(id),
        artifactDir: this.store.artifacts(conversation),
        settings,
        project,
        prompt,
        documents,
        pythonPath,
        knowledge,
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
  stop(id: string) {
    const run = this.active.get(id);
    if (!run) return;
    run.stopRequested = true;
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
      (run) => new Promise<void>((resolve) => run.process.once('exit', () => resolve())),
    );
    for (const id of this.active.keys()) this.stop(id);
    await Promise.all(exits);
  }
}
