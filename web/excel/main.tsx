import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../api.js';
import type { Project, ChatSnapshot } from '../../shared/types.js';
import type { ExcelProposal, ExcelSelection } from '../../shared/excel.js';
import { captureSelection, verifyProposal, applyProposal } from './workbook.js';
import { RichMarkdown } from '../RichMarkdown.js';
import { LibraryReader } from '../Library.js';
import { QuestionCard } from '../QuestionCard.js';
import './style.css';

type Session = { conversationId: string; clientKey: string };
type State = { snapshot: ChatSnapshot; proposals: ExcelProposal[] };
async function sessionApi<T>(
  session: Session,
  suffix = '',
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/excel/sessions/${session.conversationId}${suffix}`, {
    method,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(60000),
    headers: {
      'x-frame-excel-key': session.clientKey,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('frame-signed-out'));
    throw Object.assign(new Error(data?.error || `Request failed (${response.status}).`), {
      status: response.status,
    });
  }
  if (data === undefined) throw new Error('The server returned an unreadable response.');
  return data;
}
function Preview({ proposal }: { proposal: ExcelProposal }) {
  const [page, setPage] = useState(0);
  const change = proposal.change;
  const start = page * 25;
  return (
    <details className="excel-preview" open>
      <summary>
        {change.target === 'new_sheet'
          ? `New sheet: ${change.sheetName}`
          : `Replace ${proposal.baseline.address}`}
      </summary>
      <p>
        {change.values.length} rows × {change.values[0]!.length} columns
        {change.table ? ' · Excel table' : ''}
        {change.chart ? ` · ${change.chart} chart` : ''}
      </p>
      {proposal.sourceNotice && <p>{proposal.sourceNotice}</p>}
      {change.target === 'selection' && (
        <p className="excel-warning">
          Replaces all values and formulas in this range. Formatting is retained. Review formulas as
          well as values.
        </p>
      )}
      <div className="excel-grid-scroll">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              {change.values[0]!.map((_, i) => (
                <th key={i}>Column {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {change.values.slice(start, start + 25).map((row, r) => (
              <tr key={r}>
                <th>{start + r + 1}</th>
                {row.map((cell, c) => {
                  const formula = change.formulas.find(
                    (f) => f.row === start + r && f.column === c,
                  )?.formula;
                  const previous =
                    change.target === 'selection'
                      ? proposal.baseline.formulas[start + r]?.[c]
                      : undefined;
                  return (
                    <td key={c}>
                      {previous !== undefined && (
                        <small>
                          Before: {String(previous ?? '')}
                          <br />
                          After:{' '}
                        </small>
                      )}
                      <span className={formula ? 'excel-formula' : ''}>
                        {formula || String(cell ?? '')}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {change.values.length > 25 && (
        <div className="excel-actions">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Previous rows
          </button>
          <span>
            {start + 1}–{Math.min(start + 25, change.values.length)}
          </span>
          <button disabled={start + 25 >= change.values.length} onClick={() => setPage(page + 1)}>
            Next rows
          </button>
        </div>
      )}
    </details>
  );
}
function App() {
  const [ready, setReady] = useState(false),
    [officeError, setOfficeError] = useState('');
  const [signedIn, setSignedIn] = useState(false),
    [password, setPassword] = useState('');
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState('');
  const [session, setSession] = useState<Session>(),
    [state, setState] = useState<State>();
  const [selection, setSelection] = useState<ExcelSelection>(),
    [text, setText] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const applying = useRef(false),
    pollVersion = useRef(0);
  const outbox = useRef<{ requestId: string; text: string; selection: ExcelSelection } | undefined>(
    undefined,
  );
  const loadProjects = async () => {
    const list = await api<Project[]>('/projects');
    setProjects(list);
    setProject((p) => p || list[0]?.id || '');
    setSignedIn(true);
  };
  useEffect(() => {
    const signedOut = () => setSignedIn(false);
    window.addEventListener('frame-signed-out', signedOut);
    return () => window.removeEventListener('frame-signed-out', signedOut);
  }, []);
  useEffect(() => {
    void loadProjects().catch(() => {});
    if (location.protocol !== 'https:') {
      setOfficeError(
        'Set up trusted HTTPS first. Open Settings → Frame for Excel in your browser.',
      );
      return;
    }
    if (typeof Office === 'undefined') {
      setOfficeError(
        'Microsoft Office.js could not load. Check connectivity to Microsoft’s Office.js CDN, then reopen this pane.',
      );
      return;
    }
    void Office.onReady()
      .then((info) => {
        if (info.host !== Office.HostType.Excel)
          setOfficeError('Open this page using the Frame for Excel add-in in Excel Desktop.');
        else if (!Office.context.requirements.isSetSupported('ExcelApi', '1.16'))
          setOfficeError('Update Microsoft 365 Excel. This pilot requires ExcelApi 1.16 or later.');
        else setReady(true);
      })
      .catch(() => setOfficeError('Excel initialization failed. Close and reopen this pane.'));
  }, []);
  useEffect(() => {
    if (!session || !signedIn) return;
    let alive = true;
    const refresh = async () => {
      const version = ++pollVersion.current;
      try {
        const data = await sessionApi<State>(session);
        if (alive && version === pollVersion.current) setState(data);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [session, signedIn]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (session) {
      const v = ++pollVersion.current;
      const data = await sessionApi<State>(session);
      if (v === pollVersion.current) setState(data);
    }
  };
  const execute = async (proposal: ExcelProposal) => {
    if (!session || applying.current) return;
    applying.current = true;
    try {
      await verifyProposal(proposal); // No server claim or workbook writes on a stale preview.
      await sessionApi(session, `/proposals/${proposal.id}`, 'POST', { action: 'claim' });
      // From this point, errors can have partial effects. Never automatically retry Apply.
      let result: string;
      try {
        result = await applyProposal(proposal);
      } catch (e) {
        const message = `Execution did not finish cleanly. Inspect the workbook before requesting new changes. ${(e as Error).message}`;
        await sessionApi(session, `/proposals/${proposal.id}`, 'POST', {
          action: 'unknown',
          result: message.slice(0, 1000),
        }).catch(() => {});
        throw new Error(message);
      }
      try {
        await sessionApi(session, `/proposals/${proposal.id}`, 'POST', {
          action: 'applied',
          result,
        });
      } catch {
        throw new Error(
          'Excel completed the change, but Frame did not acknowledge the receipt. Do not apply it again. Inspect the workbook and start a fresh session if needed.',
        );
      }
      setNotice(`${result} Send a follow-up with a fresh selection to continue.`);
    } finally {
      applying.current = false;
      await refresh().catch(() => {});
    }
  };
  const pending = state?.proposals.some((p) => p.status === 'pending' || p.status === 'applying');
  return (
    <main className="excel-app">
      <header>
        <span className="excel-mark">F</span>
        <div>
          <h1>Frame for Excel</h1>
          <p>Your knowledge. Your infrastructure.</p>
        </div>
        <span className="excel-badge">Pilot</span>
      </header>
      {officeError && (
        <p role="alert" className="excel-warning">
          {officeError}
        </p>
      )}
      {error && (
        <p role="alert" className="excel-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="excel-notice">
          {notice}
        </p>
      )}
      {!signedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api('/auth/login', 'POST', { password });
              setPassword('');
              await loadProjects();
            });
          }}
        >
          <h2>Connect to Frame</h2>
          <p>{location.origin}</p>
          <label>
            Frame administrator password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy || !!officeError}>
            Sign in
          </button>
          <p className="excel-small">
            Use your Frame password. Microsoft 365 and SQL credentials are not entered here.
            Complete first-run Frame setup in your browser.
          </p>
        </form>
      ) : (
        <>
          <label>
            Frame project
            <select
              value={project}
              disabled={busy || !!session}
              onChange={(e) => setProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {!session ? (
            <>
              <button
                className="primary"
                disabled={!ready || !project || busy}
                onClick={() =>
                  void action(async () => {
                    setSession(
                      await api<Session>('/excel/sessions', 'POST', { projectId: project }),
                    );
                  })
                }
              >
                Start Excel conversation
              </button>
              <p className="excel-small">
                Uses this project’s knowledge and enabled read-only SQL connection. Workbook context
                stays separate from project knowledge. Closing or reloading the pane starts a new
                conversation; saved history remains in Frame.
              </p>
            </>
          ) : (
            <>
              <div className="excel-actions">
                <button
                  disabled={busy || !!state?.snapshot.running || pending}
                  onClick={() => {
                    setSession(undefined);
                    setState(undefined);
                    setSelection(undefined);
                    setText('');
                    outbox.current = undefined;
                  }}
                >
                  New conversation
                </button>
                <a href={`${location.origin}/`} target="_blank" rel="noreferrer">
                  Open Frame ↗
                </a>
              </div>
              <section className="excel-context">
                <strong>Workbook context</strong>
                <p>
                  {selection
                    ? `${selection.address} · ${selection.values.length} × ${selection.values[0]!.length} cells`
                    : 'Select cells in Excel, then capture the selection.'}
                </p>
                <button
                  disabled={!ready || busy || state?.snapshot.running || pending}
                  onClick={() => void action(async () => setSelection(await captureSelection()))}
                >
                  Capture selection
                </button>
                <p className="excel-small">
                  Up to 2,000 cells / 64 KB. Capture again after selecting another range. Context is
                  refreshed when you send.
                </p>
              </section>
              <section aria-label="Excel conversation" className="excel-messages">
                {state?.snapshot.messages.map((m, i) =>
                  m.role === 'tool' ? (
                    <details key={i}>
                      <summary>
                        {m.failed ? 'Failed: ' : ''}
                        {m.name || 'Tool'}
                      </summary>
                      <pre>{m.text}</pre>
                    </details>
                  ) : (
                    <article key={i} className={`excel-message ${m.role}`}>
                      <strong>{m.role === 'user' ? 'You' : 'Frame'}</strong>
                      <RichMarkdown text={m.text} />
                    </article>
                  ),
                )}
              </section>
              {state?.snapshot.question && (
                <QuestionCard
                  key={state.snapshot.question.id}
                  request={state.snapshot.question}
                  chatId={session.conversationId}
                />
              )}
              {state?.proposals.map((p) => (
                <section key={p.id} className="excel-proposal">
                  <div className="excel-proposal-heading">
                    <h2>{p.summary}</h2>
                    <span className="excel-badge">{p.status}</span>
                  </div>
                  {p.status === 'pending' && (
                    <>
                      <Preview proposal={p} />
                      <div className="excel-actions">
                        <button
                          disabled={busy || state.snapshot.running}
                          onClick={() =>
                            void action(async () => {
                              await sessionApi(session, `/proposals/${p.id}`, 'POST', {
                                action: 'reject',
                              });
                              await refresh();
                            })
                          }
                        >
                          Reject
                        </button>
                        <button
                          className="primary"
                          disabled={busy || !ready || state.snapshot.running}
                          onClick={() => void action(() => execute(p))}
                        >
                          Apply changes
                        </button>
                      </div>
                      <p className="excel-small">
                        Apply rechecks the captured cells first. Save a workbook copy before
                        substantial edits; failed batches can have partial effects.
                      </p>
                    </>
                  )}
                  {p.status === 'applying' && (
                    <div className="excel-warning">
                      <p>
                        Apply was claimed. If the connection failed, inspect the workbook; never
                        replay this batch.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await sessionApi(session, `/proposals/${p.id}`, 'POST', {
                              action: 'unknown',
                              result:
                                'User closed an uncertain Apply after inspecting the workbook. Do not replay.',
                            });
                            await refresh();
                          })
                        }
                      >
                        I inspected the workbook — close this batch
                      </button>
                    </div>
                  )}
                  {p.result && <p>{p.result}</p>}
                </section>
              ))}
              <p role="status" className="excel-small">
                {state?.snapshot.status || 'Ready'}
                {state?.snapshot.error ? ` · ${state.snapshot.error}` : ''}
              </p>
              {state?.snapshot.running && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api(`/conversations/${session.conversationId}/stop`, 'POST', {
                        runId: state.snapshot.runId,
                      });
                      await refresh();
                    })
                  }
                >
                  Stop
                </button>
              )}
              <form
                className="excel-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    if (!outbox.current) {
                      const current = await captureSelection();
                      setSelection(current);
                      outbox.current = { requestId: crypto.randomUUID(), text, selection: current };
                    }
                    try {
                      await sessionApi(session, '/messages', 'POST', outbox.current);
                    } catch (e) {
                      const status = (e as { status?: number }).status;
                      if (status && status >= 400 && status < 500) outbox.current = undefined;
                      else
                        throw new Error(
                          'Send was not acknowledged. Retry original request safely using the same request ID, or review history before starting another conversation.',
                        );
                      throw e;
                    }
                    outbox.current = undefined;
                    setText('');
                    await refresh();
                  });
                }}
              >
                <label>
                  Ask Frame
                  <textarea
                    disabled={!!outbox.current}
                    placeholder="Explain a formula, reconcile data, or import a SQL result…"
                    maxLength={16000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={
                    !ready ||
                    busy ||
                    !text.trim() ||
                    !selection ||
                    pending ||
                    state?.snapshot.running
                  }
                >
                  {outbox.current ? 'Retry original request' : 'Send'}
                </button>
              </form>
            </>
          )}
        </>
      )}
      <LibraryReader />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
