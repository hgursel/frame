import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../api.js';
import type { Project, ChatSnapshot } from '../../shared/types.js';
import {
  DEFAULT_EXCEL_LIMITS,
  type ExcelLimits,
  type ExcelProposal,
  type ExcelSelection,
  type ExcelProposalSummary,
  type ExcelInspection,
} from '../../shared/excel.js';
import { captureSelection, verifyProposal, applyProposal, watchSelection } from './workbook.js';
import { handleWorkbookRequest } from './operations.js';
import {
  actionLabel,
  isStructural,
  isWorkbookProposal,
  type AnyExcelProposal,
  type WorkbookProposal,
  type WorkbookRequest,
} from '../../shared/excel-workbook.js';
import { ConversationMessages } from '../ConversationMessages.js';
import { LibraryReader } from '../Library.js';
import { QuestionCard } from '../QuestionCard.js';
import './style.css';
import '../activity.css';

type Session = { conversationId: string; clientKey: string };
type State = {
  snapshot: ChatSnapshot;
  proposals: ExcelProposalSummary[];
  inspection?: ExcelInspection;
  workbookRequest?: { id: string; runId: string };
};
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
function Preview({
  proposal,
  formulasOnly = false,
  readOnly = false,
}: {
  proposal: ExcelProposal;
  formulasOnly?: boolean;
  readOnly?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [columnPage, setColumnPage] = useState(0);
  const change = proposal.change;
  const formulas = useMemo(
    () => new Map(change.formulas.map((f) => [`${f.row}:${f.column}`, f.formula])),
    [change.formulas],
  );
  const start = page * 25;
  const firstColumn = columnPage * 12;
  return (
    <details className="excel-preview" open>
      <summary>
        {readOnly
          ? `Current cells: ${proposal.baseline.address}`
          : change.target === 'new_sheet'
            ? `New sheet: ${change.sheetName}`
            : `Replace ${proposal.baseline.address}`}
      </summary>
      <p>
        {change.values.length} rows × {change.values[0]!.length} columns
        {change.table ? ' · Excel table' : ''}
        {change.chart ? ` · ${change.chart} chart` : ''}
      </p>
      {proposal.sourceNotice && <p>{proposal.sourceNotice}</p>}
      {change.target === 'selection' && !readOnly && (
        <p className="excel-warning">
          {formulasOnly
            ? 'Updates only the listed formula cells. Other cells are retained.'
            : 'Replaces values and formulas in this rectangle. Formatting is retained.'}
        </p>
      )}
      <div className="excel-grid-scroll">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              {change.values[0]!.slice(firstColumn, firstColumn + 12).map((_, i) => (
                <th key={i}>Column {firstColumn + i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {change.values.slice(start, start + 25).map((row, r) => (
              <tr key={r}>
                <th>{start + r + 1}</th>
                {row.slice(firstColumn, firstColumn + 12).map((cell, offset) => {
                  const c = firstColumn + offset;
                  const formula = formulas.get(`${start + r}:${c}`);
                  const previous =
                    change.target === 'selection' && !readOnly
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
      {change.values[0]!.length > 12 && (
        <div className="excel-actions">
          <button disabled={!columnPage} onClick={() => setColumnPage(columnPage - 1)}>
            Previous columns
          </button>
          <span>
            Columns {firstColumn + 1}–{Math.min(firstColumn + 12, change.values[0]!.length)}
          </span>
          <button
            disabled={firstColumn + 12 >= change.values[0]!.length}
            onClick={() => setColumnPage(columnPage + 1)}
          >
            Next columns
          </button>
        </div>
      )}
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
function WorkbookPreview({ proposal: p }: { proposal: WorkbookProposal }) {
  return (
    <div>
      {p.sourceNotice && <p>{p.sourceNotice}</p>}
      {p.plan.actions.map((a, i) => {
        const baseline = p.checks[i]!.selection;
        const beforeFormulas =
          a.kind === 'write' || isStructural(a)
            ? baseline.formulas.flatMap((row, r) =>
                row.flatMap((f, c) =>
                  typeof f === 'string' && f.startsWith('=') && f !== baseline.values[r]?.[c]
                    ? [{ row: r, column: c, formula: f }]
                    : [],
                ),
              )
            : [];
        const formulas =
          a.kind === 'write'
            ? a.values
              ? a.formulas
              : [
                  ...beforeFormulas.filter(
                    (f) =>
                      !a.formulas.some((next) => next.row === f.row && next.column === f.column),
                  ),
                  ...a.formulas,
                ]
            : beforeFormulas;
        const values = a.kind === 'write' && a.values ? a.values : baseline.values;
        return (
          <section key={i} className="excel-operation">
            <h3>
              {i + 1}. {actionLabel(a)}
            </h3>
            {a.kind === 'format' && (
              <dl>
                {Object.entries(a.format).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd>{String(value)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
            {a.kind === 'table' && (
              <p>
                {a.mode === 'create' ? 'Create' : 'Update'} table “{a.name}”
                {a.style ? ` · ${a.style}` : ''}
                {a.showTotals !== undefined ? ` · totals ${a.showTotals ? 'shown' : 'hidden'}` : ''}
              </p>
            )}
            {a.kind === 'chart' && (
              <p>
                {a.mode === 'create' ? 'Create' : 'Update'} {a.chartType} chart “{a.name}”
                {a.title ? ` · ${a.title}` : ''}
                {a.position ? ` · position ${a.position}` : ''}. Source: {a.range}.
              </p>
            )}
            {a.kind === 'sort' && (
              <p>
                Sort {a.hasHeaders ? 'below the header' : 'all rows'}:{' '}
                {a.fields
                  .map((f) => `column ${f.column + 1} ${f.ascending ? 'ascending' : 'descending'}`)
                  .join(', ')}
                . Entire rows within this rectangle move together.
              </p>
            )}
            {a.kind === 'filter' && (
              <p>
                Show rows where column {a.column + 1} matches: {a.values.join(', ')}.
              </p>
            )}
            {a.kind === 'clear_filter' && <p>Clear filter criteria for this table or worksheet.</p>}
            {isStructural(a) && (
              <p className="excel-warning">
                This changes entire worksheet rows or columns, including cells outside the displayed
                rectangle. Excel may adjust formulas and move other content. Review the current used
                cells below.
              </p>
            )}
            {(a.kind === 'write' || isStructural(a)) && (
              <Preview
                formulasOnly={a.kind === 'write' && !a.values}
                readOnly={a.kind !== 'write'}
                proposal={{
                  id: p.id,
                  runId: p.runId,
                  summary: p.summary,
                  status: p.status,
                  baseline,
                  change: {
                    summary: p.summary,
                    target: 'selection',
                    values,
                    formulas,
                    table: false,
                  },
                }}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
function ReviewPanel({
  proposal,
  busy,
  running,
  error,
  notice,
  onClose,
  onApply,
  onReject,
}: {
  proposal: AnyExcelProposal;
  busy: boolean;
  running: boolean;
  error: string;
  notice: string;
  onClose: () => void;
  onApply: () => void;
  onReject: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="excel-review"
      aria-label="Review Excel changes"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="excel-review-heading">
        <h2>{proposal.summary}</h2>
        <button disabled={busy} onClick={onClose} aria-label="Close review">
          Close
        </button>
      </div>
      <div className="excel-review-body">
        {isWorkbookProposal(proposal) ? (
          <WorkbookPreview proposal={proposal} />
        ) : (
          <Preview proposal={proposal} />
        )}
      </div>
      <footer className="excel-review-footer">
        {error && (
          <p role="alert" className="excel-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <p className="excel-small">
          Apply rechecks the destination cells. Large batches can have partial effects if
          interrupted; save a copy before substantial edits.
        </p>
        {proposal.status === 'pending' ? (
          <div className="excel-actions">
            <button disabled={busy || running} onClick={onReject}>
              Reject
            </button>
            <button className="primary" disabled={busy || running} onClick={onApply}>
              Apply changes
            </button>
          </div>
        ) : (
          <p>
            {proposal.status} · {proposal.result}
          </p>
        )}
      </footer>
    </dialog>
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
  const [text, setText] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [limits, setLimits] = useState<ExcelLimits>(DEFAULT_EXCEL_LIMITS);
  const [review, setReview] = useState<AnyExcelProposal>();
  const [selectedAddress, setSelectedAddress] = useState('Current cell');
  const workbookBusy = useRef(false);
  const workbookReplies = useRef(new Map<string, { result?: unknown; error?: string }>());
  const [connected, setConnected] = useState(true);
  const scroll = useRef<HTMLDivElement>(null),
    pinned = useRef(true);
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
    if (signedIn)
      void api<{ limits: ExcelLimits }>('/excel/config')
        .then((c) => setLimits(c.limits))
        .catch((e) => setError(e.message));
  }, [signedIn]);
  useEffect(() => {
    if (!ready) return;
    let alive = true,
      stop: (() => Promise<void>) | undefined;
    void watchSelection(setSelectedAddress)
      .then((dispose) => {
        if (alive) stop = dispose;
        else void dispose();
      })
      .catch(() => {});
    return () => {
      alive = false;
      void stop?.();
    };
  }, [ready]);
  useEffect(() => {
    if (pinned.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [state]);
  useEffect(() => {
    if (!session || !signedIn) return;
    let alive = true;
    const refresh = async () => {
      const version = ++pollVersion.current;
      try {
        const data = await sessionApi<State>(session);
        for (const id of workbookReplies.current.keys())
          if (id !== data.workbookRequest?.id) workbookReplies.current.delete(id);
        if (alive && version === pollVersion.current) {
          setState(data);
          setConnected(true);
        }
        if (alive && ready && data.workbookRequest && !workbookBusy.current) {
          const id = data.workbookRequest.id;
          workbookBusy.current = true;
          try {
            let response = workbookReplies.current.get(id);
            if (!response) {
              const request = await sessionApi<WorkbookRequest>(session, `/workbook/${id}`);
              try {
                response = { result: await handleWorkbookRequest(request) };
              } catch (e) {
                response = { error: (e as Error).message.slice(0, 1000) };
              }
              workbookReplies.current.set(id, response);
            }
            await sessionApi(session, `/workbook/${id}`, 'POST', response);
            workbookReplies.current.delete(id);
          } catch (e) {
            if ((e as { status?: number }).status === 409) workbookReplies.current.delete(id);
            else if (alive) setError((e as Error).message);
          } finally {
            workbookBusy.current = false;
          }
        }
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setConnected(false);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [session, signedIn, ready]);
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
  const execute = async (proposal: AnyExcelProposal) => {
    if (!session || applying.current) return;
    applying.current = true;
    try {
      await verifyProposal(proposal); // No server claim or workbook writes on a stale preview.
      await sessionApi(session, `/proposals/${proposal.id}`, 'POST', { action: 'claim' });
      // From this point, errors can have partial effects. Never automatically retry Apply.
      let result: string;
      try {
        result = await applyProposal(proposal, setNotice);
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
      setNotice(`${result} Continue here; your next message uses the cells selected in Excel.`);
      setReview(undefined);
    } finally {
      applying.current = false;
      await refresh().catch(() => {});
    }
  };
  const pending = state?.proposals.some((p) => p.status === 'pending' || p.status === 'applying');
  return (
    <main className={`excel-app ${signedIn && session ? 'excel-session' : ''}`}>
      <header>
        <span className="excel-mark">F</span>
        <div>
          <h1>Frame for Excel</h1>
          <p>Your knowledge. Your infrastructure.</p>
        </div>
        <span className="excel-badge">Pilot</span>
      </header>
      <div
        className="excel-scroll"
        ref={scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        }}
      >
        {officeError && (
          <p role="alert" className="excel-warning">
            {officeError}
          </p>
        )}
        {error && !review && (
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
                  Uses this project’s knowledge and enabled read-only SQL connection. Workbook
                  context stays separate from project knowledge. Closing or reloading the pane
                  starts a new conversation; saved history remains in Frame.
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
                  <p>Selected: {selectedAddress}</p>
                  <p className="excel-small">
                    Selected cells are included automatically when you send. Blank sheets work too.
                    You can switch ranges or sheets in this conversation. Frame can read other
                    sheets as needed.
                  </p>
                  {state?.inspection && (
                    <details className="excel-inspection">
                      <summary>
                        Initial selection details · {state.inspection.ranges.length} sections
                      </summary>
                      <p>
                        {state.inspection.address} · {state.inspection.rows.toLocaleString()} ×{' '}
                        {state.inspection.columns.toLocaleString()} captured
                      </p>
                      <p>
                        Positions below are relative to the initial selection. Additional live
                        workbook reads appear in activity. Conversation history is retained.
                      </p>
                      <ul>
                        {state.inspection.ranges.map((r, i) => (
                          <li key={i}>
                            Rows {r.row + 1}–{r.row + r.rows}, columns {r.column + 1}–
                            {r.column + r.columns}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
                <section aria-label="Excel conversation" className="excel-messages">
                  {state && (
                    <ConversationMessages
                      snapshot={state.snapshot}
                      chatId={session.conversationId}
                      connected={connected}
                      stopping={state.snapshot.status === 'Stopping'}
                      canSave={false}
                      onSave={() => {}}
                    />
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
                    <p>
                      {p.target} ·{' '}
                      {p.operations
                        ? `${p.operations} operation${p.operations === 1 ? '' : 's'}`
                        : `${p.rows.toLocaleString()} × ${p.columns.toLocaleString()} cells`}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          setReview(
                            await sessionApi<AnyExcelProposal>(session, `/proposals/${p.id}`),
                          );
                        })
                      }
                    >
                      {p.status === 'pending' ? 'Review changes' : 'View changes'}
                    </button>
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
              </>
            )}
          </>
        )}
      </div>
      {signedIn && session && (
        <footer className="excel-dock">
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
                  const current = await captureSelection(limits);
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
              disabled={!ready || busy || !text.trim() || pending || state?.snapshot.running}
            >
              {outbox.current ? 'Retry original request' : 'Send'}
            </button>
          </form>
        </footer>
      )}
      {review && session && (
        <ReviewPanel
          proposal={{
            ...review,
            ...state?.proposals.find((p) => p.id === review.id),
          }}
          busy={busy}
          running={!!state?.snapshot.running || !ready}
          error={error}
          notice={notice}
          onClose={() => setReview(undefined)}
          onApply={() => void action(() => execute(review))}
          onReject={() =>
            void action(async () => {
              await sessionApi(session, `/proposals/${review.id}`, 'POST', { action: 'reject' });
              setReview(undefined);
              await refresh();
            })
          }
        />
      )}
      <LibraryReader />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
