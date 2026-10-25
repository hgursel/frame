import { EmailDrafts } from '../Email.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../api.js';
import type {
  Project,
  ChatSnapshot,
  PublicSettings,
  KnowledgeDocument,
} from '../../shared/types.js';
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
import { ContextPanel, Throughput } from '../ContextPanel.js';
import { AttachmentPicker } from '../AttachmentPicker.js';
import { ImagePreviews, useChatImages } from '../ChatImages.js';
import type { ChatImage } from '../../shared/images.js';
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
  const [username, setUsername] = useState('admin');
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState('');
  const [session, setSession] = useState<Session>(),
    [state, setState] = useState<State>();
  const [text, setText] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [settings, setSettings] = useState<PublicSettings>();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [chatFiles, setChatFiles] = useState<KnowledgeDocument[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const chatImages = useChatImages(session?.conversationId || '');
  const working = useRef(false);
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
  const outbox = useRef<
    | {
        requestId: string;
        text: string;
        selection: ExcelSelection;
        documentIds: string[];
        images: ChatImage[];
      }
    | undefined
  >(undefined);
  const loadProjects = async () => {
    const list = await api<Project[]>('/projects');
    setProjects(list);
    setProject((p) => (list.some((item) => item.id === p) ? p : list[0]?.id || ''));
    setSignedIn(true);
  };
  useEffect(() => {
    const signedOut = () => {
      setSignedIn(false);
      setSession(undefined);
      setState(undefined);
      setProjects([]);
      setProject('');
      setReview(undefined);
      setText('');
      setAttached([]);
      setDocuments([]);
      setChatFiles([]);
      setSettings(undefined);
      outbox.current = undefined;
      workbookReplies.current.clear();
      pollVersion.current++;
    };
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
    if (signedIn)
      void api<PublicSettings>('/settings')
        .then(setSettings)
        .catch((e) => setError(e.message));
  }, [signedIn]);
  useEffect(() => {
    setDocuments([]);
    setChatFiles([]);
    setAttached([]);
    if (!session) return;
    let live = true;
    void api<KnowledgeDocument[]>(`/projects/${project}/documents`)
      .then((docs) => {
        if (live) setDocuments(docs);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session, project]);
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
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
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
      setNotice('');
      setReview(undefined);
    } finally {
      applying.current = false;
      await refresh().catch(() => {});
    }
  };
  const pending = state?.proposals.some((p) => p.status === 'pending' || p.status === 'applying');
  const applyingChanges = state?.proposals.some((p) => p.status === 'applying');
  const attachmentBusy =
    busy ||
    uploading ||
    chatImages.busy ||
    !!outbox.current ||
    !!state?.snapshot.running ||
    !!applyingChanges;
  const canSend =
    ready &&
    !busy &&
    !uploading &&
    !chatImages.busy &&
    !applyingChanges &&
    !state?.snapshot.running &&
    (!!outbox.current || !!text.trim() || !!attached.length || !!chatImages.images.length);
  const submit = () => {
    if (!session || !canSend) return;
    void action(async () => {
      if (!outbox.current) {
        const current = await captureSelection(limits);
        outbox.current = {
          requestId: crypto.randomUUID(),
          text,
          selection: current,
          documentIds: [...attached],
          images: chatImages.images.map(({ name: _, ...image }) => image),
        };
      }
      try {
        await sessionApi(session, '/messages', 'POST', outbox.current);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status && status >= 400 && status < 500) outbox.current = undefined;
        else
          throw new Error(
            'Send was not acknowledged. Retry the original request safely using the same request ID.',
          );
        throw e;
      }
      outbox.current = undefined;
      setText('');
      setAttached([]);
      chatImages.setImages([]);
      pinned.current = true;
      await refresh();
    });
  };
  const linkedProposals = new Set(
    state?.snapshot.messages.map((m) => m.excelProposalId).filter(Boolean),
  );
  const unlinked = state?.proposals.filter((p) => !linkedProposals.has(p.id)) || [];
  const proposalCard = (p: ExcelProposalSummary) =>
    session && (
      <section
        key={p.id}
        data-proposal-id={p.id}
        className={`excel-proposal ${p.status === 'pending' || p.status === 'applying' ? '' : 'excel-proposal-complete'}`}
      >
        <div className="excel-proposal-heading">
          <h2>{p.summary}</h2>
          <span className="excel-badge">{p.status === 'superseded' ? 'Replaced' : p.status}</span>
        </div>
        {(p.status === 'pending' || p.status === 'applying') && (
          <p>
            {p.target} ·{' '}
            {p.operations
              ? `${p.operations} operation${p.operations === 1 ? '' : 's'}`
              : `${p.rows.toLocaleString()} × ${p.columns.toLocaleString()} cells`}
          </p>
        )}
        <button
          disabled={busy || (p.status === 'pending' && !!state?.snapshot.running)}
          onClick={() =>
            void action(async () => {
              setReview(await sessionApi<AnyExcelProposal>(session, `/proposals/${p.id}`));
            })
          }
        >
          {p.status === 'pending' ? 'Review changes' : 'View changes'}
        </button>
        {p.status === 'pending' && (
          <p className="excel-small">Send a follow-up to replace these pending changes.</p>
        )}
        {p.status === 'applying' && (
          <div className="excel-warning">
            <p>
              Apply was claimed. If the connection failed, inspect the workbook; never replay this
              batch.
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
      </section>
    );
  return (
    <main className={`excel-app ${signedIn && session ? 'excel-session' : ''}`}>
      <header>
        <span className="excel-mark">F</span>
        <div>
          <h1>Frame for Excel</h1>
          <p>Your knowledge. Your infrastructure.</p>
        </div>
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
                await api('/auth/login', 'POST', { username, password });
                const me = await api<{ mustChangePassword: number }>('/auth/me');
                if (me.mustChangePassword)
                  throw new Error(
                    'Open Frame in your browser to change your temporary password, then return here.',
                  );
                setPassword('');
                await loadProjects();
              });
            }}
          >
            <h2>Connect to Frame</h2>
            <label>
              Username
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <p>{location.origin}</p>
            <label>
              Frame password
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
                    disabled={attachmentBusy || pending}
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
                <details className="excel-context">
                  <summary>Selected: {selectedAddress}</summary>
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
                </details>
                <section aria-label="Excel conversation" className="excel-messages">
                  {unlinked.some((p) => p.status !== 'pending' && p.status !== 'applying') && (
                    <details className="excel-earlier-changes">
                      <summary>Earlier changes</summary>
                      {unlinked
                        .filter((p) => p.status !== 'pending' && p.status !== 'applying')
                        .map(proposalCard)}
                    </details>
                  )}
                  {state && (
                    <ConversationMessages
                      snapshot={state.snapshot}
                      chatId={session.conversationId}
                      connected={connected}
                      stopping={state.snapshot.status === 'Stopping'}
                      canSave={false}
                      onSave={() => {}}
                      renderTurnFooter={(messages) =>
                        messages.flatMap(({ message }) => {
                          const proposal = state.proposals.find(
                            (p) => p.id === message.excelProposalId,
                          );
                          return proposal ? [proposalCard(proposal)] : [];
                        })
                      }
                    />
                  )}
                </section>
                {unlinked
                  .filter((p) => p.status === 'pending' || p.status === 'applying')
                  .map(proposalCard)}
                <EmailDrafts
                  chatId={session.conversationId}
                  drafts={state?.snapshot.emails || []}
                />
                {state?.snapshot.question && (
                  <QuestionCard
                    key={state.snapshot.question.id}
                    request={state.snapshot.question}
                    chatId={session.conversationId}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
      {signedIn && session && (
        <footer className="excel-dock">
          {state?.snapshot.error && (
            <p role="alert" className="excel-error">
              {state.snapshot.error}
            </p>
          )}
          <form
            className="excel-composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {!!chatImages.images.length && (
              <ImagePreviews
                images={chatImages.images}
                disabled={attachmentBusy}
                onRemove={(index) =>
                  chatImages.setImages((images) => images.filter((_, i) => i !== index))
                }
              />
            )}
            {!!attached.length && (
              <div className="composer-attachments">
                {attached.map((id) => {
                  const name =
                    [...documents, ...chatFiles].find((d) => d.id === id)?.name || 'Document';
                  return (
                    <span key={id}>
                      {name}
                      <button
                        type="button"
                        aria-label={`Remove attachment ${name}`}
                        disabled={attachmentBusy}
                        onClick={() => setAttached((ids) => ids.filter((value) => value !== id))}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <textarea
              aria-label="Message Frame"
              disabled={busy || !!outbox.current}
              placeholder="Ask about your workbook…"
              maxLength={16000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const files = [...e.clipboardData.items]
                  .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => !!file);
                if (!files.length) return;
                e.preventDefault();
                if (!attachmentBusy) void chatImages.add(files).catch((e) => setError(e.message));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="excel-composer-actions">
              <AttachmentPicker
                key={session.conversationId}
                projectId={project}
                documents={documents}
                attached={attached}
                disabled={attachmentBusy}
                onBusy={setUploading}
                onImages={(files) => {
                  void chatImages.add(files).catch((e) => setError(e.message));
                }}
                onToggle={(id) =>
                  setAttached((ids) =>
                    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id].slice(0, 5),
                  )
                }
                onUploadFiles={async (files) => {
                  for (const file of files) {
                    const form = new FormData();
                    form.append('file', file);
                    const doc = await api<KnowledgeDocument>(
                      `/conversations/${session.conversationId}/files`,
                      'POST',
                      form,
                    );
                    setChatFiles((docs) => [doc, ...docs.filter((d) => d.id !== doc.id)]);
                    setAttached((ids) => [...new Set([...ids, doc.id])].slice(0, 5));
                  }
                }}
              />
              {state?.snapshot.running ? (
                <button
                  type="button"
                  className="excel-send"
                  aria-label="Stop generation"
                  title="Stop generation"
                  disabled={busy || state.snapshot.status === 'Stopping'}
                  onClick={() =>
                    void action(async () => {
                      await api(`/conversations/${session.conversationId}/stop`, 'POST', {
                        runId: state.snapshot.runId,
                      });
                      await refresh();
                    })
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  className="excel-send"
                  disabled={!canSend}
                  aria-label={outbox.current ? 'Retry original request' : 'Send message'}
                  title={outbox.current ? 'Retry original request' : 'Send message'}
                >
                  {busy ? '…' : outbox.current ? '↻' : '↑'}
                </button>
              )}
            </div>
          </form>
          <div className="composer-metrics">
            <ContextPanel
              metrics={state?.snapshot.metrics}
              settings={settings}
              running={!!state?.snapshot.running || busy}
              canCompact={
                !attachmentBusy &&
                !pending &&
                !!state?.snapshot.messages.some((m) => m.role === 'assistant')
              }
              onCompact={() =>
                void action(async () => {
                  await api(`/conversations/${session.conversationId}/compact`, 'POST', {
                    requestId: crypto.randomUUID(),
                  });
                  await refresh();
                })
              }
              settingsLabel="Open Frame"
              onSettings={() => window.open(`${location.origin}/`, '_blank', 'noopener,noreferrer')}
            />
            <Throughput
              metrics={state?.snapshot.metrics}
              running={
                !!state?.snapshot.running &&
                ['Responding', 'Thinking'].includes(state.snapshot.status)
              }
            />
          </div>
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
