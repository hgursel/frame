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
};
export function MaintenanceSettingsPanel() {
  const [status, setStatus] = useState<Status>();
  const [form, setForm] = useState<MaintenanceSettings>();
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
  const action = async (path: string, body: unknown = {}) => {
    setBusy(true);
    setError('');
    try {
      await api(path, 'POST', body);
      setStatus(await api('/maintenance'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!status || !form) return <p>{error || 'Loading knowledge maintenance…'}</p>;
  const change = <K extends keyof MaintenanceSettings>(key: K, value: MaintenanceSettings[K]) =>
    setForm({ ...form, [key]: value });
  // Keep saved IANA aliases selectable even when the browser lists a different canonical name.
  const timezones = [
    ...new Set(['UTC', form.timezone, ...Intl.supportedValuesOf('timeZone')]),
  ].sort();
  return (
    <div className="maintenance-panel">
      <h2>Knowledge maintenance</h2>
      <p className="muted">
        Check knowledge health and turn reusable work from normal conversations into project
        knowledge. Chat always has priority. Incognito chats and SQL results are excluded.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/maintenance/settings', 'PUT', form);
            setNotice('Maintenance settings saved.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="check">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => change('enabled', e.target.checked)}
          />
          Enable daily schedule
        </label>
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
              required
              value={form.timezone}
              onChange={(e) => change('timezone', e.target.value)}
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
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
              value={form.maxMinutes}
              onChange={(e) => change('maxMinutes', Number(e.target.value))}
            />
          </label>
        </div>
        <p className="muted small">
          The server and local model must be available. A missed time triggers one catch-up run;
          daylight-saving changes never create two runs on the same local date. Unfinished items
          resume on the next run.
        </p>
        <fieldset>
          <legend>Projects to maintain</legend>
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
        </fieldset>
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
            onChange={(e) => change('policy', e.target.value as MaintenanceSettings['policy'])}
          >
            <option value="review">Review every draft before use</option>
            <option value="new">Publish new unreviewed pages; review all updates</option>
            <option value="maintain">
              Publish new pages and maintain unverified learned pages
            </option>
          </select>
        </label>
        <p className="muted small">
          Human-verified pages always require review. Automatic publishing never marks knowledge
          verified. Human-written content is never automatically replaced. Drafts are excluded from
          chat retrieval.
        </p>
        <button className="primary" disabled={busy}>
          Save maintenance settings
        </button>
      </form>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button disabled={busy} onClick={() => void action('/maintenance/run')}>
          Run maintenance now
        </button>
        <button
          disabled={
            busy || !status.runs.some((r) => ['running', 'paused', 'queued'].includes(r.state))
          }
          onClick={() => void action('/maintenance/stop')}
        >
          Stop maintenance
        </button>
      </div>
      <h3>Recent runs</h3>
      {!status.runs.length && <p className="muted">No runs yet. Manual runs use saved settings.</p>}
      {status.runs.map((r) => (
        <div className="maintenance-run" key={r.id}>
          <strong>{r.state}</strong> · {r.cursor}/{r.total} items ·{' '}
          {new Date(r.createdAt).toLocaleString()}
          <p>{r.message}</p>
        </div>
      ))}
      <h3>Review inbox · {status.candidates.length}</h3>
      {status.candidates.map((c) => (
        <details className="maintenance-draft" key={c.id}>
          <summary>
            {c.title} · {c.targetId ? 'Update' : 'New page'} · {c.occurrences} occurrence(s)
          </summary>
          <p className="muted">
            {status.projects.find((p) => p.id === c.projectId)?.name} ·{' '}
            {c.discovery.category.replaceAll('_', ' ')}
          </p>
          <p>{c.discovery.description}</p>
          <p className="muted">{c.discovery.tags.join(' · ')}</p>
          <RichMarkdown text={c.text} />
          <p className="muted small">
            Source {c.sourceKind}: {c.sourceId}. Review the claims and source before publishing.
            Publishing alone does not verify them.
          </p>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() => void action(`/maintenance/drafts/${c.id}/publish`)}
            >
              Publish unreviewed
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm('Have you checked these claims against their sources?'))
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
          </div>
        </details>
      ))}
      <h3>Health findings · {status.findings.length}</h3>
      {status.findings.map((f) => (
        <div className="maintenance-run" key={f.id}>
          <strong>{f.kind.replaceAll('-', ' ')}</strong>
          <p>{f.message}</p>
          <small>
            {status.projects.find((p) => p.id === f.projectId)?.name} · {f.documentId}
          </small>
        </div>
      ))}
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
