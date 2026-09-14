import React from 'react';

export function Thinking({ text, active }: { text?: string; active?: boolean }) {
  if (!text && !active) return null;
  return (
    <details className={`thinking ${active ? 'thinking-active' : ''}`}>
      <summary>
        <span className="thinking-orbit" aria-hidden="true" />
        <span>{active ? 'Thinking…' : 'Thought process'}</span>
        <span className="thinking-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <pre aria-label="Model thinking">{text || 'Waiting for the model’s reasoning…'}</pre>
    </details>
  );
}
