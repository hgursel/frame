import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { RichMarkdown } from './RichMarkdown.js';
import type { LibraryEntry, LibraryPack, LibraryPage } from '../shared/library.js';
import './library.css';
const pageUrl = (p: LibraryPack, id: string) =>
  `/api/library/packs/${p.id}/${p.version}/pages/${id}`;
export function openLibraryPage(url: string) {
  window.dispatchEvent(new CustomEvent('frame-library-page', { detail: url }));
}
export function LibraryReader() {
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const [content, setContent] = useState<{
    pack: Pick<LibraryPack, 'title' | 'version' | 'reviewedAt' | 'rights'>;
    page: LibraryPage;
  }>();
  const [error, setError] = useState('');
  useEffect(() => {
    const open = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      if (!/^\/api\/library\/packs\/[a-z0-9-]+\/\d+\.\d+\.\d+\/pages\/[a-z0-9-]+$/.test(url))
        return;
      const request = ++sequence.current;
      setContent(undefined);
      setError('');
      dialog.current?.showModal();
      void api<NonNullable<typeof content>>(url.slice(4)).then(
        (value) => {
          if (request === sequence.current) setContent(value);
        },
        (e) => {
          if (request === sequence.current) setError(e.message);
        },
      );
    };
    window.addEventListener('frame-library-page', open);
    return () => {
      sequence.current++;
      window.removeEventListener('frame-library-page', open);
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="library-reader"
      aria-label="Library reference"
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
    >
      <div className="library-reader-body">
        <button
          type="button"
          className="library-close"
          aria-label="Close library reference"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !content ? (
          <p role="status">Opening reference…</p>
        ) : (
          <>
            <span className="settings-eyebrow">
              {content.pack.title} · v{content.pack.version}
            </span>
            <h2>{content.page.title}</h2>
            <p className="muted">{content.page.description}</p>
            <dl className="library-facts">
              <dt>Content</dt>
              <dd>
                {content.page.kind === 'review-workflow' ? 'Review workflow' : 'Reference brief'}
              </dd>
              <dt>Source check</dt>
              <dd>{content.pack.reviewedAt} · verify current guidance and requirements</dd>
              <dt>Effective date</dt>
              <dd>
                {content.page.effectiveDate || 'Varies by provision; verify the applicable source'}
              </dd>
              <dt>Applicability</dt>
              <dd>{content.page.applicability}</dd>
            </dl>
            <RichMarkdown text={content.page.text} />
            <h3>Publisher references</h3>
            {content.page.sources.length ? (
              <ul>
                {content.page.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener">
                      {s.title} ↗
                    </a>
                    <p className="muted small">{s.locator}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Author-provided workflow or template. Cite project documents for organizational
                facts; this section is not an official agency form or rule.
              </p>
            )}
            <p className="library-rights muted small">{content.pack.rights}</p>
          </>
        )}
      </div>
    </dialog>
  );
}
export function KnowledgeLibraryPanel({
  projectId,
  readOnly = false,
}: {
  projectId?: string;
  readOnly?: boolean;
}) {
  const [entries, setEntries] = useState<LibraryEntry[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const endpoint = projectId ? `/projects/${projectId}/library` : '/library';
  const load = () => api<LibraryEntry[]>(endpoint).then(setEntries);
  useEffect(() => {
    let alive = true;
    setEntries(undefined);
    void api<LibraryEntry[]>(endpoint).then(
      (v) => {
        if (alive) setEntries(v);
      },
      (e) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, [endpoint]);
  const change = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const available = readOnly ? entries?.filter((e) => e.attached) : entries;
  const visible = available?.filter((entry) => {
    const { pack } = entry;
    const matchesStatus =
      filter === 'all' ||
      (filter === 'installed' && entry.installed) ||
      (filter === 'attached' && entry.attached) ||
      (filter === 'updates' &&
        (!!entry.newerVersion ||
          !!available?.some((e) => e.pack.id === pack.id && e.newerVersion === pack.version)));
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const text = [
      pack.title,
      pack.description,
      ...pack.jurisdiction,
      ...pack.pages.flatMap((p) => [p.title, p.description, ...p.tags]),
    ]
      .join(' ')
      .toLowerCase();
    return matchesStatus && terms.every((term) => text.includes(term));
  });
  return (
    <section
      className="library-panel"
      aria-label={projectId ? 'Project library references' : 'Knowledge Library'}
    >
      <div className="library-heading">
        <div>
          <span className="settings-eyebrow">
            {projectId ? 'SHARED REFERENCES' : 'REFERENCE CATALOG'}
          </span>
          <h2>{projectId ? 'Library references' : 'Knowledge Library'}</h2>
          <p className="muted">
            {projectId
              ? 'Attach references to this project. Company documents and learned methods remain separate.'
              : 'Practical reference briefs and review workflows. Install once, then select packs in Project settings.'}
          </p>
        </div>
        {!readOnly && (
          <div className="library-catalog-actions">
            <a
              href="https://github.com/hgursel/frame/tree/main/knowledge-packs"
              target="_blank"
              rel="noreferrer noopener"
            >
              Download more packs ↗
            </a>
            <label className="button-link library-import">
              Import pack
              <input
                aria-label="Import library pack"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void change(
                    async () => {
                      if (file.size > 1_500_000)
                        throw new Error('Pack must be smaller than 1.5 MB.');
                      return api('/library/import', 'POST', JSON.parse(await file.text()));
                    },
                    projectId
                      ? 'Pack imported. Select Attach to project to use it here.'
                      : 'Pack imported. Attach it in Project settings.',
                  );
                }}
              />
            </label>
          </div>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      <div className="library-toolbar">
        <input
          aria-label="Search knowledge packs"
          placeholder="Search packs, topics, or jurisdictions…"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter knowledge packs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All packs</option>
          <option value="installed">Installed</option>
          {projectId && <option value="attached">Attached</option>}
          <option value="updates">Updates available</option>
        </select>
        <span className="muted small" aria-live="polite">
          {visible?.length || 0} of {available?.length || 0}
        </span>
      </div>
      {!entries ? (
        <p className="muted">Loading library…</p>
      ) : !visible?.length ? (
        <p className="muted">
          {available?.length
            ? 'No packs match your search or filter.'
            : 'No library packs attached. Select them in Project settings.'}
        </p>
      ) : (
        <div className="library-grid">
          {visible.map(({ pack, installed, attached, bundled, newerVersion }) => {
            const previous =
              entries.find((e) => e.pack.id === pack.id && e.attached)?.pack.version || null;
            return (
              <article className="library-card" key={`${pack.id}:${pack.version}`}>
                <div className="library-row-title">
                  <h3>{pack.title}</h3>
                  <p className="muted small">
                    {pack.jurisdiction.join(' · ')} · {pack.pages.length} sections · v{pack.version}
                  </p>
                </div>
                <div className="library-card-top">
                  <span className="library-badge">
                    {newerVersion
                      ? 'Update available'
                      : attached
                        ? 'Attached'
                        : installed
                          ? 'Installed'
                          : bundled
                            ? 'Available'
                            : 'Imported'}
                  </span>
                </div>
                <details>
                  <summary>Explore sections</summary>
                  <p>{pack.description}</p>
                  <p className="muted small">
                    Source check {pack.reviewedAt} ·{' '}
                    {new Set(pack.pages.flatMap((p) => p.sources.map((s) => s.url))).size} publisher
                    references ·{' '}
                    {pack.pages
                      .reduce((n, p) => n + p.text.split(/\s+/).length, 0)
                      .toLocaleString()}{' '}
                    words
                  </p>
                  {!bundled && (
                    <p className="muted small">
                      Imported content · verify publisher and accuracy before use.
                    </p>
                  )}
                  {newerVersion && (
                    <p className="library-update">
                      Version {newerVersion} available. Attached projects keep their selected
                      version.
                    </p>
                  )}
                  <ul className="library-sections">
                    {pack.pages.map((page) => (
                      <li key={page.id}>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => openLibraryPage(pageUrl(pack, page.id))}
                        >
                          {page.title}
                        </button>
                        <span className="muted small">
                          {page.kind === 'review-workflow' ? 'Review workflow' : 'Reference brief'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
                {!readOnly && (
                  <div className="library-actions">
                    {projectId ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void change(
                            async () => {
                              if (!installed)
                                await api('/library/install', 'POST', {
                                  id: pack.id,
                                  version: pack.version,
                                });
                              return api(`/projects/${projectId}/library/${pack.id}`, 'PUT', {
                                version: attached ? null : pack.version,
                                previousVersion: previous,
                              });
                            },
                            attached
                              ? 'Pack detached. Project documents are unchanged.'
                              : 'Pack attached. New chat turns use this version.',
                          )
                        }
                      >
                        {attached
                          ? 'Detach'
                          : !installed
                            ? 'Install & attach'
                            : previous
                              ? 'Use this version'
                              : 'Attach to project'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={installed ? '' : 'primary'}
                        disabled={busy || installed}
                        onClick={() =>
                          void change(
                            () =>
                              api('/library/install', 'POST', {
                                id: pack.id,
                                version: pack.version,
                              }),
                            'Pack installed. Select it in Project settings.',
                          )
                        }
                      >
                        {installed ? 'Installed' : 'Install pack'}
                      </button>
                    )}
                    <a className="text-link" href={`/api/library/packs/${pack.id}/${pack.version}`}>
                      Export pack
                    </a>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!projectId && (
        <p className="muted small library-footnote">
          Works locally after installation. Packs contain authored summaries and workflows, not
          complete statutes or government-approved forms. Detailed California and guild guides are
          available through Download more packs. Publisher links open external websites. Updates
          arrive with Frame releases or explicit file imports.
        </p>
      )}
    </section>
  );
}
