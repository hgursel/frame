import { randomUUID } from 'node:crypto';
import { writeFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { zipSync, strToU8 } from 'fflate';
import { Knowledge } from './knowledge.js';
import { openArtifact } from './security.js';

const label = (text: string) => text.replace(/[\[\]<>\r\n]/g, '');
export class Wiki {
  schemaFiles?: (projectId: string) => Record<string, string>;
  constructor(readonly knowledge: Knowledge) {
    knowledge.store.db.exec(
      'CREATE TABLE IF NOT EXISTS knowledge_revisions (id TEXT PRIMARY KEY, documentId TEXT NOT NULL, projectId TEXT NOT NULL, at TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL)',
    );
  }
  metadata(id: string): Record<string, any> {
    const row = this.knowledge.store.db
      .prepare(
        'SELECT metadata FROM knowledge_revisions WHERE documentId=? ORDER BY rowid DESC LIMIT 1',
      )
      .get(id) as { metadata: string } | undefined;
    return row ? JSON.parse(row.metadata) : {};
  }
  async record(
    projectId: string,
    id: string,
    options: {
      generatedBy?: string;
      verified?: boolean;
      evidence?: object;
      sourceIds?: string[];
    } = {},
  ) {
    const doc = await this.knowledge.read(projectId, id);
    const previous = this.metadata(id);
    const at = new Date().toISOString();
    const metadata: Record<string, any> = {
      ...previous,
      type: previous.type || (doc.kind === 'wiki' ? 'Knowledge Note' : 'Reference'),
      title: doc.name.replace(/\.md$/i, ''),
      description: doc.text.replace(/\s+/g, ' ').slice(0, 160),
      frame: { kind: doc.kind, extraction_truncated: doc.truncated },
      generated: {
        by:
          options.generatedBy ||
          (doc.kind === 'wiki' ? 'human:administrator' : 'frame-extractor/0.2.0'),
        at,
      },
      sources: previous.sources || [
        { id: 'original', resource: `../${id}/source${doc.extension}`, title: doc.name },
      ],
    };
    delete metadata.verified;
    if (options.verified) metadata.verified = [{ by: 'human:administrator', at }];
    for (const sourceId of options.sourceIds || []) {
      this.knowledge.get(projectId, sourceId);
      if (sourceId !== id && !metadata.sources.some((s: any) => s.resource === `/${sourceId}.md`))
        metadata.sources.push({ id: `document-${sourceId}`, resource: `/${sourceId}.md` });
    }
    if (options.evidence) {
      const name = `evidence-${randomUUID()}.json`;
      await writeFile(
        path.join(await this.knowledge.checkedDirectory(doc), name),
        JSON.stringify(options.evidence, null, 2),
        { mode: 0o600, flag: 'wx' },
      );
      metadata.sources.push({ resource: `../${id}/${name}`, title: 'Conversation evidence' });
    }
    this.knowledge.store.db
      .prepare('INSERT INTO knowledge_revisions VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), id, projectId, at, doc.text, JSON.stringify(metadata));
    await this.sync(projectId);
  }
  async concept(projectId: string, id: string) {
    const doc = await this.knowledge.read(projectId, id);
    const metadata = this.metadata(id);
    // Source content is never treated as executable instructions or trusted frontmatter.
    return `---\n${YAML.stringify({ type: doc.kind === 'wiki' ? 'Knowledge Note' : 'Reference', title: doc.name, ...metadata })}---\n\n${doc.text}`;
  }
  async sync(projectId: string) {
    const directory = await this.knowledge.folder(projectId, 'wiki');
    const docs = this.knowledge.list(projectId);
    const sections: Record<string, string[]> = { 'Knowledge pages': [], 'Source documents': [] };
    for (const doc of docs) {
      const metadata = this.metadata(doc.id);
      await this.knowledge.atomic(directory, `${doc.id}.md`, await this.concept(projectId, doc.id));
      sections[doc.kind === 'wiki' ? 'Knowledge pages' : 'Source documents']!.push(
        `* [${label(doc.name)}](${doc.id}.md) - ${label(String(metadata.description || 'Project reference')).slice(0, 160)}`,
      );
    }
    const index =
      '---\nokf_version: "0.2"\n---\n\n' +
      Object.entries(sections)
        .map(([name, entries]) => `# ${name}\n\n${entries.join('\n') || 'No pages yet.'}`)
        .join('\n\n') +
      '\n';
    await this.knowledge.atomic(directory, 'index.md', index);
    const rows = this.knowledge.store.db
      .prepare(
        'SELECT documentId, at FROM knowledge_revisions WHERE projectId=? ORDER BY at DESC, rowid DESC',
      )
      .all(projectId) as { documentId: string; at: string }[];
    let log = '# Knowledge Update Log\n';
    let date = '';
    for (const row of rows) {
      if (row.at.slice(0, 10) !== date) {
        date = row.at.slice(0, 10);
        log += `\n## ${date}\n`;
      }
      log += `* **Saved**: [${label(docs.find((d) => d.id === row.documentId)?.name || 'Page')}](${row.documentId}.md) at ${row.at}.\n`;
    }
    await this.knowledge.atomic(directory, 'log.md', log);
    return index;
  }
  async remove(projectId: string, id: string, revision: string) {
    const doc = await this.knowledge.read(projectId, id);
    if (doc.revision !== revision)
      throw Object.assign(new Error('This document changed. Reopen it before removing it.'), {
        statusCode: 409,
      });
    const directory = await this.knowledge.checkedDirectory(doc);
    const root = await this.knowledge.folder(projectId);
    const wikiDir = await this.knowledge.folder(projectId, 'wiki');
    const staged = path.join(root, '.removing-' + randomUUID());
    const db = this.knowledge.store.db;
    const original = db
      .prepare('SELECT * FROM documents WHERE id=? AND projectId=?')
      .get(id, projectId) as Record<string, any>;
    const revisions = db
      .prepare('SELECT * FROM knowledge_revisions WHERE documentId=? AND projectId=?')
      .all(id, projectId) as Record<string, any>[];
    await rename(directory, staged);
    let committed = false;
    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM knowledge_revisions WHERE documentId=? AND projectId=?').run(
          id,
          projectId,
        );
        db.prepare('DELETE FROM documents WHERE id=? AND projectId=?').run(id, projectId);
        db.exec('COMMIT');
        committed = true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      await this.sync(projectId);
      await rm(path.join(wikiDir, id + '.md'), { force: true });
    } catch (error) {
      if (committed) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            original.id,
            original.projectId,
            original.name,
            original.kind,
            original.extension,
            original.bytes,
            original.revision,
            original.truncated,
            original.updatedAt,
          );
          const insert = db.prepare('INSERT INTO knowledge_revisions VALUES (?, ?, ?, ?, ?, ?)');
          for (const row of revisions)
            insert.run(row.id, row.documentId, row.projectId, row.at, row.content, row.metadata);
          db.exec('COMMIT');
        } catch (restoreError) {
          db.exec('ROLLBACK');
          throw restoreError;
        }
      }
      await rename(staged, directory);
      await this.sync(projectId);
      throw error;
    }
    // Originals/evidence remain staged until the catalog and database changes succeed.
    // A storage cleanup failure is surfaced; never report permanent deletion on failure.
    await rm(staged, { recursive: true, force: true });
    return { ok: true };
  }
  async catalog(projectId: string) {
    const entries = [];
    for (const doc of this.knowledge.list(projectId))
      entries.push({
        id: doc.id,
        name: doc.name,
        revision: (await this.knowledge.read(projectId, doc.id)).revision,
        text: await this.concept(projectId, doc.id),
        description: String(this.metadata(doc.id).description || '').slice(0, 160),
      });
    return entries;
  }
  revisions(projectId: string, id: string) {
    this.knowledge.get(projectId, id);
    return this.knowledge.store.db
      .prepare(
        'SELECT id, at, content, metadata FROM knowledge_revisions WHERE documentId=? AND projectId=? ORDER BY rowid DESC LIMIT 50',
      )
      .all(id, projectId);
  }
  async export(projectId: string) {
    await this.sync(projectId);
    const files: Record<string, Uint8Array> = {};
    const wikiDir = await this.knowledge.folder(projectId, 'wiki');
    for (const name of [
      'index.md',
      'log.md',
      ...this.knowledge.list(projectId).map((d) => `${d.id}.md`),
    ]) {
      const { file } = await openArtifact(wikiDir, name);
      try {
        files[`wiki/${name}`] = strToU8(await file.readFile('utf8'));
      } finally {
        await file.close();
      }
    }
    let total = 0;
    for (const doc of this.knowledge.list(projectId)) {
      const directory = await this.knowledge.checkedDirectory(doc);
      for (const name of await readdir(directory)) {
        if (!/^source\.(md|txt|csv|pdf|docx)$|^evidence-[a-f0-9-]+\.json$/.test(name)) continue;
        const { file, size } = await openArtifact(directory, name);
        try {
          total += size;
          if (size > 10 * 1024 * 1024 || total > 120 * 1024 * 1024)
            throw Object.assign(new Error('Export exceeds 120 MiB.'), { statusCode: 413 });
          files[`${doc.id}/${name}`] = new Uint8Array(await file.readFile());
        } finally {
          await file.close();
        }
      }
    }
    const schema = this.schemaFiles?.(projectId) || {};
    for (const [name, text] of Object.entries(schema)) files['wiki/' + name] = strToU8(text);
    if (Object.keys(schema).length) {
      files['wiki/index.md'] = strToU8(
        new TextDecoder().decode(files['wiki/index.md']) +
          '\n\n## Database knowledge\n\n- [SQL schema collection](mssql/index.md)\n',
      );
      files['wiki/mssql/index.md'] = strToU8(
        '# SQL schema knowledge\n\n' +
          Object.keys(schema)
            .map((p) => '- [' + p + '](' + path.posix.relative('mssql', p) + ')')
            .join('\n'),
      );
    }
    return Buffer.from(zipSync(files, { level: 1 }));
  }
}
