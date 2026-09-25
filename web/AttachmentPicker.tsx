import React, { useEffect, useRef, useState } from 'react';
import type { KnowledgeDocument } from '../shared/types.js';
import { api } from './api.js';

export function AttachmentPicker({
  allowUpload = true,
  projectId,
  documents,
  attached,
  disabled,
  onBusy,
  onToggle,
  onUploaded,
}: {
  allowUpload?: boolean;
  projectId: string;
  documents: KnowledgeDocument[];
  attached: string[];
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onToggle: (id: string) => void;
  onUploaded: (document: KnowledgeDocument) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const blocked = disabled || busy;
  const upload = async (files: File[]) => {
    if (!allowUpload || blocked || !files.length) return;
    setError('');
    if (files.length > 5 - attached.length) {
      setError('Attach up to five files per message.');
      return;
    }
    if (
      files.some(
        (file) =>
          !/\.(md|txt|csv|pdf|docx)$/i.test(file.name) ||
          file.size > 10 * 1024 * 1024 ||
          !file.size,
      )
    ) {
      setError('Choose MD, TXT, CSV, PDF, or DOCX files up to 10 MiB each.');
      return;
    }
    setBusy(true);
    onBusy(true);
    if (menu.current) menu.current.open = false;
    try {
      for (const file of files) {
        if (!alive.current) break;
        const form = new FormData();
        form.append('file', file);
        const doc = await api<KnowledgeDocument>(
          '/projects/' + projectId + '/documents',
          'POST',
          form,
        );
        if (alive.current) onUploaded(doc);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  return (
    <div className="attachments-control">
      <details ref={menu} className="attachment-menu">
        <summary
          role="button"
          aria-label="Add attachments"
          aria-disabled={blocked}
          title="Add attachments"
          onClick={(e) => {
            if (blocked) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (blocked && ['Enter', ' '].includes(e.key)) e.preventDefault();
            if (e.key === 'Escape' && menu.current) menu.current.open = false;
          }}
        >
          {busy ? '…' : '+'}
        </summary>
        <div className="attachment-options">
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              if (menu.current) menu.current.open = false;
              setQuery('');
              dialog.current?.showModal();
            }}
          >
            ▤ Attach from knowledge
          </button>
          <button
            type="button"
            disabled={!allowUpload || blocked || attached.length >= 5}
            onClick={() => fileInput.current?.click()}
          >
            ↑ Upload from computer
          </button>
          <small>
            {allowUpload
              ? 'Up to 5 attachments · 10 MiB per file. Uploads are saved to this project’s knowledge.'
              : 'Incognito can reference existing knowledge. Uploads are disabled to avoid saving new project documents.'}
          </small>
        </div>
      </details>
      <input
        ref={fileInput}
        hidden
        aria-label="Upload chat files"
        type="file"
        multiple
        accept=".md,.txt,.csv,.pdf,.docx"
        disabled={blocked}
        onChange={(e) => {
          const files = [...(e.target.files || [])];
          e.target.value = '';
          void upload(files);
        }}
      />
      {error && (
        <div className="attachment-error" role="alert">
          {error}
          <button type="button" aria-label="Dismiss attachment error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      <dialog ref={dialog} className="attachment-dialog" aria-labelledby="attachment-title">
        <h2 id="attachment-title">Attach from knowledge</h2>
        <p className="muted">Choose up to five sources or pages for this message.</p>
        <input
          aria-label="Search attachment knowledge"
          placeholder="Find a source or page…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="attachment-results">
          {documents
            .filter((doc) => doc.name.toLowerCase().includes(query.toLowerCase()))
            .map((doc) => (
              <label key={doc.id}>
                <input
                  type="checkbox"
                  checked={attached.includes(doc.id)}
                  disabled={blocked || (!attached.includes(doc.id) && attached.length >= 5)}
                  onChange={() => onToggle(doc.id)}
                />
                <span>
                  <strong>{doc.name}</strong>
                  <small>{doc.kind === 'wiki' ? 'Knowledge page' : 'Source document'}</small>
                </span>
              </label>
            ))}
          {!documents.some((doc) => doc.name.toLowerCase().includes(query.toLowerCase())) && (
            <p className="muted">No matching files. Upload from your computer to add a source.</p>
          )}
        </div>
        <div className="dialog-actions">
          <span>{attached.length}/5 selected</span>
          <button type="button" className="primary" onClick={() => dialog.current?.close()}>
            Done
          </button>
        </div>
      </dialog>
    </div>
  );
}
