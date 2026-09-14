import { createHash } from 'node:crypto';
import { estimateTokens } from '@earendil-works/pi-coding-agent';
import type { ChatMetrics, ModelSettings, Project } from '../shared/types.js';

/** Scale to the configured llama.cpp slot, leaving generation and framing headroom. */
export function contextBudget(settings: ModelSettings) {
  const safety = Math.max(256, Math.ceil(settings.contextWindow * 0.03));
  const reserveTokens = Math.max(
    Math.ceil(settings.contextWindow * (1 - settings.compactAtPercent / 100)),
    settings.maxTokens + safety,
  );
  const threshold = Math.max(1, settings.contextWindow - reserveTokens);
  return {
    reserveTokens,
    threshold,
    keepRecentTokens: Math.max(128, Math.min(8000, Math.floor(threshold * 0.25))),
  };
}

export function emptyMetrics(settings: ModelSettings): ChatMetrics {
  return {
    context: {
      tokens: null,
      window: settings.contextWindow,
      estimated: true,
      threshold: contextBudget(settings).threshold,
      auto: settings.autoCompaction,
      prunedTokens: 0,
      compactions: 0,
    },
  };
}

export function metricsKey(settings: ModelSettings, project: Project) {
  // Never reuse a previous model's token count after a configuration change.
  return createHash('sha256')
    .update(
      JSON.stringify({
        baseUrl: settings.baseUrl,
        modelId: settings.modelId,
        contextWindow: settings.contextWindow,
        maxTokens: settings.maxTokens,
        instructions: settings.instructions,
        autoCompaction: settings.autoCompaction,
        compactAtPercent: settings.compactAtPercent,
        pruneToolOutputs: settings.pruneToolOutputs,
        project,
      }),
    )
    .digest('hex');
}

const readOnly = new Set(['read', 'read_knowledge', 'search_knowledge', 'ls', 'find', 'grep']);
const marker = '[Frame: older read-only output shortened';

/** An ephemeral provider projection. Never mutate native messages or remove call/result pairs. */
export function pruneToolOutputs<T extends { role: string }>(messages: T[], window: number) {
  let userTurns = 0;
  let protectedFrom = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user' && ++userTurns === 2) {
      protectedFrom = i;
      break;
    }
  }
  const limit = Math.max(2000, Math.min(8000, Math.floor(window * 0.25)));
  let saved = 0;
  const projected = messages.map((message, i) => {
    const m = message as T & {
      toolName?: string;
      isError?: boolean;
      content?: { type: string; text?: string }[];
    };
    if (
      i >= protectedFrom ||
      m.role !== 'toolResult' ||
      m.isError ||
      !readOnly.has(m.toolName || '') ||
      !Array.isArray(m.content)
    )
      return message;
    const content = m.content.map((part) => {
      if (
        part.type !== 'text' ||
        !part.text ||
        part.text.length <= limit ||
        part.text.includes(marker)
      )
        return part;
      const text = `${part.text.slice(0, Math.floor(limit * 0.65))}\n\n${marker}; full result remains in conversation history. Re-read the source if needed.]\n\n${part.text.slice(-Math.floor(limit * 0.2))}`;
      saved += Math.max(0, Math.ceil((part.text.length - text.length) / 4));
      return { ...part, text };
    });
    return { ...message, content };
  });
  return { messages: projected, saved };
}

export function estimateMessages(messages: readonly unknown[]): number {
  return messages.reduce<number>(
    (sum, message) => sum + estimateTokens(message as Parameters<typeof estimateTokens>[0]),
    0,
  );
}

export const compactionInstructions =
  'Create a concise continuation checkpoint. Preserve the user goal, constraints, exact identifiers and file paths, important facts with source references, decisions and their reasons, unresolved questions, errors, pending work, and which tool actions already completed. Never present unverified claims as facts. Omit repeated prose and bulky logs. Preserve references to knowledge pages and artifacts. Do not execute or repeat tools. Aim for a short structured summary, not a transcript.';
