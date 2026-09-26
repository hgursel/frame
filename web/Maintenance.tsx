import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { RichMarkdown } from './RichMarkdown.js';
import type { MaintenanceSettings, DiscoveryMetadata } from '../shared/maintenance.js';
import type { Project } from '../shared/types.js';
type Status = {
  settings: MaintenanceSettings;
  projects: Project[];
  runs: any[];
  candidates: any[];
  findings: any[];
  methods: any[];
  observations: number;
};
const tabs = ['Overview', 'Methods', 'Review', 'Schedule'] as const;
export function MaintenanceSettingsPanel() {
  const [status, setStatus] = useState<Status>();
  const [form, setForm] = useState<MaintenanceSettings>();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [project, setProject] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api<Status>('/maintenance')
        .then((s) => {
          if (alive) {
            setStatus(s);
            setForm((f) => f || s.settings);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const action = async (path: string, body: unknown = {}, method = 'POST') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(path, method, body);
      setStatus(await api('/maintenance'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!status || !form) return <p>{error || 'Loading project memory…'}</p>;
  const change = <K extends keyof MaintenanceSettings>(key: K, value: MaintenanceSettings[K]) => {
    setForm({ ...form, [key]: value });
    setNotice('');
  };
  const timezones = [
    ...new Set(['UTC', form.timezone, ...Intl.supportedValuesOf('timeZone')]),
  ].sort();
  const dirty = JSON.stringify(form) !== JSON.stringify(status.settings);
  const methods = status.methods.filter((m) => !project || m.projectId === project);
  const candidates = status.candidates.filter((m) => !project || m.projectId === project);
  const running = status.runs.find((r) => ['running', 'paused', 'queued'].includes(r.state));
  const projectName = (id: string) =>
    status.projects.find((p) => p.id === id)?.name || 'Removed project';
  const empty = (title: string, text: string) => (
    <div className="memory-empty">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
  return (
    <div className="maintenance-panel">
      <div className="memory-heading">
        <div>
          <span className="settings-eyebrow">KNOWLEDGE & LEARNING</span>
          <h2>Project memory</h2>
          <p className="muted">
            Useful methods, remembered. Less rediscovery with every conversation.
          </p>
        </div>
        <span className={`memory-badge ${running ? 'is-live' : ''}`}>
          {running ? running.state : form.enabled ? 'Scheduled' : 'On demand'}
        </span>
      </div>
      <div className="memory-tabs" role="tablist" aria-label="Knowledge sections">
        {tabs.map((name, i) => (
          <button
            type="button"
            role="tab"
            key={name}
            id={`memory-tab-${name}`}
            aria-controls={`memory-panel-${name}`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => {
              const index =
                e.key === 'ArrowRight'
                  ? (i + 1) % tabs.length
                  : e.key === 'ArrowLeft'
                    ? (i + tabs.length - 1) % tabs.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (index >= 0) {
                e.preventDefault();
                setTab(tabs[index]!);
                document.getElementById(`memory-tab-${tabs[index]}`)?.focus();
              }
            }}
          >
            {name}
            {name === 'Review' && status.candidates.length > 0 && (
              <span className="memory-count">{status.candidates.length}</span>
            )}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div role="tabpanel" id={`memory-panel-${tab}`} aria-labelledby={`memory-tab-${tab}`}>
        {tab === 'Overview' && (
          <>
            <div className="memory-stats">
              <div>
                <span>Active methods</span>
                <strong>{status.methods.length}</strong>
                <small>Up to 30 per project</small>
              </div>
              <div>
                <span>Ready for review</span>
                <strong>{status.candidates.length}</strong>
                <small>Eligible methods and metadata</small>
              </div>
              <div>
                <span>Patterns observed</span>
                <strong>{status.observations}</strong>
                <small>Waiting for repetition or confirmation</small>
              </div>
            </div>
            <section className="memory-card">
              <div className="memory-card-heading">
                <div>
                  <h3>Keep what works</h3>
                  <p>
                    Frame learns recurring procedures, calculation rules, and parameterized queries.
                    Similar work updates one method instead of creating more files.
                  </p>
                </div>
              </div>
              <ol className="memory-principles">
                <li>
                  <strong>Selective learning</strong>
                  <span>
                    Three distinct chats, or say “remember this method.” Repetition does not verify
                    correctness.
                  </span>
                </li>
                <li>
                  <strong>Relevant recall</strong>
                  <span>
                    A few matching methods are supplied before generation, with cached SQL schema
                    when available.
                  </span>
                </li>
                <li>
                  <strong>Your knowledge stays yours</strong>
                  <span>
                    Uploaded documents and authored pages stay separate. Incognito chats and SQL
                    result values are excluded.
                  </span>
                </li>
              </ol>
            </section>
            <section className="memory-card">
              <div className="memory-card-heading">
                <div>
                  <h3>Maintenance</h3>
                  <p>
                    {running?.message ||
                      status.runs[0]?.message ||
                      'Ready when you are. Manual runs use saved settings.'}
                  </p>
                </div>
                <span className="memory-badge">
                  {form.enabled
                    ? `${form.time} · ${form.timezone.replaceAll('_', ' ')}`
                    : 'Manual schedule'}
                </span>
              </div>
              {running && (
                <progress
                  aria-label="Maintenance progress"
                  value={running.cursor}
                  max={Math.max(1, running.total)}
                />
              )}
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !!running || dirty || !status.settings.projectIds.length}
                  onClick={() => void action('/maintenance/run')}
                >
                  Run maintenance now
                </button>
                <button
                  disabled={busy || !running}
                  onClick={() => void action('/maintenance/stop')}
                >
                  Stop maintenance
                </button>
                <button onClick={() => setTab('Schedule')}>Configure schedule</button>
              </div>
              {dirty && (
                <p className="muted small">
                  Save your schedule changes before running maintenance.
                </p>
              )}
              {!status.settings.projectIds.length && (
                <p className="muted small">Select projects in Schedule to begin.</p>
              )}
            </section>
            <details className="memory-card">
              <summary>
                Recent runs <span className="muted">· {status.runs.length}</span>
              </summary>
              {!status.runs.length && <p className="muted">No runs yet.</p>}
              {status.runs.slice(0, 10).map((r) => (
                <div className="maintenance-run" key={r.id}>
                  <div className="memory-list-heading">
                    <strong>{r.state}</strong>
                    <small>{new Date(r.createdAt).toLocaleString()}</small>
                  </div>
                  <p>{r.message}</p>
                  <small>
                    {r.cursor}/{r.total} items checked
                  </small>
                </div>
              ))}
            </details>
            <details className="memory-card">
              <summary>
                Knowledge health <span className="muted">· {status.findings.length}</span>
              </summary>
              {!status.findings.length && (
                <p className="muted">No findings. Run maintenance to check sources and metadata.</p>
              )}
              {status.findings.map((f) => (
                <div className="maintenance-run" key={f.id}>
                  <strong>{f.kind.replaceAll('-', ' ')}</strong>
                  <p>{f.message}</p>
                  <small>{projectName(f.projectId)}</small>
                </div>
              ))}
            </details>
          </>
        )}
        {(tab === 'Methods' || tab === 'Review') && (
          <>
            <div className="memory-toolbar">
              <div>
                <h3>{tab === 'Methods' ? 'Reusable methods' : 'Review inbox'}</h3>
                <p className="muted">
                  {tab === 'Methods'
                    ? 'Inspect what Frame recalls, or forget a method that no longer helps.'
                    : 'Review a method before it becomes available to normal chats.'}
                </p>
              </div>
              <label>
                Project
                <select
                  aria-label="Filter memory by project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">All projects</option>
                  {status.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {tab === 'Methods' &&
              !methods.length &&
              empty(
                'A little memory goes a long way',
                'Methods appear here after publication. Tell Frame “remember this method,” or let recurring tasks emerge across three chats.',
              )}
            {tab === 'Review' &&
              !candidates.length &&
              empty(
                'Nothing needs review',
                'One-off work stays out of this inbox. Eligible methods appear after repetition or explicit confirmation.',
              )}
            {(tab === 'Methods' ? methods : candidates).map((c) => (
              <details
                className={`memory-card ${tab === 'Review' ? 'maintenance-draft' : 'memory-method'}`}
                key={c.id}
              >
                <summary>
                  <span>{c.title}</span>
                  <span className="memory-badge">
                    {tab === 'Methods'
                      ? c.stale
                        ? 'Schema needs review'
                        : c.verified
                          ? 'Verified'
                          : c.confirmed
                            ? 'Requested'
                            : 'Unverified'
                      : c.sourceKind === 'method'
                        ? 'Method'
                        : 'Page metadata'}
                  </span>
                </summary>
                <p>{c.discovery.description}</p>
                <div className="memory-meta">
                  <span>{projectName(c.projectId)}</span>
                  <span>{c.discovery.category.replaceAll('_', ' ')}</span>
                  {c.sourceKind === 'method' && (
                    <span>
                      {c.occurrences} distinct chat{c.occurrences === 1 ? '' : 's'}
                    </span>
                  )}
                  {tab === 'Methods' && <span>Supplied to {c.uses || 0} turns</span>}
                </div>
                <RichMarkdown text={c.text} />
                <p className="muted small">
                  {tab === 'Methods'
                    ? 'Recall counts show when this method was supplied, not whether the answer was correct. To correct a method, discuss it in chat and explicitly request that it be remembered.'
                    : 'Publishing makes this available for recall. Mark verified only after checking the method against its sources.'}
                </p>
                <div className="button-row">
                  {tab === 'Methods' ? (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Forget this method? The same historical evidence will not automatically recreate it.',
                          )
                        )
                          void action(`/maintenance/methods/${c.id}`, {}, 'DELETE');
                      }}
                    >
                      Forget method
                    </button>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => void action(`/maintenance/drafts/${c.id}/publish`)}
                      >
                        Publish unreviewed
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Have you checked this method against its sources?'))
                            void action(`/maintenance/drafts/${c.id}/publish`, { verified: true });
                        }}
                      >
                        Publish as verified
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void action(`/maintenance/drafts/${c.id}/reject`)}
                      >
                        Reject draft
                      </button>
                    </>
                  )}
                </div>
              </details>
            ))}
          </>
        )}
        {tab === 'Schedule' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const saved = await api<MaintenanceSettings>('/maintenance/settings', 'PUT', form);
                setForm(saved);
                setStatus(await api('/maintenance'));
                setNotice('Maintenance settings saved.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <section className="memory-card">
              <div className="memory-card-heading">
                <div>
                  <h3>Schedule</h3>
                  <p>Run quietly in the background. Interactive chats always take priority.</p>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => change('enabled', e.target.checked)}
                  />
                  Enable daily schedule
                </label>
              </div>
              <div className="maintenance-grid">
                <label>
                  Daily start time
                  <input
                    aria-label="Daily start time"
                    type="time"
                    required
                    value={form.time}
                    onChange={(e) => change('time', e.target.value)}
                  />
                </label>
                <label>
                  Timezone
                  <select
                    aria-label="Maintenance timezone"
                    value={form.timezone}
                    onChange={(e) => change('timezone', e.target.value)}
                  >
                    {timezones.map((z) => (
                      <option key={z} value={z}>
                        {z.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Runtime budget (minutes)
                  <input
                    type="number"
                    min="1"
                    max="480"
                    required
                    value={form.maxMinutes}
                    onChange={(e) => change('maxMinutes', Number(e.target.value))}
                  />
                </label>
              </div>
              <p className="muted small">
                Frame and the local model must be running. Missed schedules catch up once per local
                date. Interrupted items resume at a safe checkpoint.
              </p>
            </section>
            <section className="memory-card">
              <h3>Projects</h3>
              <p className="muted">
                Choose which projects can contribute to learning and health checks.
              </p>
              <div className="memory-projects">
                {status.projects.map((p) => (
                  <label className="check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={form.projectIds.includes(p.id)}
                      onChange={(e) =>
                        change(
                          'projectIds',
                          e.target.checked
                            ? [...form.projectIds, p.id]
                            : form.projectIds.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              {!status.projects.length && <p>Create a project to get started.</p>}
            </section>
            <section className="memory-card">
              <h3>Learning & publication</h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.learnConversations}
                  onChange={(e) => change('learnConversations', e.target.checked)}
                />
                Learn reusable tasks from completed conversations
              </label>
              <label>
                Publishing policy
                <select
                  aria-label="Publishing policy"
                  value={form.policy}
                  onChange={(e) =>
                    change('policy', e.target.value as MaintenanceSettings['policy'])
                  }
                >
                  <option value="review">Review every eligible method before use</option>
                  <option value="new">Publish new methods; review updates</option>
                  <option value="maintain">
                    Publish new methods and explicitly confirmed updates
                  </option>
                </select>
              </label>
              <p className="muted small">
                Verified methods always require review for changes. Automatic publishing never
                verifies a method. Changed rules without explicit confirmation remain drafts.
                Existing authored pages are never replaced by learned methods.
              </p>
            </section>
            <div className="memory-save">
              <span className="muted small">
                {dirty ? 'You have unsaved changes' : 'Settings are up to date'}
              </span>
              <button className="primary" disabled={busy}>
                Save maintenance settings
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
export function KnowledgeMetadata({
  projectId,
  page,
  onSaved,
}: {
  projectId: string;
  page: { id: string; revision: string; metadata?: Record<string, any> };
  onSaved: () => Promise<void>;
}) {
  const metadata = page.metadata || {};
  const [form, setForm] = useState<DiscoveryMetadata>({
    description: metadata.description || '',
    tags: metadata.frame?.tags || [],
    aliases: metadata.frame?.aliases || [],
    category: metadata.frame?.category || 'reference',
  });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details className="knowledge-metadata">
      <summary>Discovery metadata</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api(`/projects/${projectId}/documents/${page.id}/metadata`, 'PUT', {
              revision: page.revision,
              discovery: {
                ...form,
                tags: form.tags.map((t) => t.trim()).filter(Boolean),
                aliases: form.aliases.map((t) => t.trim()).filter(Boolean),
              },
            });
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          When should Frame use this page?
          <textarea
            aria-label="Knowledge description"
            rows={3}
            required
            maxLength={600}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          Tags (comma separated)
          <input
            value={form.tags.join(',')}
            onChange={(e) => setForm({ ...form, tags: e.target.value.split(',') })}
          />
        </label>
        <label>
          Aliases (comma separated)
          <input
            value={form.aliases.join(',')}
            onChange={(e) => setForm({ ...form, aliases: e.target.value.split(',') })}
          />
        </label>
        <label>
          Page category
          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as DiscoveryMetadata['category'] })
            }
          >
            {['reference', 'definition', 'calculation_rule', 'query_recipe', 'procedure'].map(
              (c) => (
                <option key={c} value={c}>
                  {c.replaceAll('_', ' ')}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="muted small">
          Metadata is included at the beginning of exported Markdown pages and used for ranked
          search. Editing clears previous verification.
        </p>
        <button disabled={busy}>Save discovery metadata</button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
