import type { LibraryReference } from '../shared/library.js';
import { z } from 'zod';
import type { KnowledgePage } from '../shared/types.js';
export const discoverySchema = z.object({
  description: z.string().trim().min(1).max(600),
  tags: z.array(z.string().trim().min(1).max(50)).max(12).default([]),
  aliases: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
  category: z
    .enum(['reference', 'definition', 'calculation_rule', 'query_recipe', 'procedure'])
    .default('reference'),
});
const words = (text: string) => [
  ...new Set(
    text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replaceAll('_', ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[\p{L}\p{N}]+/gu) || [],
  ),
];
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
export function rankKnowledge(documents: KnowledgePage[], query: string) {
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

/** Bounded excerpts, not just an index: small models should not need a tool call to use memory. */
export function knowledgeContext(documents: KnowledgePage[], query: string, contextWindow: number) {
  const pages: {
    id: string;
    title: string;
    description?: string;
    text: string;
    verified: boolean;
    truncated: boolean;
    method: boolean;
    library?: LibraryReference;
  }[] = [];
  const budget = Math.min(12000, Math.floor(contextWindow / 2));
  for (const { doc, score } of rankKnowledge(documents, query)) {
    if (score < 4 || pages.length >= 3) continue;
    const page = {
      id: doc.id,
      title: doc.name,
      description: doc.description,
      text: doc.text.slice(0, 4500),
      verified: !!doc.verified,
      truncated: doc.text.length > 4500,
      method: !!doc.method,
      ...(doc.library ? { library: doc.library } : {}),
    };
    if (Buffer.byteLength(JSON.stringify([...pages, page])) > budget) continue;
    pages.push(page);
  }
  return pages;
}

/** Parent-side search_knowledge: a ranked page of catalog metadata, never page text. */
export function searchKnowledge(documents: KnowledgePage[], args: unknown) {
  const { query, offset } = z
    .object({ query: z.string().max(200), offset: z.number().int().min(0).default(0) })
    .parse(args);
  const matches = rankKnowledge(documents, query).map((r) => r.doc);
  return {
    total: matches.length,
    pages: matches
      .slice(offset, offset + 10)
      .map(({ id, name, revision, description, library }) => ({
        id,
        name,
        revision,
        description,
        library,
      })),
    nextOffset: offset + 10 < matches.length ? offset + 10 : null,
  };
}

/** Parent-side read_knowledge over the catalog captured at the start of the turn. */
export function readKnowledge(documents: KnowledgePage[], args: unknown, contextWindow: number) {
  const maximum = Math.min(6000, Math.floor(contextWindow / 2));
  const { id, offset, length } = z
    .object({
      id: z.string().max(300),
      offset: z.number().int().min(0).default(0),
      length: z.number().int().min(1).max(maximum).optional(),
    })
    .parse(args);
  const doc = documents.find((d) => d.id === id);
  if (!doc) throw new Error('Knowledge page not found in this project.');
  const end = offset + (length || maximum);
  return {
    id: doc.id,
    name: doc.name,
    revision: doc.revision,
    library: doc.library,
    text: doc.text.slice(offset, end),
    nextOffset: end < doc.text.length ? end : null,
  };
}
