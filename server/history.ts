import { existsSync, readFileSync } from 'node:fs';
import type { DisplayMessage } from '../shared/types.js';

/** A read-only display projection of Pi JSONL, never an independent transcript store. */
export function displayMessages(messages: unknown[]): DisplayMessage[] {
  const projected = messages
    .flatMap<DisplayMessage>((value) => {
      if (!value || typeof value !== 'object') return [];
      const m = value as Record<string, unknown>;
      if (!['user', 'assistant', 'toolResult'].includes(String(m.role))) return [];
      const text =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('\n')
            : '';
      return [
        {
          role: m.role === 'toolResult' ? 'tool' : (m.role as 'user' | 'assistant'),
          text: text.slice(0, 100_000),
          name: m.toolName as string | undefined,
          failed: !!m.isError || m.stopReason === 'error',
        },
      ];
    })
    .slice(-100);
  // Bound complete SSE snapshots while leaving native history untouched on disk.
  let budget = 500_000;
  return projected
    .reverse()
    .flatMap((message) => {
      if (budget <= 0) return [];
      const text = message.text.slice(0, budget);
      budget -= text.length;
      return [
        {
          ...message,
          text: text.length < message.text.length ? `${text}\n[Display truncated]` : text,
        },
      ];
    })
    .reverse();
}

export function readHistory(file: string): DisplayMessage[] {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n');
  const entries: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.trim()) continue;
    try {
      entries.push(JSON.parse(lines[i]!));
    } catch {
      if (i !== lines.length - 1)
        throw new Error('Session history is damaged; restore from backup.');
    }
  }
  // Follow native parent IDs so a future branch does not leak unrelated messages into the UI.
  const indexed = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
  let current = entries.filter((e) => e.id).at(-1);
  const branch: any[] = [];
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    branch.push(current);
    current = indexed.get(current.parentId);
  }
  return displayMessages(
    branch
      .reverse()
      .filter((e) => e.type === 'message')
      .map((e) => e.message),
  );
}
