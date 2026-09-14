import React from 'react';
import type { ChatMetrics, PublicSettings } from '../shared/types.js';

export const tokenCount = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function ContextPanel({
  metrics,
  settings,
  running,
  canCompact,
  onCompact,
  onSettings,
}: {
  metrics?: ChatMetrics;
  settings?: PublicSettings;
  running: boolean;
  canCompact: boolean;
  onCompact: () => void;
  onSettings: () => void;
}) {
  const c = metrics?.context;
  const window = c?.window ?? settings?.contextWindow ?? 32768;
  const percent = c?.tokens != null ? (c.tokens / window) * 100 : null;
  return (
    <details className="context-control">
      <summary aria-label="Context usage">
        <svg className="context-ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle
            cx="12"
            cy="12"
            r="9"
            pathLength="100"
            strokeDasharray={`${Math.min(100, percent || 0)} 100`}
          />
        </svg>
        <span>
          Context{' '}
          <strong>
            {percent === null
              ? tokenCount(window)
              : `${c?.estimated ? '~' : ''}${Math.round(percent)}%`}
          </strong>
        </span>
      </summary>
      <div className="context-popover">
        <div className="context-title">
          <strong>Conversation context</strong>
          <span>{tokenCount(window)} tokens</span>
        </div>
        <div className="context-total">
          {c?.tokens == null
            ? 'Not measured yet'
            : `${c.estimated ? '≈ ' : ''}${c.tokens.toLocaleString()} tokens used`}
        </div>
        <progress aria-label="Context used" max={100} value={Math.min(100, percent || 0)} />
        <p>
          {c?.tokens == null
            ? 'Usage appears after the conversation starts.'
            : c.estimated
              ? 'Estimated from current messages. The model’s tokenizer and template may differ.'
              : 'Reported by the local model for its latest completed response, including output.'}
        </p>
        <dl>
          <div>
            <dt>Auto compaction</dt>
            <dd>
              {(c?.auto ?? settings?.autoCompaction)
                ? `At ${Math.round(((c?.threshold ?? (window * (settings?.compactAtPercent ?? 75)) / 100) / window) * 100)}%`
                : 'Off'}
            </dd>
          </div>
          <div>
            <dt>Output limit</dt>
            <dd>{tokenCount(settings?.maxTokens ?? 4096)} tokens</dd>
          </div>
          <div>
            <dt>Checkpoints</dt>
            <dd>{c?.compactions ?? 0}</dd>
          </div>
        </dl>
        {!!c?.prunedTokens && (
          <p>
            Older read-only tool text shortened by approximately {tokenCount(c.prunedTokens)} tokens
            on the latest request. Full results remain in chat history.
          </p>
        )}
        {c?.lastCompaction && (
          <details className="checkpoint">
            <summary>
              Last checkpoint · {tokenCount(c.lastCompaction.before)} → ≈
              {tokenCount(c.lastCompaction.after)} tokens
            </summary>
            <pre>{c.lastCompaction.summary}</pre>
          </details>
        )}
        <p>
          Compaction summarizes older context and keeps recent exchanges. Your conversation stays on
          disk.
        </p>
        <div className="context-actions">
          <button className="primary" disabled={!canCompact || running} onClick={onCompact}>
            Compact now
          </button>
          <button onClick={onSettings}>Settings</button>
        </div>
      </div>
    </details>
  );
}

export function Throughput({ metrics, running }: { metrics?: ChatMetrics; running: boolean }) {
  const g = metrics?.generation;
  if (!g) return null;
  return (
    <span
      className="throughput"
      title={`${running ? 'Current' : 'Last'} model response. ${g.estimated ? 'Token count estimated from text.' : 'Output tokens reported by the model.'} Rate uses browser-independent server timing from the first streamed token; excludes prefill and tool execution. Includes reasoning when reported by the model. Short single-chunk responses have no reliable rate.`}
    >
      <span className={running ? 'speed-dot active' : 'speed-dot'} />
      {g.tokensPerSecond == null
        ? `${tokenCount(g.tokens)} tokens`
        : `${g.estimated ? '≈ ' : ''}${g.tokensPerSecond.toFixed(1)} tok/s`}
      <span className="speed-label">{running ? 'generating' : 'last response'}</span>
    </span>
  );
}

export function CopyMessage({ text }: { text: string }) {
  const [notice, setNotice] = React.useState('');
  return (
    <button
      className="copy-message"
      aria-label="Copy response"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => setNotice('Copied'),
          () => setNotice('Copy unavailable'),
        );
      }}
    >
      {notice || 'Copy'}
    </button>
  );
}
