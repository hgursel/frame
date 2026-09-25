import { readdir, realpath } from 'node:fs/promises';
import { z } from 'zod';
import type { Store } from '../../store.js';
import type { Knowledge } from '../../knowledge.js';
import { readSessionBranch } from '../../history.js';
import { openArtifact } from '../../security.js';
import { fail, markdownTables, parseCsv, parseMarkdown, type Dataset } from './data.js';

const MAX_SOURCE = 1_100_000;
const kind = z.enum(['document', 'message', 'file']);
export const sourceQuery = z
  .object({ kind: kind.optional(), offset: z.number().int().min(0).default(0) })
  .strict();
export const importQuery = z
  .object({
    kind,
    id: z.string().min(1).max(180),
    table: z.number().int().min(1).max(100).default(1),
  })
  .strict();
function messageText(message: any): string {
  let text =
    typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n')
        : '';
  if (message.role === 'assistant' && text.trimStart().startsWith('<think>')) {
    const end = text.indexOf('</think>');
    text = end < 0 ? '' : text.slice(end + 8);
  }
  return text;
}
export class ChartSources {
  constructor(
    readonly store: Store,
    readonly knowledge: Knowledge,
  ) {}
  messages(conversationId: string) {
    return (
      this.store.conversation(conversationId)?.incognito
        ? this.store.ephemeralBranch?.(conversationId) || []
        : readSessionBranch(this.store.sessionFile(conversationId))
    ).filter((e) => e.type === 'message' && ['user', 'assistant'].includes(e.message?.role));
  }
  async list(conversationId: string, args: unknown) {
    const spec = sourceQuery.parse(args);
    const conversation = this.store.conversation(conversationId)!;
    const sources: { kind: string; id: string; name: string; tables?: number; bytes?: number }[] =
      [];
    if (!spec.kind || spec.kind === 'document')
      for (const doc of this.knowledge.list(conversation.projectId)) {
        if (['.csv', '.md'].includes(doc.extension))
          sources.push({ kind: 'document', id: doc.id, name: doc.name, bytes: doc.bytes });
      }
    if (!spec.kind || spec.kind === 'message')
      for (const entry of this.messages(conversationId).slice(-100).reverse()) {
        const text = messageText(entry.message);
        if (Buffer.byteLength(text) > MAX_SOURCE) continue;
        const tables = markdownTables(text).length;
        if (tables)
          sources.push({
            kind: 'message',
            id: entry.id,
            name: `${entry.message.role === 'assistant' ? 'Assistant (unverified)' : 'User'}: ${text.replace(/\s+/g, ' ').slice(0, 100)}`,
            tables,
          });
      }
    if (!spec.kind || spec.kind === 'file') {
      const root = this.store.artifacts(conversation);
      const canonical = await realpath(root).catch((error) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (canonical && canonical !== root) throw fail('Artifact directory has been replaced.', 409);
      const files = canonical ? await readdir(root, { withFileTypes: true }) : [];
      for (const file of files.sort((a, b) => a.name.localeCompare(b.name)))
        if (file.isFile() && !file.name.startsWith('.') && /\.(csv|md)$/i.test(file.name))
          sources.push({ kind: 'file', id: file.name, name: file.name });
    }
    const page = sources.slice(spec.offset, spec.offset + 20);
    return {
      sources: page,
      nextOffset: spec.offset + page.length < sources.length ? spec.offset + page.length : null,
    };
  }
  async read(conversationId: string, args: unknown): Promise<Dataset> {
    const spec = importQuery.parse(args);
    const conversation = this.store.conversation(conversationId)!;
    let text: string,
      name: string,
      csv = false;
    if (spec.kind === 'message') {
      const entry = this.messages(conversationId).find((e) => e.id === spec.id);
      if (!entry) throw fail('Message not found in this conversation branch.', 404);
      text = messageText(entry.message);
      name = `${entry.message.role === 'assistant' ? 'Assistant (unverified)' : 'User'} message`;
    } else {
      let root: string, filename: string;
      if (spec.kind === 'document') {
        const doc = this.knowledge.get(conversation.projectId, spec.id);
        if (!['.csv', '.md'].includes(doc.extension))
          throw fail('Choose a CSV or Markdown source.');
        root = await this.knowledge.checkedDirectory(doc);
        // Chart original uploads, not the shortened knowledge/context preview.
        filename = doc.kind === 'wiki' ? 'content.md' : `source${doc.extension}`;
        name = doc.name;
        csv = doc.extension === '.csv';
      } else {
        if (!/\.(csv|md)$/i.test(spec.id)) throw fail('Choose a CSV or Markdown artifact.');
        root = this.store.artifacts(conversation);
        if ((await realpath(root)) !== root)
          throw fail('Artifact directory has been replaced.', 409);
        filename = spec.id;
        name = spec.id;
        csv = /\.csv$/i.test(spec.id);
      }
      const { file, size } = await openArtifact(root, filename);
      try {
        if (size > MAX_SOURCE)
          throw fail('Chart source exceeds 1 MB. Split or summarize it first.');
        // Bounded read also protects against an artifact growing while it is being read.
        const buffer = Buffer.alloc(MAX_SOURCE + 1);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        if (length > MAX_SOURCE) throw fail('Chart source exceeds 1 MB.');
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
        } catch {
          throw fail('Chart sources must use UTF-8 encoding.');
        }
      } finally {
        await file.close();
      }
    }
    if (Buffer.byteLength(text) > MAX_SOURCE || text.includes('\0'))
      throw fail('Chart sources must be text up to 1 MB.');
    if (csv && spec.table !== 1) throw fail('CSV files contain one table.');
    const data = csv ? parseCsv(text) : parseMarkdown(text, spec.table);
    data.source = { kind: spec.kind, name, id: spec.id, table: spec.table };
    // Retain provenance internally; never ask the model to recreate the source values.
    return data;
  }
}
