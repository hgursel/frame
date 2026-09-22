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
    // A reasoning model may spend the entire old 700-token cap before emitting any JSON.
    // Keep the answer small, but allow one retry up to the configured output limit.
    let ceiling = Math.min(
      settings.maxTokens,
      Math.floor(settings.contextWindow / 2),
      Math.max(128, settings.contextWindow - 512 - Buffer.byteLength(request.system) - 768),
    );
    let maxTokens = Math.min(Math.max(1024, request.maxTokens), ceiling);
    let promptLimit = 8192;
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    for (let attempt = 0; attempt < 3; attempt++) {
      boundedSignal.throwIfAborted();
      // One byte per token is conservative for catalog identifiers and multilingual descriptions.
      const budget = Math.min(
        promptLimit,
        settings.contextWindow - maxTokens - 512 - Buffer.byteLength(request.system),
      );
      if (budget < 256)
        throw new Error('The configured context window is too small for a knowledge request.');
      const prompt = shorten(request.prompt, budget);
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
          // llama.cpp supports these per-request options; normal chat thinking is unchanged.
          response_format: { type: 'json_object' },
          chat_template_kwargs: { enable_thinking: false },
          reasoning_effort: 'none',
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const raw = await readBounded(response, response.ok ? 1_000_000 : 16_384);
      boundedSignal.throwIfAborted();
      if (!response.ok) {
        // Some servers run a smaller per-slot context than Frame's configured window.
        // Retry this read-only generation with a smaller excerpt, never with catalog history.
        let error: any;
        try {
          error = JSON.parse(raw)?.error;
        } catch {
          /* Generic HTTP error below. */
        }
        const contextError =
          [400, 413].includes(response.status) &&
          (error?.type === 'exceed_context_size_error' ||
            /(?:context|prompt).*(?:exceed|too (?:large|long))|(?:exceed|too (?:large|long)).*(?:context|prompt)/i.test(
              String(error?.message || ''),
            ));
        if (contextError) {
          if (attempt < 2) {
            promptLimit = Math.floor(Buffer.byteLength(prompt) / 2);
            ceiling = Math.max(128, Math.floor(maxTokens / 2));
            maxTokens = ceiling;
            continue;
          }
          throw new Error(
            'This single-item request exceeds the llama.cpp context. Match Frame’s context window to the server’s per-slot size. Completed notes are kept.',
          );
        }
        throw new Error(
          `Local model returned ${response.status}. Check the endpoint and model ID.`,
        );
      }
      const body = JSON.parse(raw) as any;
      if (body?.choices?.[0]?.finish_reason === 'length') {
        if (attempt < 2 && maxTokens < ceiling) {
          maxTokens = ceiling;
          continue;
        }
        throw new Error(
          `This single-item response reached its ${maxTokens}-token output limit. Increase Maximum output tokens in Model settings or use a non-thinking template. Completed notes are kept.`,
        );
      }
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new Error('Local model returned no completion text.');
      return text;
    }
    throw new Error('Local knowledge generation could not complete this item.');
  }
}
/** Preserve the object identity and trailing JSON instructions without splitting UTF-8 characters. */
function shorten(prompt: string, budget: number) {
  const bytes = Buffer.from(prompt);
  if (bytes.length <= budget) return prompt;
  const marker = '\n[Catalog excerpt shortened]\n';
  const available = budget - Buffer.byteLength(marker);
  const shape = prompt.lastIndexOf('Reply with exactly this JSON shape:');
  const instructions = shape >= 0 ? Buffer.byteLength(prompt.slice(shape)) : 0;
  if (instructions > available - 64)
    throw new Error(
      'This single-item request cannot fit its JSON instructions in the available context. Check the llama.cpp per-slot size and Frame context setting. Completed notes are kept.',
    );
  const tail = Math.max(instructions, Math.ceil(available * 0.4));
  const head = available - tail;
  // Streaming decoding drops an incomplete trailing code point; skip leading continuation bytes.
  const prefix = new TextDecoder().decode(bytes.subarray(0, head), { stream: true });
  let start = bytes.length - tail;
  while ((bytes[start]! & 0xc0) === 0x80) start++;
  return prefix + marker + bytes.subarray(start).toString('utf8');
}
async function readBounded(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Local model returned no response body.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if ((bytes += part.value.byteLength) > limit)
        throw new Error('Local model response exceeded its size limit.');
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  return Buffer.concat(chunks).toString('utf8');
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
