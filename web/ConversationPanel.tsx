import React, { useState } from 'react';
import type { ChatSnapshot, KnowledgeDocument } from '../shared/types.js';
import { api } from './api.js';
export function ConversationPanel({
  chatId,
  projectId,
  snapshot,
  files,
  documents,
  artifacts,
  attached,
  incognito,
  onAttach,
  onSaved,
  onClose,
}: {
  chatId: string;
  projectId: string;
  snapshot: ChatSnapshot;
  files: KnowledgeDocument[];
  documents: KnowledgeDocument[];
  artifacts: { name: string }[];
  attached: string[];
  incognito: boolean;
  onAttach: (id: string) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const sources = new Map(
    snapshot.messages.flatMap((m) =>
      (m.attachments || [])
        .filter((a) => !files.some((f) => f.id === a.id))
        .map((a) => [a.id, a] as const),
    ),
  );
  for (const message of snapshot.messages) {
    const doc = documents.find((d) => d.id === message.knowledgeSourceId);
    if (doc) sources.set(doc.id, { id: doc.id, name: doc.name });
  }
  const images = [...new Set(snapshot.messages.flatMap((m) => m.images?.map((i) => i.id) || []))];
  const save = async (id: string) => {
    setSaving(id);
    setError('');
    try {
      await api(`/conversations/${chatId}/files/${id}/knowledge`, 'POST', { confirm: true });
      setSaved((v) => [...v, id]);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving('');
    }
  };
  return (
    <aside className="conversation-panel" aria-label="Outputs and sources">
      <div className="panel-heading">
        <strong>Conversation files</strong>
        <button aria-label="Close outputs and sources" onClick={onClose}>
          ×
        </button>
      </div>
      <section>
        <h2>Outputs</h2>
        {!artifacts.length && <p className="muted">Generated files will appear here.</p>}
        {artifacts.map((a) => (
          <a
            className="panel-file"
            key={a.name}
            download={a.name}
            href={`/api/conversations/${chatId}/artifacts/${encodeURIComponent(a.name)}`}
          >
            ↓ {a.name}
          </a>
        ))}
      </section>
      <section>
        <h2>Sources</h2>
        {!files.length && !sources.size && !images.length && !snapshot.memory?.length && (
          <p className="muted">Attach files using + in the message box.</p>
        )}
        {files.map((file) => (
          <div className="panel-source" key={file.id}>
            <a
              className="panel-file"
              download={file.name}
              href={`/api/conversations/${chatId}/files/${file.id}`}
            >
              ▤ {file.name}
            </a>
            <small>Only in this conversation</small>
            <div className="panel-file-actions">
              <button
                disabled={snapshot.running || (!attached.includes(file.id) && attached.length >= 5)}
                onClick={() => onAttach(file.id)}
              >
                {attached.includes(file.id)
                  ? 'Attached to next message ✓'
                  : 'Attach to next message'}
              </button>
              {!incognito && (
                <button
                  disabled={snapshot.running || !!saving || saved.includes(file.id)}
                  onClick={() => void save(file.id)}
                >
                  {saved.includes(file.id) ? 'Added to knowledge ✓' : 'Add to project knowledge'}
                </button>
              )}
            </div>
          </div>
        ))}
        {[...sources.values()].map((a) => (
          <a
            className="panel-file"
            key={a.id}
            download={a.name}
            href={`/api/projects/${projectId}/documents/${a.id}/download`}
          >
            ▤ {a.name}
            <small>Project knowledge</small>
          </a>
        ))}
        {images.map((id, i) => (
          <a
            className="panel-file"
            key={id}
            href={`/api/conversations/${chatId}/images/${id}`}
            target="_blank"
            rel="noreferrer"
          >
            ▧ Image {i + 1}
          </a>
        ))}
        {snapshot.memory?.map((m) => (
          <div className="panel-source" key={m.id}>
            {m.url ? (
              <button
                className="text-link"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('frame-library-page', { detail: m.url }))
                }
              >
                {m.title}
              </button>
            ) : (
              m.title
            )}
            <small>Reference supplied to Frame</small>
          </div>
        ))}
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </aside>
  );
}
