import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { ConversationMessages } from './ConversationMessages.js';
import type { ChatSnapshot, Project } from '../shared/types.js';
import {
  timingLabel,
  type ScheduledTask,
  type ScheduledRun,
  type ScheduleTiming,
} from '../shared/scheduled.js';
import './scheduled.css';
const when = (at: number | null, timezone: string) =>
  at === null
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(at);
export function ScheduledSettings() {
  const [zone, setZone] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ timezone: string }>('/admin/scheduled')
      .then((v) => setZone(v.timezone))
      .catch((e) => setNotice(e.message));
  }, []);
  return (
    <section>
      <h2>Scheduled</h2>
      <p>
        All schedules use one workspace timezone. Changing it pauses scheduling until users review
        and activate their tasks again.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api('/admin/scheduled', 'PUT', { timezone: zone });
            setNotice('Timezone saved. Changed schedules need activation.');
          } catch (e: any) {
            setNotice(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Schedule timezone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="UTC">UTC</option>
            {[...new Set([zone, ...Intl.supportedValuesOf('timeZone')])]
              .filter((v) => v && v !== 'UTC')
              .map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy || !zone}>Save schedule timezone</button>
        <p role="status">{notice}</p>
      </form>
      <p className="muted">
        Frame’s server must stay running. Browsers can be closed. After downtime, only the latest
        missed occurrence runs. Times follow daylight saving changes; nonexistent times and
        unavailable monthly days are skipped.
      </p>
    </section>
  );
}
function TaskEditor({
  task,
  onSaved,
  onCancel,
}: {
  task: ScheduledTask;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [instructions, setInstructions] = useState(task.instructions);
  const [timing, setTiming] = useState(task.timing);
  const [recipients, setRecipients] = useState(task.recipients.join(', '));
  const [attachments, setAttachments] = useState(task.attachments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="scheduled-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await api(`/scheduled/${task.id}`, 'PATCH', {
            revision: task.revision,
            title,
            instructions,
            timing,
            recipients: recipients
              .split(/[,;\n]+/)
              .map((v) => v.trim())
              .filter(Boolean),
            attachments,
          });
          onSaved();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Task title
        <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Task instructions
        <textarea
          required
          rows={6}
          maxLength={16000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <div className="scheduled-fields">
        <label>
          Repeat
          <select
            value={timing.kind}
            onChange={(e) =>
              setTiming({
                ...timing,
                kind: e.target.value as ScheduleTiming['kind'],
                weekday: timing.weekday ?? 1,
                day: timing.day ?? 1,
              })
            }
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label>
          Time ({task.timezone})
          <input
            type="time"
            required
            value={timing.time}
            onChange={(e) => setTiming({ ...timing, time: e.target.value })}
          />
        </label>
        {timing.kind === 'once' && (
          <label>
            Date
            <input
              type="date"
              required
              value={timing.date || ''}
              onChange={(e) => setTiming({ ...timing, date: e.target.value })}
            />
          </label>
        )}
        {timing.kind === 'weekly' && (
          <label>
            Weekday
            <select
              value={timing.weekday ?? 1}
              onChange={(e) => setTiming({ ...timing, weekday: Number(e.target.value) })}
            >
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                (v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {timing.kind === 'monthly' && (
          <label>
            Day of month
            <input
              type="number"
              min={1}
              max={31}
              required
              value={timing.day ?? 1}
              onChange={(e) => setTiming({ ...timing, day: Number(e.target.value) })}
            />
          </label>
        )}
      </div>
      <label>
        Email recipients
        <input
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="Exact email addresses, separated by commas"
        />
      </label>
      <label>
        Attachments
        <select
          value={attachments}
          onChange={(e) => setAttachments(e.target.value as ScheduledTask['attachments'])}
        >
          <option value="none">None</option>
          <option value="generated">Generated outputs requested in the instructions</option>
        </select>
      </label>
      <p className="muted">Saving pauses this task until you review and activate it again.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button disabled={busy}>Save for review</button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function TaskCard({
  task,
  onChange,
  onOpen,
  projectName,
}: {
  task: ScheduledTask;
  onChange: () => void;
  onOpen?: () => void;
  projectName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(name: string) {
    if (
      name === 'delete' &&
      !window.confirm('Delete this scheduled task and its run history and outputs?')
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(
        `/scheduled/${task.id}${name === 'delete' ? '' : '/' + name}`,
        name === 'delete' ? 'DELETE' : 'POST',
        { revision: task.revision },
      );
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="scheduled-card" aria-label={task.title}>
      <div className="scheduled-heading">
        <h3>{task.title}</h3>
        <span className={`scheduled-state ${task.state}`}>
          {task.state === 'draft' ? 'Needs activation' : task.state}
        </span>
      </div>
      {projectName && <p className="muted">{projectName}</p>}
      {editing ? (
        <TaskEditor
          key={task.revision}
          task={task}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChange();
          }}
        />
      ) : (
        <>
          <p>
            <strong>{timingLabel(task.timing)}</strong> · {task.timezone}
          </p>
          <p className="scheduled-instructions">{task.instructions}</p>
          <dl>
            <dt>Email to</dt>
            <dd>{task.recipients.join(', ') || 'No email delivery'}</dd>
            <dt>Attachments</dt>
            <dd>
              {task.attachments === 'generated' ? 'Generated outputs requested above' : 'None'}
            </dd>
            <dt>Next run</dt>
            <dd>{when(task.nextRunAt, task.timezone)}</dd>
          </dl>
          {task.state === 'draft' && (
            <p className="muted">
              Activate authorizes future runs using this project's current tools and enabled skills,
              and automatic emails to these recipients. Failures appear here and are emailed to your
              account address when available.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="button-row">
            {task.state === 'draft' && (
              <button disabled={busy} onClick={() => void action('activate')}>
                Activate
              </button>
            )}
            {task.state === 'active' && (
              <button disabled={busy} onClick={() => void action('pause')}>
                Pause
              </button>
            )}
            {task.state === 'paused' && (
              <button disabled={busy} onClick={() => void action('resume')}>
                Resume
              </button>
            )}
            {task.state !== 'draft' && (
              <button disabled={busy} onClick={() => void action('run')}>
                Run now
              </button>
            )}
            <button disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
            {onOpen && <button onClick={onOpen}>View in Scheduled Tasks</button>}
            <button disabled={busy} onClick={() => void action('delete')}>
              Delete
            </button>
          </div>
        </>
      )}
    </article>
  );
}
export function ScheduleCards({
  tasks,
  onOpen,
  refresh,
}: {
  tasks: ScheduledTask[];
  onOpen: () => void;
  refresh: () => void;
}) {
  return (
    <div className="schedule-cards">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} onChange={refresh} onOpen={onOpen} />
      ))}
    </div>
  );
}
function RunResult({ run, timezone }: { run: ScheduledRun; timezone: string }) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>();
  const [files, setFiles] = useState<{ name: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void Promise.all([
        api<ChatSnapshot>(`/conversations/${run.conversationId}`),
        api<{ name: string }[]>(`/conversations/${run.conversationId}/artifacts`),
      ])
        .then(([s, f]) => {
          if (live) {
            setSnapshot(s);
            setFiles(f);
            setError('');
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [run.conversationId]);
  return (
    <section className="scheduled-result">
      <h3>Run result</h3>
      <p>
        {when(run.startedAt, timezone)} · {run.status}
      </p>
      {(error || run.error) && (
        <p className="error" role="alert">
          {error || run.error}
        </p>
      )}
      {run.notification && <p className="muted">Failure notification: {run.notification}</p>}
      {snapshot && (
        <ConversationMessages
          snapshot={snapshot}
          chatId={run.conversationId}
          connected={!error}
          stopping={false}
          canSave={false}
          onSave={() => {}}
        />
      )}
      {!!files.length && (
        <>
          <h4>Outputs</h4>
          <ul>
            {files.map((f) => (
              <li key={f.name}>
                <a
                  href={`/api/conversations/${run.conversationId}/artifacts/${encodeURIComponent(f.name)}`}
                  download
                >
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {snapshot?.emails?.map((e) => (
        <p key={e.id}>
          Email to {e.to.join(', ')}:{' '}
          {e.status === 'draft'
            ? 'Prepared for automatic delivery after this run completes.'
            : e.message}
        </p>
      ))}
    </section>
  );
}
export function ScheduledPanel({ projects }: { projects: Project[] }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const [selected, setSelected] = useState('');
  const [runs, setRuns] = useState<ScheduledRun[]>([]);
  const [runId, setRunId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  useEffect(() => {
    let live = true;
    const load = () => {
      void api<{ tasks: ScheduledTask[]; timezone: string }>('/scheduled')
        .then((v) => {
          if (live) {
            setTasks(v.tasks);
            setTimezone(v.timezone);
            setSelected((id) => (v.tasks.some((t) => t.id === id) ? id : v.tasks[0]?.id || ''));
            setError('');
            setLoading(false);
          }
        })
        .catch((e) => {
          if (live) {
            setError(e.message);
            setLoading(false);
          }
        });
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [refreshKey]);
  useEffect(() => {
    setRuns([]);
    setRunId('');
    if (!selected) return;
    let live = true;
    const load = () => {
      void api<ScheduledRun[]>(`/scheduled/${selected}/runs`)
        .then((v) => {
          if (live) {
            setRuns(v);
            setRunId((id) => (v.some((r) => r.id === id) ? id : v[0]?.id || ''));
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected, refreshKey]);
  const task = tasks.find((t) => t.id === selected);
  const run = runs.find((r) => r.id === runId);
  return (
    <section className="scheduled-panel">
      <div className="scheduled-heading">
        <div>
          <h1>Scheduled Tasks</h1>
        </div>
        <span className="muted">{timezone}</span>
      </div>
      <p className="muted">
        Ask Frame in a project chat to schedule work, then activate the review card.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading schedules…</p>
      ) : !tasks.length ? (
        <div className="scheduled-empty">
          <h2>Your next task, already planned.</h2>
          <p>Try “Every Monday at 7 AM, summarize last week’s data and email me a PDF.”</p>
        </div>
      ) : (
        <div className="scheduled-layout">
          <nav aria-label="Scheduled tasks">
            {tasks.map((t) => (
              <button
                key={t.id}
                className={selected === t.id ? 'selected' : ''}
                aria-current={selected === t.id ? 'true' : undefined}
                onClick={() => setSelected(t.id)}
              >
                <strong>{t.title}</strong>
                <span>
                  {t.state === 'draft' ? 'Needs activation' : t.state} · {timingLabel(t.timing)}
                </span>
              </button>
            ))}
          </nav>
          <div>
            {task && (
              <TaskCard
                key={task.id}
                task={task}
                onChange={refresh}
                projectName={projects.find((p) => p.id === task.projectId)?.name}
              />
            )}
            <section className="scheduled-history">
              <h3>Run history</h3>
              {!runs.length ? (
                <p className="muted">No runs yet.</p>
              ) : (
                <label>
                  Run
                  <select value={runId} onChange={(e) => setRunId(e.target.value)}>
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {when(r.startedAt, timezone)} · {r.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>
            {run && <RunResult key={run.id} run={run} timezone={timezone} />}
          </div>
        </div>
      )}
    </section>
  );
}
