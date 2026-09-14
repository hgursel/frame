import React, { useEffect, useState, useRef } from 'react';
import { RichMarkdown } from './RichMarkdown.js';
import type { KnowledgeDocument, DocumentRuntimeStatus } from '../shared/types.js';
import { api } from './api.js';

type Page = KnowledgeDocument & { text: string; metadata?: Record<string, any> };
export function KnowledgeMarkdown({ text, onOpen }: { text: string; onOpen?: (id: string) => void }) {
  return <RichMarkdown text={text} onOpen={onOpen} />;
}
export function DocumentTools() {
  const [status, setStatus] = useState<DocumentRuntimeStatus>();
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      void api<DocumentRuntimeStatus>('/document-tools')
        .then((v) => {
          if (live) setStatus(v);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="scope-note document-tools">
      <h2>Document tools</h2>
      <p>{status?.message || 'Checking Python environment…'}</p>
      {status && status.state !== 'ready' && (
        <>
          <p className="muted small">
            Install a private Python environment for PDF/DOCX reading and generation. This downloads
            pinned packages from PyPI once; document processing and model requests stay local.
            Ubuntu needs python3-venv.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Allow downloading and installing document packages on this server
          </label>
          <button
            disabled={!confirmed || status.state === 'installing'}
            onClick={async () => {
              setError('');
              try {
                await api('/document-tools/install', 'POST', { confirm: true });
                setStatus({ state: 'installing', message: 'Installing document tools…' });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {status.state === 'installing' ? 'Installing…' : 'Install document tools'}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function KnowledgePanel({
  projectId,
  documents,
  refresh,
  onAttach,
}: {
  projectId: string;
  documents: KnowledgeDocument[];
  refresh: () => Promise<void>;
  onAttach: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Page>();
  const removal = useRef<HTMLDialogElement>(null);
  const selectionRequest = useRef(0);
  useEffect(() => () => { selectionRequest.current++; }, []);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [verified, setVerified] = useState(false);
  const [versions, setVersions] = useState<{ id: string; at: string; content: string }[]>();
  const open = async (id: string) => {
    const request = ++selectionRequest.current;
    setError('');
    setVersions(undefined);
    try {
      const value = await api<Page>(`/projects/${projectId}/documents/${id}`);
      if (request !== selectionRequest.current) return;
      setSelected(value);
      setText(value.text);
      setCreating(false);
      setEditing(false);
      setVerified(false);
    } catch (e) {
      if (request === selectionRequest.current) setError((e as Error).message);
    }
  };
  return (
    <section className="knowledge-panel">
      <div className="knowledge-heading">
        <div>
          <span className="eyebrow">PROJECT MEMORY</span>
          <h1>Knowledge</h1>
          <p className="muted">
            Sources, connected notes, and useful discoveries from your conversations.
          </p>
        </div>
        <a className="button-link" href={`/api/projects/${projectId}/knowledge/export`}>
          ↓ Export OKF bundle
        </a>
      </div>
      <div className="knowledge-actions">
        <label className="upload-button">
          {busy ? 'Please wait…' : '+ Upload document'}
          <input
            aria-label="Upload document"
            type="file"
            disabled={busy}
            accept=".md,.txt,.csv,.pdf,.docx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              setError('');
              try {
                const form = new FormData();
                form.append('file', file);
                const doc = await api<KnowledgeDocument>(
                  `/projects/${projectId}/documents`,
                  'POST',
                  form,
                );
                await refresh();
                await open(doc.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <button
          onClick={() => {
            selectionRequest.current++;
            setCreating(true);
            setSelected(undefined);
            setName('');
            setText('');
            setError('');
            setVerified(false);
          }}
        >
          + New knowledge page
        </button>
        <span className="muted small">MD, TXT, CSV, PDF, DOCX · 10 MiB per file</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="knowledge-layout">
        <aside className="knowledge-list">
          <input
            aria-label="Find knowledge"
            placeholder="Find a source or note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {documents
            .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
            .map((doc) => (
              <button
                key={doc.id}
                disabled={busy}
                className={selected?.id === doc.id ? 'selected' : ''}
                onClick={() => void open(doc.id)}
              >
                <strong>{doc.name}</strong>
                <small>
                  {doc.kind === 'wiki' ? 'Knowledge page' : 'Source document'} ·{' '}
                  {Math.max(1, Math.round(doc.bytes / 1024))} KB
                </small>
              </button>
            ))}
          {!documents.length && (
            <p className="muted">
              Add your first source, or save a useful response from a conversation.
            </p>
          )}
        </aside>
        <div className="knowledge-detail">
          {creating || editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  const doc = creating
                    ? await api<KnowledgeDocument>(`/projects/${projectId}/wiki`, 'POST', {
                        name,
                        text,
                      })
                    : await api<KnowledgeDocument>(
                        `/projects/${projectId}/documents/${selected!.id}`,
                        'PUT',
                        { text, revision: selected!.revision, verified },
                      );
                  await refresh();
                  await open(doc.id);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>{creating ? 'New knowledge page' : `Edit ${selected?.name}`}</h2>
              {creating && (
                <label>
                  Page title
                  <input
                    required
                    maxLength={160}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                Markdown content
                <textarea
                  aria-label="Markdown content"
                  className="knowledge-editor"
                  required
                  maxLength={120000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              {!creating && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                  />
                  I checked these claims against their sources
                </label>
              )}
              <div className="form-actions">
                <button className="primary" disabled={busy}>
                  Save knowledge page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setCreating(false);
                  }}
                >
                  Cancel
                </button>
              </div>
              <details>
                <summary>Preview</summary>
                <KnowledgeMarkdown text={text} />
              </details>
            </form>
          ) : selected ? (
            <>
              <div className="detail-heading">
                <h2>{selected.name}</h2>
                <span className="knowledge-tag">
                  {selected.metadata?.verified ? 'Human-reviewed' : 'Unverified'}
                </span>
              </div>
              <div className="knowledge-actions">
                <button onClick={() => onAttach(selected.id)}>Attach to conversation</button>
                <button className="danger-button" disabled={busy} onClick={() => removal.current?.showModal()}>Remove {selected.kind === 'wiki' ? 'page' : 'file'}</button>
                {selected.kind === 'wiki' && (
                  <button
                    onClick={() => {
                      setEditing(true);
                      setVerified(false);
                    }}
                  >
                    Edit page
                  </button>
                )}
                <a href={`/api/projects/${projectId}/documents/${selected.id}/download`}>
                  ↓ {selected.kind === 'wiki' ? 'Markdown' : 'Original file'}
                </a>
                <button
                  onClick={() =>
                    void api<typeof versions>(
                      `/projects/${projectId}/documents/${selected.id}/revisions`,
                    )
                      .then(setVersions)
                      .catch((e) => setError(e.message))
                  }
                >
                  History
                </button>
              </div>
              {selected.truncated && (
                <p className="notice">
                  This is a bounded text extraction. The original file is preserved. Scanned pages
                  require OCR outside Frame.
                </p>
              )}
              <div className="knowledge-body">
                <KnowledgeMarkdown text={selected.text} onOpen={(id) => void open(id)} />
              </div>
              {selected.metadata?.sources && (
                <details>
                  <summary>Sources and provenance</summary>
                  <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
                </details>
              )}
              {versions && (
                <div>
                  <h3>Saved revisions</h3>
                  {versions.map((v) => (
                    <details key={v.id}>
                      <summary>{new Date(v.at).toLocaleString()}</summary>
                      <pre>{v.content}</pre>
                    </details>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="knowledge-empty">
              <h2>Give good answers a place to stay.</h2>
              <p>
                Keep originals as sources. Build concise notes with links, evidence, and open
                questions. Frame can search these pages in every project conversation.
              </p>
              <p className="muted small">OKF 0.2 · Markdown · Local storage</p>
            </div>
          )}
        </div>
      </div>
      <dialog ref={removal} className="remove-dialog" aria-labelledby="remove-title"
        onCancel={(e) => { if (busy) e.preventDefault(); }}>
        <h2 id="remove-title">Remove {selected?.kind === 'wiki' ? 'page' : 'file'}?</h2>
        <p><strong>{selected?.name}</strong> will be removed from project knowledge, including its original file and saved revisions.</p>
        <p className="muted">Other pages may still reference it. Previously saved conversation excerpts and backups are unchanged.</p>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={() => removal.current?.close()}>Cancel</button>
          <button type="button" className="danger-button" disabled={busy || !selected} onClick={async () => {
            if (!selected) return;
            setBusy(true); setError('');
            try {
              await api('/projects/' + projectId + '/documents/' + selected.id, 'DELETE', { revision: selected.revision });
              removal.current?.close();
              setSelected(undefined); setText(''); setVersions(undefined);
            } catch (e) { setError((e as Error).message); removal.current?.close(); }
            finally { setBusy(false); await refresh().catch((e) => setError(e.message)); }
          }}>{busy ? 'Removing…' : 'Remove permanently'}</button>
        </div>
      </dialog>
    </section>
  );
}

type Draft = {
  sourceRevision: string;
  text: string;
  title: string;
  targetId?: string;
  revision?: string;
  sourceIds: string[];
};
export function SaveKnowledge({
  projectId,
  chatId,
  index,
  documents,
  onClose,
  onSaved,
}: {
  projectId: string;
  chatId: string;
  index: number;
  documents: KnowledgeDocument[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>();
  const [original, setOriginal] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const value = await api<Draft>(`/conversations/${chatId}/knowledge/${index}`);
        if (value.targetId) {
          const page = await api<Page>(`/projects/${projectId}/documents/${value.targetId}`);
          if (live) setOriginal(page.text);
        }
        if (live) {
          setDraft(value);
          setSourceText(value.text);
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [chatId, index, projectId]);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-modal="true"
      aria-labelledby="save-knowledge-title"
      className="knowledge-modal"
    >
      <div className="detail-heading">
        <h2 id="save-knowledge-title">Save to knowledge</h2>
        <button aria-label="Close knowledge draft" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="muted">
        Keep the useful parts, add evidence, and note uncertainty. Saving does not verify a claim.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded && <p>Opening draft…</p>}
      {draft && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(`/conversations/${chatId}/knowledge/${index}`, 'POST', {
                ...draft,
                verified,
              });
              await onSaved();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Save as
            <select
              value={draft.targetId || ''}
              disabled={busy}
              onChange={async (e) => {
                const targetId = e.target.value;
                setBusy(true);
                setError('');
                try {
                  if (targetId) {
                    const page = await api<Page>(`/projects/${projectId}/documents/${targetId}`);
                    setOriginal(page.text);
                    setDraft({
                      ...draft,
                      targetId,
                      revision: page.revision,
                      text: `${page.text}\n\n## Conversation insight\n\n${sourceText}`,
                    });
                  } else {
                    setOriginal('');
                    setDraft({
                      ...draft,
                      targetId: undefined,
                      revision: undefined,
                      text: sourceText,
                    });
                  }
                  setVerified(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="">New knowledge page</option>
              {documents
                .filter((d) => d.kind === 'wiki')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    Update {d.name}
                  </option>
                ))}
            </select>
          </label>
          {!draft.targetId && (
            <label>
              Page title
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
          )}
          {original && (
            <details>
              <summary>Current page — compare before saving</summary>
              <pre>{original}</pre>
            </details>
          )}
          <label>
            {draft.targetId ? 'Revised page (full Markdown)' : 'Knowledge content'}
            <textarea
              aria-label={draft.targetId ? 'Revised page (full Markdown)' : 'Knowledge content'}
              autoFocus
              className="knowledge-editor"
              required
              maxLength={120000}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </label>
          <details>
            <summary>Preview draft</summary>
            <KnowledgeMarkdown text={draft.text} />
          </details>
          <label className="check">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I checked these claims against their sources
          </label>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save reviewed draft'}
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
