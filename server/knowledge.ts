import { randomUUID, createHash } from 'node:crypto';
import { mkdir, realpath, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { Store } from './store.js';
import { openArtifact } from './security.js';
import { documentCommand, PythonRuntime } from './python.js';
import type { KnowledgeDocument } from '../shared/types.js';

const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TEXT = 120_000;
export class Knowledge {
  readonly locks = new Set<string>();
  constructor(
    readonly store: Store,
    readonly python: PythonRuntime,
  ) {}
  async write<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    if (this.locks.has(projectId))
      throw fail('Another file operation is in progress in this project.', 409);
    this.locks.add(projectId);
    try {
      return await action();
    } finally {
      this.locks.delete(projectId);
    }
  }
  list(projectId: string): KnowledgeDocument[] {
    return (
      this.store.db
        .prepare('SELECT * FROM documents WHERE projectId=? ORDER BY updatedAt DESC')
        .all(projectId) as unknown as KnowledgeDocument[]
    ).map((d) => ({ ...d, truncated: !!d.truncated }));
  }
  get(projectId: string, id: string) {
    const doc = this.list(projectId).find((d) => d.id === id);
    if (!doc) throw fail('Document not found in this project.', 404);
    return doc;
  }
  directory(doc: Pick<KnowledgeDocument, 'projectId' | 'id'>) {
    return path.join(this.store.projectPath(doc.projectId), 'knowledge', doc.id);
  }
  async folder(projectId: string, ...parts: string[]) {
    let directory = this.store.projectPath(projectId);
    if ((await realpath(directory)) !== directory)
      throw fail('Project directory has been replaced.', 409);
    for (const part of ['knowledge', ...parts]) {
      directory = path.join(directory, part);
      await mkdir(directory, { mode: 0o700 }).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
      if ((await realpath(directory)) !== directory)
        throw fail('Knowledge directory has been replaced.', 409);
    }
    return directory;
  }
  async atomic(directory: string, filename: string, text: string) {
    const temporary = path.join(directory, `.edit-${randomUUID()}`);
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
    try {
      await rename(temporary, path.join(directory, filename));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async checkedDirectory(doc: Pick<KnowledgeDocument, 'projectId' | 'id'>) {
    const directory = this.directory(doc);
    if ((await realpath(directory)) !== directory)
      throw fail('Document directory has been moved or replaced.', 409);
    return directory;
  }
  async read(projectId: string, id: string) {
    const doc = this.get(projectId, id);
    const { file } = await openArtifact(await this.checkedDirectory(doc), 'content.md');
    try {
      if ((await file.stat()).size > 500_000) throw fail('Text is too large to preview.');
      const text = await file.readFile('utf8');
      return { ...doc, text, revision: hash(text) };
    } finally {
      await file.close();
    }
  }
  async add(
    projectId: string,
    name: string,
    content: Buffer,
    kind: 'upload' | 'wiki' = 'upload',
    reservedId?: string,
  ) {
    if (
      !name ||
      name.length > 180 ||
      name !== path.basename(name) ||
      /[\x00-\x1f\\]/.test(name) ||
      name.startsWith('.')
    )
      throw fail('Use a plain document filename.');
    const extension = path.extname(name).toLowerCase();
    if (kind === 'wiki' && (extension !== '.md' || content.length > 120_000))
      throw fail('Knowledge pages must be Markdown text up to 120 KB.', 413);
    if (!['.md', '.txt', '.csv', '.pdf', '.docx'].includes(extension))
      throw fail('Supported files: Markdown, TXT, CSV, PDF, and DOCX.');
    if (!content.length || content.length > MAX_FILE)
      throw fail('Files must contain data and be no larger than 10 MiB.', 413);
    const existing = this.list(projectId);
    if (
      reservedId &&
      (!/^[a-f0-9-]{36}$/.test(reservedId) || existing.some((d) => d.id === reservedId))
    )
      throw fail('Invalid reserved document identity.');
    if (
      existing.length >= 100 ||
      existing.reduce((sum, d) => sum + d.bytes, 0) + content.length > 100 * 1024 * 1024
    )
      throw fail('Project knowledge limit reached (100 files / 100 MiB).', 413);
    if (extension === '.pdf' && !content.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      throw fail('This file is not a PDF.');
    if (extension === '.docx' && content.subarray(0, 2).toString() !== 'PK')
      throw fail('This file is not a DOCX.');
    const doc: KnowledgeDocument = {
      id: reservedId || randomUUID(),
      projectId,
      name,
      kind,
      extension,
      bytes: content.length,
      revision: '',
      truncated: false,
      updatedAt: new Date().toISOString(),
    };
    const directory = this.directory(doc);
    await this.folder(projectId, doc.id);
    try {
      await this.checkedDirectory(doc);
      await writeFile(path.join(directory, `source${extension}`), content, {
        mode: 0o600,
        flag: 'wx',
      });
      let text: string;
      if (extension === '.pdf' || extension === '.docx') {
        if ((await this.python.status()).state !== 'ready')
          throw fail('Install document tools in Settings to upload PDF/DOCX files.', 422);
        let result;
        try {
          result = await documentCommand(this.python.executable, {
            command: 'extract',
            path: path.join(directory, `source${extension}`),
            extension,
          });
        } catch (e) {
          throw fail((e as Error).message, 422);
        }
        text = result.text;
        doc.truncated = result.truncated;
      } else {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(content);
        } catch {
          throw fail('Text documents must use UTF-8 encoding.');
        }
        if (text.includes('\0')) throw fail('Binary files are not supported.');
        doc.truncated = text.length > MAX_TEXT;
        text = text.slice(0, MAX_TEXT);
      }
      doc.revision = hash(text);
      await writeFile(path.join(directory, 'content.md'), text, { mode: 0o600, flag: 'wx' });
      this.store.db
        .prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          doc.id,
          projectId,
          name,
          kind,
          extension,
          doc.bytes,
          doc.revision,
          Number(doc.truncated),
          doc.updatedAt,
        );
      return doc;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  async edit(projectId: string, id: string, revision: string, text: string) {
    if (text.length > MAX_TEXT || Buffer.byteLength(text) > 120_000 || text.includes('\0'))
      throw fail('Markdown content must be UTF-8 text up to 120 KB.');
    const doc = await this.read(projectId, id);
    if (doc.kind !== 'wiki' || doc.truncated)
      throw fail('Source documents are preserved. Create a knowledge page to synthesize them.');
    if (doc.revision !== revision)
      throw fail('This document changed since you opened it. Reload it before saving.', 409);
    const directory = await this.checkedDirectory(doc);
    const temporary = path.join(directory, `.edit-${randomUUID()}`);
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path.join(directory, 'content.md'));
    // Markdown downloads always read content.md; source.md retains the originally uploaded copy.
    this.store.db
      .prepare('UPDATE documents SET revision=?, bytes=?, updatedAt=? WHERE id=?')
      .run(hash(text), Buffer.byteLength(text), new Date().toISOString(), id);
    return this.read(projectId, id);
  }
  async context(projectId: string, ids: string[], contextWindow: number) {
    if (new Set(ids).size !== ids.length || ids.length > 5)
      throw fail('Attach up to five distinct documents.');
    const documents = [];
    let budget = Math.min(24000, Math.floor(contextWindow / 2));
    for (const id of ids) {
      const doc = await this.read(projectId, id);
      const limit = Math.floor(budget / (ids.length - documents.length));
      const text = doc.text.slice(0, limit);
      budget -= text.length;
      documents.push({
        id,
        name: doc.name,
        text:
          text +
          (text.length < doc.text.length || doc.truncated
            ? '\n[Excerpt truncated. Ask for specific sections if needed.]'
            : ''),
      });
    }
    return documents;
  }
}
