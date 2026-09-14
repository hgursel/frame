import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function CopyCode({ source }: { source: string }) {
  const [notice, setNotice] = useState('');
  return <button type="button" onClick={() => {
    void navigator.clipboard.writeText(source).then(() => setNotice('Copied'), () => setNotice('Copy unavailable'));
  }}>{notice || 'Copy code'}</button>;
}

// Serialize Mermaid's global configuration/render state, and load it only when needed.
let renderQueue: Promise<unknown> = Promise.resolve();
function diagram(source: string, dark: boolean): Promise<string> {
  const task = renderQueue.then(async () => {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
      theme: dark ? 'dark' : 'default', layout: 'dagre', look: 'classic',
      fontFamily: 'Arial, sans-serif', maxTextSize: 20000, maxEdges: 200,
      flowchart: { htmlLabels: false },
    });
    const host = document.createElement('div');
    host.className = 'mermaid-render-host';
    host.setAttribute('aria-hidden', 'true');
    document.body.append(host);
    try {
      const { svg } = await mermaid.render('frame-diagram-' + crypto.randomUUID(), source, host);
      if (svg.length > 1_000_000) throw new Error('Diagram is too large');
      // An SVG image cannot run script or access the application DOM.
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } finally { host.remove(); }
  });
  renderQueue = task.catch(() => {});
  return task;
}

export function MermaidBlock({ source, streaming = false }: { source: string; streaming?: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const zoom = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setUrl(''); setError('');
    if (streaming) return () => { active = false; };
    // Do not allow diagram text to override configuration or request external resources.
    const unsupported = source.length > 20000 ||
      /^\s*---|%%\s*\{|https?:|data:|\burl\s*\(|\bclick\s|\b(?:img|image|icon|href|src)\s*[:=(]|<\s*(?:script|iframe|svg|foreignObject|img|image)\b/im.test(source);
    if (unsupported) {
      setError('This diagram uses unsupported resources/configuration or exceeds the size limit. Its source is available below.');
      return () => { active = false; };
    }
    void diagram(source, dark).then(
      (value) => { if (active) setUrl(value); },
      () => { if (active) setError('This Mermaid diagram could not be rendered. Check its syntax in the source below.'); },
    );
    return () => { active = false; };
  }, [source, streaming, dark]);
  return <figure className="diagram-block">
    <figcaption><span>Mermaid diagram</span><div><CopyCode source={source} />
      {url && <button type="button" onClick={() => zoom.current?.showModal()}>Expand diagram</button>}
    </div></figcaption>
    {url ? <img src={url} alt="Mermaid diagram" /> : <p className="muted">{error || (streaming ? 'Diagram will render when the response finishes…' : 'Rendering diagram…')}</p>}
    <details open={!!error}><summary>Diagram source</summary><pre><code>{source}</code></pre></details>
    <dialog ref={zoom} className="diagram-dialog" aria-label="Expanded Mermaid diagram">
      <button type="button" onClick={() => zoom.current?.close()}>Close diagram</button>
      {url && <img src={url} alt="Expanded Mermaid diagram" />}
    </dialog>
  </figure>;
}

export const RichMarkdown = React.memo(function RichMarkdown({ text, streaming = false, onOpen }: {
  text: string; streaming?: boolean; onOpen?: (id: string) => void;
}) {
  return <div className="rich-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img: () => <span className="muted">[External image omitted]</span>,
    a: ({ href, children }) => {
      const id = href?.match(/^(?:\/|\.\/)?([a-f0-9-]{36})\.md(?:#.*)?$/)?.[1];
      return id && onOpen
        ? <button type="button" className="text-link" onClick={() => onOpen(id)}>{children}</button>
        : <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
    },
    table: ({ children }) => <div className="markdown-table" role="region" aria-label="Markdown table" tabIndex={0}><table>{children}</table></div>,
    pre: ({ children }) => {
      const child = React.Children.toArray(children)[0];
      if (!React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) return <pre>{children}</pre>;
      const language = child.props.className?.match(/language-([\w-]+)/)?.[1] || 'text';
      const source = String(child.props.children ?? '').replace(/\n$/, '');
      return language === 'mermaid'
        ? <MermaidBlock source={source} streaming={streaming} />
        : <div className="code-block"><div className="code-caption"><span>{language}</span><CopyCode source={source} /></div><pre>{children}</pre></div>;
    },
  }}>{text}</Markdown></div>;
});
