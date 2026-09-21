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
    const maxTokens = Math.min(
      request.maxTokens,
      settings.maxTokens,
      Math.floor(settings.contextWindow / 4),
    );
    // Conservative byte budget leaves space for role/template overhead and the generated answer.
    const budget = Math.max(
      256,
      settings.contextWindow - maxTokens - 512 - Buffer.byteLength(request.system),
    );
    const rawPrompt = Buffer.from(request.prompt);
    const prompt =
      rawPrompt.length <= budget
        ? request.prompt
        : rawPrompt.subarray(0, Math.floor(budget * 0.65)).toString() +
          '\n[Catalog excerpt shortened]\n' +
          rawPrompt.subarray(-Math.floor(budget * 0.3)).toString();
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    const response = await fetch(endpoint + '/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: boundedSignal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.apiKey || 'frame-local-no-key'}`,
      },
      body: JSON.stringify({
        model: settings.modelId,
        temperature: 0,
        stream: false,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Local model returned ${response.status}. Check the endpoint and model ID.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Local model returned no response body.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        if ((bytes += part.value.byteLength) > 1_000_000)
          throw new Error('Local model response exceeded its size limit.');
        chunks.push(part.value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    boundedSignal.throwIfAborted();
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as any;
    if (body?.choices?.[0]?.finish_reason === 'length')
      throw new Error(
        'Local model exhausted its output limit. Increase the model output limit or use a model that can return concise JSON.',
      );
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
