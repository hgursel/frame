import { existsSync, readFileSync } from 'node:fs';
import type { DisplayMessage } from '../shared/types.js';

/** A read-only display projection of Pi JSONL, never an independent transcript store. */
export function displayMessages(messages: unknown[], activeThinking = false): DisplayMessage[] {
  let attachments: { id: string; name: string }[] | undefined;
  const projected = messages
    .flatMap<DisplayMessage>((value) => {
      if (!value || typeof value !== 'object') return [];
      const m = value as Record<string, unknown>;
      if (m.role === 'custom' && m.customType === 'frame_documents') {
        attachments = (m.details as { documents?: { id: string; name: string }[] })?.documents;
        return [];
      }
      if (!['user', 'assistant', 'toolResult'].includes(String(m.role))) return [];
      let text =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('\n')
            : '';
      let thinking = Array.isArray(m.content)
        ? m.content
            .filter((p: any) => p.type === 'thinking')
            .map((p: any) => p.thinking || '')
            .join('\n')
        : '';
      // Some llama.cpp templates send leading <think> tags in ordinary content.
      // Only interpret a leading block; quoted tags later in an answer remain visible.
      let openTag = false;
      if (m.role === 'assistant' && text.trimStart().startsWith('<think>')) {
        const raw = text.trimStart().slice(7);
        const close = raw.indexOf('</think>');
        openTag = close < 0;
        thinking = [thinking, close < 0 ? raw : raw.slice(0, close)].filter(Boolean).join('\n');
        text = close < 0 ? '' : raw.slice(close + 8).trimStart();
      }
      const attached = m.role === 'user' ? attachments : undefined;
      if (m.role === 'user') attachments = undefined;
      return [
        {
          role: m.role === 'toolResult' ? 'tool' : (m.role as 'user' | 'assistant'),
          text: text.slice(0, 100_000),
          name: m.toolName as string | undefined,
          failed: !!m.isError || m.stopReason === 'error',
          thinking: thinking ? thinking.slice(0, 100_000) : undefined,
          thinkingActive: m.role === 'assistant' && (openTag || activeThinking),
          attachments: attached,
          proposal:
            m.role === 'toolResult' ? (m.details as any)?.frameKnowledgeProposal : undefined,
          sqlResult: m.role === 'toolResult' ? (m.details as any)?.sqlResult : undefined,
          knowledgeSourceId:
            m.role === 'toolResult' ? (m.details as any)?.knowledgeSourceId : undefined,
        },
      ];
    })
    .slice(-100);
  // Bound complete SSE snapshots while leaving native history untouched on disk.
  let budget = 500_000;
  const lastMessage = projected.at(-1);
  return projected
    .reverse()
    .flatMap((message) => {
      if (budget <= 0) return [];
      const text = message.text.slice(0, budget);
      budget -= text.length;
      const thinking = message.thinking?.slice(0, budget);
      budget -= thinking?.length || 0;
      return [
        {
          ...message,
          text: text.length < message.text.length ? `${text}\n[Display truncated]` : text,
          thinking,
          thinkingActive: activeThinking && message === lastMessage && message.thinkingActive,
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
      .filter((e) => e.type === 'message' || e.type === 'custom_message')
      .map((e) => (e.type === 'message' ? e.message : { ...e, role: 'custom' })),
  );
}
