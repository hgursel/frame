import type { StoredSettings } from '../../../shared/types.js';
import { localEndpoint } from '../../security.js';

export interface Generator {
  /** One bounded, non-streaming completion. Returns raw assistant text. */
  complete(
    request: { system: string; prompt: string; maxTokens: number },
    signal: AbortSignal,
  ): Promise<string>;
}
/**
 * Enrichment talks to the same local llama.cpp endpoint as chat, through the same private-address
 * guard. It is deliberately not a Pi agent session: no tools, no history, one JSON answer.
 */
export class LocalGenerator implements Generator {
  constructor(readonly settings: () => StoredSettings) {}
  async complete(
    request: { system: string; prompt: string; maxTokens: number },
    signal: AbortSignal,
  ) {
    const settings = this.settings();
    if (!settings.modelId) throw new Error('Configure your local model in Settings first.');
    const endpoint = localEndpoint(settings.baseUrl);
    const response = await fetch(endpoint + '/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.apiKey || 'frame-local-no-key'}`,
      },
      body: JSON.stringify({
        model: settings.modelId,
        temperature: 0,
        stream: false,
        max_tokens: Math.min(request.maxTokens, settings.maxTokens),
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(`Local model returned ${response.status}. Check the endpoint and model ID.`);
    const body = (await response.json()) as any;
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('Local model returned no completion text.');
    return text;
  }
}
/**
 * Small local models wrap JSON in prose or code fences. Take the outermost balanced object and
 * ignore the rest; a model that cannot produce one is treated as a failed item, never as facts.
 */
export function extractJson(text: string): any {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '{') depth++;
    else if (!quoted && ch === '}' && --depth === 0)
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return undefined;
      }
  }
  return undefined;
}
