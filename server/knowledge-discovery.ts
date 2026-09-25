import { z } from 'zod';
import type { WorkerInput } from '../shared/types.js';
export const discoverySchema = z.object({
  description: z.string().trim().min(1).max(600),
  tags: z.array(z.string().trim().min(1).max(50)).max(12).default([]),
  aliases: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
  category: z
    .enum(['reference', 'definition', 'calculation_rule', 'query_recipe', 'procedure'])
    .default('reference'),
});
const words = (text: string) => [...new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [])];
const stop = new Set([
  'a',
  'an',
  'the',
  'what',
  'how',
  'is',
  'are',
  'to',
  'for',
  'of',
  'in',
  'and',
  'please',
  'can',
  'you',
  'our',
  'this',
  'that',
  'with',
]);
export function rankKnowledge(documents: NonNullable<WorkerInput['knowledge']>, query: string) {
  const terms = words(query).filter((t) => !stop.has(t));
  if (!terms.length) return documents.map((doc) => ({ doc, score: 0 }));
  return documents
    .map((doc) => {
      const title = words(doc.name),
        tags = words((doc.tags || []).join(' '));
      const aliases = words((doc.aliases || []).join(' '));
      const description = words(doc.description || ''),
        body = new Set(words(doc.text));
      const score = terms.reduce(
        (sum, t) =>
          sum +
          (title.includes(t) ? 8 : 0) +
          (aliases.includes(t) ? 7 : 0) +
          (tags.includes(t) ? 6 : 0) +
          (description.includes(t) ? 4 : 0) +
          (body.has(t) ? 1 : 0),
        0,
      );
      return { doc, score: score ? score + (doc.verified ? 2 : 0) : 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name));
}

export function knowledgeHints(
  documents: NonNullable<WorkerInput['knowledge']>,
  query: string,
  budget: number,
) {
  const entries: unknown[] = [];
  for (const { doc } of rankKnowledge(documents, query).slice(0, 5)) {
    const entry = {
      id: doc.id,
      title: doc.name,
      description: doc.description?.slice(0, 300),
      verified: doc.verified,
    };
    if (Buffer.byteLength(JSON.stringify([...entries, entry])) > budget) break;
    entries.push(entry);
  }
  return JSON.stringify(entries);
}
