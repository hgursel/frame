import React, { useEffect, useState } from 'react';
import type { DownloadCatalogEntry } from '../shared/library.js';
import { api } from './api.js';

export function DownloadCatalog({
  onBack,
  onInstalled,
}: {
  onBack: () => void;
  onInstalled: () => Promise<unknown>;
}) {
  const [entries, setEntries] = useState<DownloadCatalogEntry[]>();
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError('');
    void api<DownloadCatalogEntry[]>('/library/downloads').then(
      (result) => {
        if (alive) setEntries(result);
      },
      (e) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const act = async (entry: DownloadCatalogEntry, action: 'install' | 'download') => {
    setBusy(`${entry.id}:${action}`);
    setError('');
    setNotice('');
    const endpoint = `/library/downloads/${entry.id}/${entry.version}/${action}`;
    try {
      if (action === 'install') {
        await api(endpoint, 'POST');
        setEntries((items) =>
          items?.map((item) =>
            item.id === entry.id && item.version === entry.version
              ? { ...item, installed: true }
              : item,
          ),
        );
        await onInstalled();
        setNotice(
          `${entry.title} installed. Return to the library and attach it in Project settings when needed.`,
        );
      } else {
        const response = await fetch(`/api${endpoint}`, {
          method: 'POST',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
          if (response.status === 401) window.dispatchEvent(new Event('frame-signed-out'));
          const body = await response.json().catch(() => undefined);
          throw new Error(body?.error || `Download failed (HTTP ${response.status}).`);
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = `${entry.id}-${entry.version}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNotice(
          `${entry.title} downloaded as JSON. Downloading does not install or attach the pack.`,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = entries?.filter((entry) => {
    const text = [
      entry.title,
      entry.description,
      ...entry.jurisdiction,
      ...entry.pages.flatMap((p) => [p.title, p.description, ...p.tags]),
    ]
      .join(' ')
      .toLowerCase();
    return (
      (collection === 'all' || entry.collection === collection) &&
      terms.every((term) => text.includes(term))
    );
  });
  return (
    <section className="library-panel library-download-catalog" aria-label="Browse knowledge packs">
      <div className="library-heading">
        <div>
          <span className="settings-eyebrow">PACK CATALOG</span>
          <h2>Browse knowledge packs</h2>
          <p className="muted">
            Explore detailed guides and reference briefs. Install in Frame or save a JSON copy to
            use elsewhere.
          </p>
        </div>
        <button disabled={!!busy} onClick={onBack}>
          Back to library
        </button>
      </div>
      <p className="muted small">
        Browsing works offline. Downloading optional packs connects to Frame’s public GitHub
        repository; no project content is sent. Installed packs work offline and are attached to
        projects separately.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          {!entries && <button onClick={() => setAttempt((n) => n + 1)}>Retry catalog</button>}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="library-toolbar">
        <input
          type="search"
          aria-label="Search downloadable packs"
          placeholder="Search topics, industries, or sections…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter pack collection"
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
        >
          <option value="all">All collections</option>
          {[...new Set(entries?.map((p) => p.collection))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      {!entries && !error && <p role="status">Loading catalog…</p>}
      {entries && (
        <p className="muted small" role="status">
          {visible!.length} of {entries.length} packs
        </p>
      )}
      {visible?.length === 0 && <p>No packs match your search. Try another topic or collection.</p>}
      <div className="library-grid" aria-busy={!!busy}>
        {visible?.map((entry) => (
          <article className="library-card" key={`${entry.id}:${entry.version}`}>
            <div className="library-row-title">
              <h3>{entry.title}</h3>
              <p className="muted small">
                {entry.collection} · v{entry.version} · {entry.sections} sections
              </p>
            </div>
            <span className="library-badge">
              {entry.installed
                ? 'Installed'
                : entry.type === 'bundled-brief'
                  ? 'Included'
                  : 'Optional'}
            </span>
            <div className="library-actions">
              <button
                disabled={!!busy || entry.installed}
                onClick={() => void act(entry, 'install')}
              >
                {busy === `${entry.id}:install`
                  ? 'Installing…'
                  : entry.installed
                    ? 'Installed'
                    : 'Install pack'}
              </button>
              <button disabled={!!busy} onClick={() => void act(entry, 'download')}>
                {busy === `${entry.id}:download` ? 'Downloading…' : 'Download JSON'}
              </button>
            </div>
            <details>
              <summary>Pack details &amp; sections</summary>
              <p>{entry.description}</p>
              <p className="muted small">
                {entry.jurisdiction.join(' · ')}
                <br />
                Source review: {entry.reviewedAt} · {entry.words.toLocaleString()} words ·{' '}
                {entry.sources} source URLs · {(entry.bytes / 1024).toFixed(0)} KB
              </p>
              <ul className="library-sections">
                {entry.pages.map((page) => (
                  <li key={page.id}>
                    <strong>{page.title}</strong>
                    <span className="muted small">{page.description}</span>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
      <p className="muted small library-footnote">
        The catalog updates with Frame releases. Downloads are verified before use. Guides provide
        authored discussion material and counsel questions, not complete statutes or
        attorney-reviewed advice. Verify current rules and local requirements with counsel.
      </p>
    </section>
  );
}
