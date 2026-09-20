import React, { useEffect, useState, useRef } from 'react';
import { api } from './api.js';
import { RichMarkdown } from './RichMarkdown.js';
import type {
  PublicMssqlSettings,
  SqlApproval,
  SqlResult,
  SchemaStatus,
  SchemaObject,
  NotesStatus,
  NotesPage,
} from '../shared/plugins.js';
export function PluginSettings() {
  const [form, setForm] = useState<PublicMssqlSettings>();
  const [passwords, setPasswords] = useState({ read: '', write: '' });
  const [clear, setClear] = useState({ read: false, write: false });
  const [databases, setDatabases] = useState('');
  const [procedures, setProcedures] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<PublicMssqlSettings>('/plugins/mssql')
      .then((v) => {
        if (live) {
          setForm(v);
          setDatabases(v.databases.join('\n'));
          setProcedures(
            v.procedures.map((p) => [p.database, p.schema, p.name].join(' | ')).join('\n'),
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!form) return <p>{error || 'Loading plugins…'}</p>;
  const change = <K extends keyof PublicMssqlSettings>(key: K, value: PublicMssqlSettings[K]) =>
    setForm({ ...form, [key]: value });
  return (
    <section className="plugin-card">
      <h2>Microsoft SQL Server</h2>
      <p className="muted">Built-in plugin · SQL Authentication</p>
      <p className="warning">
        Intended for development databases. Approved SQL operations can modify or delete data.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setNotice('');
          try {
            const list = procedures
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((line) => {
                const parts = line.split('|').map((s) => s.trim());
                if (parts.length !== 3 || parts.some((s) => !s))
                  throw new Error(
                    'Enter procedures as Database | Schema | Procedure, one per line.',
                  );
                return { database: parts[0]!, schema: parts[1]!, name: parts[2]! };
              });
            const value = await api<PublicMssqlSettings>('/plugins/mssql', 'PUT', {
              ...form,
              databases: databases
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              procedures: list,
              read: {
                username: form.read.username,
                ...(clear.read || passwords.read
                  ? { password: clear.read ? '' : passwords.read }
                  : {}),
              },
              write: {
                username: form.write.username,
                ...(clear.write || passwords.write
                  ? { password: clear.write ? '' : passwords.write }
                  : {}),
              },
            });
            setForm(value);
            setPasswords({ read: '', write: '' });
            setClear({ read: false, write: false });
            setNotice('MSSQL settings saved. Enable the plugin separately for each project.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="settings-topic">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => change('enabled', e.target.checked)}
            />
            Enable MSSQL system-wide
          </label>
          <div className="form-row">
            <label>
              SQL Server host
              <input
                aria-label="SQL Server host"
                value={form.server}
                onChange={(e) => change('server', e.target.value)}
                placeholder="sql-dev.example.internal"
              />
            </label>
            <label>
              SQL Server port
              <input
                type="number"
                min="1"
                max="65535"
                value={form.port}
                onChange={(e) => change('port', Number(e.target.value))}
              />
            </label>
          </div>
          <label>
            Allowed databases
            <textarea
              aria-label="Allowed databases"
              value={databases}
              onChange={(e) => setDatabases(e.target.value)}
              placeholder="One database name per line"
            />
          </label>
          {(['read', 'write'] as const).map((kind) => (
            <fieldset key={kind} className="login-group">
              <legend>{kind === 'read' ? 'Read-only SQL login' : 'Write SQL login'}</legend>
              <label>
                Username
                <input
                  aria-label={`${kind} SQL username`}
                  autoComplete="off"
                  value={form[kind].username}
                  onChange={(e) => change(kind, { ...form[kind], username: e.target.value })}
                />
              </label>
              <label>
                Password
                <input
                  aria-label={`${kind} SQL password`}
                  type="password"
                  autoComplete="new-password"
                  value={passwords[kind]}
                  placeholder={
                    form[kind].hasPassword ? 'Saved — leave blank to keep' : 'Not configured'
                  }
                  onChange={(e) => setPasswords({ ...passwords, [kind]: e.target.value })}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={clear[kind]}
                  onChange={(e) => setClear({ ...clear, [kind]: e.target.checked })}
                />
                Remove saved {kind} password
              </label>
            </fieldset>
          ))}
          <p className="muted small">
            Use a genuinely read-only SQL Server account for automatic queries and metadata. Grant
            the write login only the operations you intend to approve. Host tools run with the Frame
            account's permissions and are not contained by plugin restrictions.
          </p>
          <h3>Allowed operations</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.allowDataChanges}
              onChange={(e) => change('allowDataChanges', e.target.checked)}
            />
            Allow INSERT, UPDATE, and DELETE with approval
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.allowSchemaChanges}
              onChange={(e) => change('allowSchemaChanges', e.target.checked)}
            />
            Allow table/index schema changes with approval (including DROP and TRUNCATE)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.allowProcedures}
              onChange={(e) => change('allowProcedures', e.target.checked)}
            />
            Allow selected stored procedures with approval
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.allowValueSampling}
              onChange={(e) => change('allowValueSampling', e.target.checked)}
            />
            Allow enrichment to read rows from small lookup tables
          </label>
          <p className="muted small">
            Off by default. When on, generating database knowledge reads up to 50 rows from
            referenced tables of 500 rows or fewer, through the read login, so status and type codes
            can be decoded. Those values are stored in generated knowledge pages and appear in
            exports.
          </p>
          <label>
            Allowed stored procedures
            <textarea
              aria-label="Allowed stored procedures"
              rows={4}
              value={procedures}
              onChange={(e) => setProcedures(e.target.value)}
              placeholder="Database | Schema | Procedure (one per line)"
            />
          </label>
          <p className="muted small">
            Procedures may modify data or access other objects internally. Their SQL Server
            permissions remain the final boundary.
          </p>
          <h3>Connection and result limits</h3>
          <p className="muted small">
            Connections are encrypted. Install your organization's CA on the Frame host for
            certificate validation.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.trustServerCertificate}
              onChange={(e) => change('trustServerCertificate', e.target.checked)}
            />
            Trust server certificate without validation
          </label>
          <div className="form-row">
            <label>
              Query timeout (seconds)
              <input
                type="number"
                min="5"
                max="120"
                value={form.timeoutSeconds}
                onChange={(e) => change('timeoutSeconds', Number(e.target.value))}
              />
            </label>
            <label>
              Maximum result rows
              <input
                type="number"
                min="1"
                max="5000"
                value={form.maxRows}
                onChange={(e) => change('maxRows', Number(e.target.value))}
              />
            </label>
          </div>
          <button className="primary">Save MSSQL settings</button>
        </fieldset>
      </form>
      <div className="button-row">
        {(['read', 'write'] as const).map((login) => (
          <button
            key={login}
            disabled={busy || !form.databases.length}
            onClick={async () => {
              setError('');
              setNotice('');
              setBusy(true);
              try {
                const results = [];
                for (const database of form.databases) {
                  const r = await api<SqlResult>('/plugins/mssql/test', 'POST', {
                    database,
                    login,
                  });
                  const row = r.rows[0];
                  const elevated = login === 'read' && row?.slice(2).some((v) => v === 1);
                  results.push(
                    `${database}: connected${elevated ? ' — WARNING: read login has elevated role membership; restrict it in SQL Server' : ''}`,
                  );
                }
                setNotice(
                  results.join('\n') + '\nConnection checks do not prove the login is read-only.',
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Test saved {login} login
          </button>
        ))}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function ProjectPlugins({ projectId }: { projectId: string }) {
  const [savedVersion, setSavedVersion] = useState(0);
  const [enabled, setEnabled] = useState(false),
    [system, setSystem] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    void api<{ mssql: boolean; systemEnabled: boolean }>(`/projects/${projectId}/plugins`)
      .then((v) => {
        if (live) {
          setEnabled(v.mssql);
          setSystem(v.systemEnabled);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [projectId]);
  return (
    <section className="plugin-card">
      <h2>Project plugins</h2>
      <label className="checkbox">
        <input
          type="checkbox"
          aria-label="Enable MSSQL for this project"
          disabled={!loaded || busy}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Microsoft SQL Server
      </label>
      <p className="muted small">
        Uses system database and operation permissions.{' '}
        {system
          ? 'MSSQL is enabled system-wide.'
          : 'Enable and configure MSSQL in Settings → Plugins first.'}
      </p>
      <button
        disabled={!loaded || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api(`/projects/${projectId}/plugins`, 'PUT', { mssql: enabled });
            setNotice('Project plugins saved.');
            setSavedVersion((v) => v + 1);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save project plugins
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <SqlKnowledge key={`${projectId}-${savedVersion}`} projectId={projectId} />
      <SqlGeneratedKnowledge key={`generated-${projectId}-${savedVersion}`} projectId={projectId} />
    </section>
  );
}
export function SqlKnowledge({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState(false),
    [status, setStatus] = useState<SchemaStatus>(),
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [objects, setObjects] = useState<SchemaObject[]>([]),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<SchemaObject>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const selectedRequest = useRef(0);
  useEffect(() => {
    let live = true;
    void api<{ mssql: boolean; systemEnabled: boolean }>(`/projects/${projectId}/plugins`)
      .then((v) => {
        if (live) setEnabled(v.mssql && v.systemEnabled);
      })
      .catch(() => {});
    return () => {
      live = false;
      selectedRequest.current++;
    };
  }, [projectId]);
  const refresh = async () =>
    setStatus(await api<SchemaStatus>(`/projects/${projectId}/mssql/schema/status`));
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const poll = () =>
      void api<SchemaStatus>(`/projects/${projectId}/mssql/schema/status`)
        .then((v) => {
          if (live) setStatus(v);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, projectId]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const timer = setTimeout(() => {
      void api<{ objects: SchemaObject[]; total: number }>(
        `/projects/${projectId}/mssql/schema?q=${encodeURIComponent(query)}&offset=${offset}`,
      )
        .then((v) => {
          if (live) {
            setObjects(v.objects);
            setTotal(v.total);
            setError('');
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled, projectId, query, offset, status?.at, status?.state]);
  if (!enabled) return null;
  return (
    <details className="sql-knowledge">
      <summary>
        SQL schema knowledge {status ? `· ${status.count} objects · ${status.state}` : ''}
      </summary>
      <p className="muted small">
        Cached structure only. Business notes remain in your Markdown pages. Initialization imports
        visible tables, views, keys, relationships, indexes, and procedure parameters.
      </p>
      {status?.progress && <p role="status">{status.progress}</p>}
      {status?.at && (
        <p className="muted small">
          Last completed refresh: {new Date(status.at).toLocaleString()}
        </p>
      )}
      {status?.error && <p className="error">{status.error}</p>}
      {status?.state === 'stale' && (
        <p className="notice">Schema may have changed. Refresh before relying on it.</p>
      )}
      <div className="button-row">
        <button
          disabled={busy || status?.state === 'running'}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api(`/projects/${projectId}/mssql/schema`, 'POST', {});
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {status?.count ? 'Refresh schema' : 'Initialize database knowledge'}
        </button>
        {status?.state === 'running' && (
          <button
            onClick={() =>
              void api(`/projects/${projectId}/mssql/schema/cancel`, 'POST', {})
                .then(refresh)
                .catch((e) => setError(e.message))
            }
          >
            Cancel schema refresh
          </button>
        )}
        <a href={`/api/projects/${projectId}/mssql/schema/export`}>Export schema as OKF</a>
      </div>
      <input
        aria-label="Search SQL schema knowledge"
        placeholder="Search tables, columns, or relationships…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOffset(0);
        }}
      />
      <p className="muted small">
        {total} matching objects{query ? ', most relevant first' : ', most prominent first'}
      </p>
      <div className="schema-results">
        {objects.map((o) => (
          <button
            key={o.id}
            onClick={async () => {
              const n = ++selectedRequest.current;
              try {
                const value = await api<SchemaObject>(
                  `/projects/${projectId}/mssql/schema/objects/${o.id}`,
                );
                if (n === selectedRequest.current) setSelected(value);
              } catch (e) {
                if (n === selectedRequest.current) setError((e as Error).message);
              }
            }}
          >
            {o.database}.{o.schema}.{o.name}
            <small>{o.summary || o.kind}</small>
          </button>
        ))}
      </div>
      <div className="button-row">
        <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>
          Previous objects
        </button>
        <button disabled={offset + 20 >= total} onClick={() => setOffset(offset + 20)}>
          Next objects
        </button>
      </div>
      {selected && (
        <section className="schema-preview">
          <h3>
            {selected.database}.{selected.schema}.{selected.name}
          </h3>
          {selected.obsolete && <p>Obsolete or no longer visible.</p>}
          <RichMarkdown text={selected.text} />
          {selected.text.includes('## Notes') && (
            <div className="button-row">
              <button
                onClick={() =>
                  void api(`/projects/${projectId}/mssql/notes/decide`, 'POST', {
                    database: selected.database,
                    schema: selected.schema,
                    name: selected.name,
                    accept: true,
                  })
                    .then(() => setSelected({ ...selected }))
                    .catch((e) => setError((e as Error).message))
                }
              >
                Mark note reviewed
              </button>
              <button
                onClick={() =>
                  void api(`/projects/${projectId}/mssql/notes/decide`, 'POST', {
                    database: selected.database,
                    schema: selected.schema,
                    name: selected.name,
                    accept: false,
                  })
                    .then(() => setSelected({ ...selected }))
                    .catch((e) => setError((e as Error).message))
                }
              >
                Reject note
              </button>
            </div>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
export function SqlGeneratedKnowledge({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<NotesStatus>(),
    [pages, setPages] = useState<NotesPage[]>([]),
    [gaps, setGaps] = useState<{ term: string; seen: number; resolved?: string }[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ mssql: boolean; systemEnabled: boolean }>(`/projects/${projectId}/plugins`)
      .then((v) => live && setEnabled(v.mssql && v.systemEnabled))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const poll = () =>
      void api<NotesStatus>(`/projects/${projectId}/mssql/notes/status`)
        .then((v) => live && setStatus(v))
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, projectId]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const timer = setTimeout(() => {
      void api<{ pages: NotesPage[] }>(
        `/projects/${projectId}/mssql/notes/pages?q=${encodeURIComponent(query)}`,
      )
        .then((v) => live && setPages(v.pages))
        .catch((e) => live && setError(e.message));
      void api<{ gaps: typeof gaps }>(`/projects/${projectId}/mssql/notes/gaps`)
        .then((v) => live && setGaps(v.gaps))
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled, projectId, query, status?.at, status?.state]);
  if (!enabled) return null;
  return (
    <details className="sql-knowledge">
      <summary>
        Generated database knowledge {status ? `· ${status.count} items · ${status.state}` : ''}
      </summary>
      <p className="muted small">
        A local model reads the cached catalog and writes subject areas, a glossary of repeated
        abbreviations, per-object notes, and recipes from queries that already ran. All of it is
        interpretation, not catalog fact, and is labelled with the model that wrote it. Notes are
        validated against real column names before they are stored.
      </p>
      {status?.progress && <p role="status">{status.progress}</p>}
      {status?.error && <p className="error">{status.error}</p>}
      <div className="button-row">
        <button
          disabled={busy || status?.state === 'running'}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api(`/projects/${projectId}/mssql/notes`, 'POST', {});
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {status?.count ? 'Update generated knowledge' : 'Generate database knowledge'}
        </button>
        {status?.state === 'running' && (
          <button
            onClick={() =>
              void api(`/projects/${projectId}/mssql/notes/cancel`, 'POST', {}).catch((e) =>
                setError(e.message),
              )
            }
          >
            Cancel
          </button>
        )}
      </div>
      <input
        aria-label="Search generated database knowledge"
        placeholder="Search subject areas, glossary, recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="schema-results">
        {pages.map((p) => (
          <article key={p.id}>
            <h4>
              {p.title} <small>{p.kind}</small>
            </h4>
            <RichMarkdown text={p.body} />
          </article>
        ))}
      </div>
      {!!gaps.length && (
        <p className="muted small">
          Searches that found nothing:{' '}
          {gaps
            .map((g) => `${g.term}${g.resolved ? ` → ${g.resolved}` : ''} (${g.seen})`)
            .join(', ')}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
export function SqlApprovalCard({ approval, chatId }: { approval: SqlApproval; chatId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="sql-approval" aria-label="SQL change approval">
      <h3>
        Approve SQL{' '}
        {approval.kind === 'procedure'
          ? 'procedure'
          : approval.kind === 'schema'
            ? 'schema change'
            : 'data change'}
        ?
      </h3>
      <p>
        Database: <strong>{approval.database}</strong> · Write login
      </p>
      <pre>{approval.sql}</pre>
      {!!approval.parameters.length && <pre>{JSON.stringify(approval.parameters, null, 2)}</pre>}
      <p className="muted small">
        Approval applies once to this exact request. Procedures can change data internally.
        Cancelling an executing change may leave an uncertain outcome; verify before retrying.
      </p>
      <div className="button-row">
        {[false, true].map((approve) => (
          <button
            key={String(approve)}
            disabled={busy || Date.now() >= approval.expiresAt}
            className={approve ? 'danger-button' : ''}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api(`/conversations/${chatId}/sql-approvals/${approval.id}`, 'POST', {
                  runId: approval.runId,
                  approve,
                });
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {approve ? 'Approve SQL change' : 'Deny SQL change'}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export function SqlResultTable({ result, chatId }: { result: SqlResult; chatId: string }) {
  return (
    <div className="sql-result">
      <p>
        {result.affected} affected rows{result.truncated ? ' · Result limit reached' : ''}
      </p>
      <div className="markdown-table">
        <table>
          <thead>
            <tr>
              {result.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j}>{v == null ? 'NULL' : String(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Bounded preview. CSV contains the returned rows up to the configured limit.
      </p>
      {result.artifactNotice && <p className="notice">{result.artifactNotice}</p>}
      {result.csv && (
        <a href={`/api/conversations/${chatId}/artifacts/${encodeURIComponent(result.csv)}`}>
          Download SQL results CSV
        </a>
      )}
    </div>
  );
}
