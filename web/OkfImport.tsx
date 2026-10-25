import React, { useState } from 'react';
import { api } from './api.js';
import type { OkfPreview } from '../shared/okf.js';

export function OkfImport({
  projectId,
  onImported,
}: {
  projectId: string;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<OkfPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const upload = (value: File, fingerprint?: string) => {
    const body = new FormData();
    body.append('file', value);
    return api<OkfPreview>(
      `/projects/${projectId}/knowledge/import${fingerprint ? `?fingerprint=${fingerprint}` : ''}`,
      'POST',
      body,
    );
  };
  return (
    <div className="okf-import">
      <input
        hidden
        id={`okf-file-${projectId}`}
        type="file"
        accept=".zip,application/zip"
        aria-label="Import OKF bundle"
        disabled={busy}
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (!selected) return;
          setPreview(undefined);
          setFile(undefined);
          setNotice('');
          setError('');
          setBusy(true);
          try {
            const result = await upload(selected);
            setFile(selected);
            setPreview(result);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p role="status">Processing OKF bundle…</p>}
      {preview && (
        <section className="okf-preview" aria-label="OKF import preview">
          <h2>Import preview</h2>
          <p>
            {preview.counts.add} new · {preview.counts.update} updates · {preview.counts.skip}{' '}
            identical
          </p>
          <p className="muted">
            Updates preserve previous versions in history. Identical pages are skipped.
          </p>
          <ul>
            {preview.pages.map((p) => (
              <li key={p.path}>
                <strong>{p.name}</strong> —{' '}
                {p.action === 'add' ? 'Add' : p.action === 'update' ? 'Update' : 'Skip'}
                <small> · {p.path}</small>
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !file || !(preview.counts.add + preview.counts.update)}
              onClick={async () => {
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  const result = await upload(file, preview.fingerprint);
                  setPreview(undefined);
                  setFile(undefined);
                  setNotice(
                    `Imported ${result.counts.add} new pages, updated ${result.counts.update}, skipped ${result.counts.skip}.`,
                  );
                  await onImported();
                } catch (e) {
                  setError((e as Error).message);
                  setPreview(undefined);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import changes
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setPreview(undefined);
                setFile(undefined);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
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
    </div>
  );
}
