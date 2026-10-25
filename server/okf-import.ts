import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import YAML from 'yaml';
import { z } from 'zod';
import { openArtifact } from './security.js';
import type { Wiki } from './wiki.js';
import type { KnowledgeDocument } from '../shared/types.js';
import type { OkfPreview } from '../shared/okf.js';

export const MAX_OKF = 120 * 1024 * 1024;
const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const safePath = (value: string) =>
  value.length <= 512 &&
  !/[\\\x00-\x1f]/.test(value) &&
  !value.startsWith('/') &&
  !value.includes(':') &&
  value.split('/').every((p) => p && p !== '.' && p !== '..');
const text = (data: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw fail('OKF pages must be UTF-8 text.');
  }
};
const stable = (v: any): string =>
  JSON.stringify(v, function (_key, value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value;
  });
const comparable = (metadata: any) => {
  const copy = structuredClone(metadata);
  if (copy.frame) {
    delete copy.frame.okf_path;
    if (!Object.keys(copy.frame).length) delete copy.frame;
  }
  return stable(copy);
};
const metadataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    type: z.string().optional(),
    sources: z.array(z.object({ resource: z.string() }).passthrough()).optional(),
    generated: z
      .object({ by: z.string().optional(), at: z.string().optional() })
      .passthrough()
      .optional(),
    verified: z.array(z.record(z.string(), z.unknown())).optional(),
    frame: z
      .object({
        tags: z.array(z.string()).optional(),
        aliases: z.array(z.string()).optional(),
        kind: z.string().optional(),
        okf_path: z.string().optional(),
        extraction_truncated: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const importedMetadata = (value: unknown): Record<string, any> => {
  const metadata = metadataSchema.parse(value);
  // Conversation IDs and maintenance fingerprints are local authority, not portable metadata.
  if (metadata.frame?.maintenance) {
    metadata.frame.imported_maintenance = metadata.frame.maintenance;
    delete metadata.frame.maintenance;
  }
  return metadata;
};
const historySchema = z.record(
  z.string(),
  z.array(
    z.object({
      at: z.iso.datetime(),
      content: z.string().max(120000),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
);
type Revision = z.infer<typeof historySchema>[string][number];
type Page = {
  path: string;
  archivePath: string;
  id: string;
  name: string;
  content: string;
  metadata: Record<string, any>;
  previous?: KnowledgeDocument;
  action: 'add' | 'update' | 'skip';
  sources: Record<string, Uint8Array>;
  kind: 'wiki' | 'upload';
  extension: string;
  revisions: Revision[];
};

/** Reads bounded ZIP contents in memory. No archive path is ever used as a filesystem destination. */
function unpack(buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_OKF)
    throw fail('OKF bundles must be ZIP files up to 120 MiB.', 413);
  let total = 0;
  const names = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, {
      filter: (entry) => {
        const name = entry.name.replace(/\/$/, '');
        if (!safePath(name) || names.has(entry.name))
          throw fail('The bundle contains an unsafe or duplicate path.');
        names.add(entry.name);
        total += entry.originalSize;
        if (
          names.size > 10000 ||
          total > MAX_OKF ||
          entry.originalSize > (entry.name === 'frame-history.json' ? MAX_OKF : 10 * 1024 * 1024)
        )
          throw fail('The expanded bundle exceeds the supported size limits.', 413);
        return !entry.name.endsWith('/');
      },
    });
  } catch (error) {
    if ((error as any).statusCode) throw error;
    throw fail('This is not a readable OKF ZIP bundle.');
  }
  const index = files['wiki/index.md'] || files['index.md'];
  if (!index || !/^---\r?\n[\s\S]*?okf_version:\s*["']?0\.2["']?\s*\r?\n/m.test(text(index)))
    throw fail('The bundle must include an OKF 0.2 index.md or wiki/index.md.');
  return files;
}

export class OkfImport {
  constructor(readonly wiki: Wiki) {}
  private async plan(projectId: string, buffer: Buffer) {
    const files = unpack(buffer);
    let history: z.infer<typeof historySchema> = {};
    if (files['frame-history.json']) {
      try {
        history = historySchema.parse(JSON.parse(text(files['frame-history.json'])));
      } catch {
        throw fail('The bundle contains invalid Frame revision history.');
      }
    }
    const knowledge = this.wiki.knowledge;
    const existing = knowledge.list(projectId);
    const byPath = new Map(
      existing.map((d) => [this.wiki.metadata(d.id).frame?.okf_path || `wiki/${d.id}.md`, d]),
    );
    const pages: Page[] = [];
    const paths = new Set<string>();
    const usedIds = new Set<string>();
    for (const [archivePath, data] of Object.entries(files)) {
      if (!archivePath.endsWith('.md') || /(^|\/)(index|log|source)\.md$/.test(archivePath))
        continue;
      // Frame exports source/evidence folders alongside the wiki; only wiki pages are knowledge.
      if (files['wiki/index.md'] && !archivePath.startsWith('wiki/')) continue;
      const raw = text(data);
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
      let metadata: Record<string, any> = {};
      if (match) {
        let parsed: unknown;
        try {
          parsed = YAML.parse(match[1]!, { maxAliasCount: 0 });
        } catch {
          throw fail(`Invalid YAML metadata in ${archivePath}.`);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw fail(`Invalid metadata in ${archivePath}.`);
        // JSON normalization strips YAML-specific object types; metadata never authorizes actions.
        metadata = importedMetadata(JSON.parse(JSON.stringify(parsed)));
        if (
          metadata.frame !== undefined &&
          (!metadata.frame || typeof metadata.frame !== 'object' || Array.isArray(metadata.frame))
        )
          throw fail(`Invalid Frame metadata in ${archivePath}.`);
      }
      const content = match ? raw.slice(match[0].length).replace(/^\r?\n/, '') : raw;
      if (
        !content.trim() ||
        content.includes('\0') ||
        content.length > 120000 ||
        Buffer.byteLength(content) > 500000
      )
        throw fail(`Page ${archivePath} must contain UTF-8 text up to 120,000 characters.`, 413);
      const logicalPath =
        typeof metadata.frame?.okf_path === 'string' ? metadata.frame.okf_path : archivePath;
      if (!safePath(logicalPath) || !logicalPath.endsWith('.md') || paths.has(logicalPath))
        throw fail('The bundle contains duplicate or invalid knowledge page paths.');
      paths.add(logicalPath);
      const previous =
        byPath.get(logicalPath) || existing.find((d) => `wiki/${d.id}.md` === archivePath);
      if (previous && usedIds.has(previous.id))
        throw fail('Multiple imported pages target the same existing page.');
      const id = previous?.id || randomUUID();
      usedIds.add(id);
      const sourceId = path.posix.basename(archivePath, '.md');
      const sources: Record<string, Uint8Array> = {};
      if (/^[a-f0-9-]{36}$/.test(sourceId)) {
        for (const [filename, bytes] of Object.entries(files)) {
          const name = filename.slice(sourceId.length + 1);
          if (
            filename.startsWith(sourceId + '/') &&
            /^(source\.(md|txt|csv|pdf|docx)|evidence-[a-f0-9-]+\.json)$/.test(name)
          )
            sources[name] = bytes;
        }
      }
      const preferredSource = `source${path.posix.extname(String(metadata.title || '')).toLowerCase()}`;
      const sourceName = sources[preferredSource]
        ? preferredSource
        : Object.keys(sources).find((n) => n.startsWith('source.'));
      const kind = metadata.frame?.kind === 'upload' && sourceName ? 'upload' : 'wiki';
      if (kind === 'wiki' && Buffer.byteLength(content) > 120000)
        throw fail(`Knowledge page ${archivePath} exceeds 120 KB.`, 413);
      const extension = kind === 'upload' ? path.posix.extname(sourceName!) : '.md';
      let name =
        String(metadata.title || path.posix.basename(archivePath))
          .replace(/[\\/\x00-\x1f]/g, '-')
          .replace(/^\.+/, '')
          .slice(0, 160) || 'Imported page';
      if (!name.toLowerCase().endsWith(extension)) name += extension;
      pages.push({
        path: logicalPath,
        archivePath,
        id,
        name,
        content,
        metadata,
        previous,
        action: previous ? 'update' : 'add',
        sources,
        kind,
        extension,
        revisions: history[archivePath] || [],
      });
    }
    if (!pages.length) throw fail('The bundle contains no knowledge pages.');
    if (existing.length + pages.filter((p) => !p.previous).length > 100)
      throw fail('Import would exceed the project limit of 100 knowledge documents.', 413);
    const ids = new Map(pages.map((p) => [path.posix.basename(p.archivePath, '.md'), p.id]));
    const links = new Map(pages.map((p) => [p.archivePath, p.id]));
    const remap = (value: any): any => {
      if (typeof value === 'string')
        return value.replace(/([/.])([a-f0-9-]{36})(?=[/.])/g, (all, prefix, id) =>
          ids.has(id) ? prefix + ids.get(id) : all,
        );
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, k === 'okf_path' ? v : remap(v)]),
        );
      return value;
    };
    const remapLink = (page: Page, href: string) => {
      const [filename, ...fragment] = href.split('#');
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(page.archivePath), filename!),
      );
      return links.has(target)
        ? `${links.get(target)}.md${fragment.length ? '#' + fragment.join('#') : ''}`
        : href;
    };
    const remapContent = (page: Page, content: string) =>
      content.replace(
        /(\]\()([^\s)]+)(\))/g,
        (_all, before, href, after) => `${before}${remapLink(page, href)}${after}`,
      );
    const remapMetadata = (page: Page, value: Record<string, any>) => {
      const result = remap(value);
      if (value.sources)
        result.sources = value.sources.map((source: any) => {
          const resource = remapLink(page, source.resource);
          return {
            ...remap(source),
            resource: resource !== source.resource ? '/' + resource : remap(source.resource),
          };
        });
      return result;
    };
    for (const page of pages) {
      page.content = remapContent(page, page.content);
      page.metadata = remapMetadata(page, page.metadata);
      page.metadata.frame = { ...page.metadata.frame, okf_path: page.path };
      page.revisions = page.revisions.map((r) => ({
        ...r,
        content: remapContent(page, r.content),
        metadata: remapMetadata(page, importedMetadata(r.metadata)),
      }));
      if (page.previous) {
        const old = await knowledge.read(projectId, page.id);
        let sameSources = true;
        const directory = await knowledge.checkedDirectory(old);
        for (const [name, data] of Object.entries(page.sources)) {
          try {
            const { file } = await openArtifact(directory, name);
            try {
              if (!(await file.readFile()).equals(Buffer.from(data))) sameSources = false;
            } finally {
              await file.close();
            }
          } catch {
            sameSources = false;
          }
        }
        if (
          old.text === page.content &&
          old.name === page.name &&
          old.kind === page.kind &&
          sameSources &&
          comparable(this.wiki.metadata(old.id)) === comparable(page.metadata)
        )
          page.action = 'skip';
      }
    }
    const totalBytes =
      existing.filter((d) => !usedIds.has(d.id)).reduce((n, d) => n + d.bytes, 0) +
      pages.reduce(
        (n, p) =>
          n +
          (p.kind === 'upload'
            ? p.sources[`source${p.extension}`]!.length
            : Buffer.byteLength(p.content)),
        0,
      );
    if (totalBytes > 100 * 1024 * 1024)
      throw fail('Import would exceed the project knowledge limit of 100 MiB.', 413);
    // Random new IDs are excluded: a resubmitted bundle has a stable preview fingerprint.
    const fingerprint = hash(
      stable({
        bundle: hash(buffer),
        existing: existing
          .map((d) => ({ id: d.id, revision: d.revision, metadata: this.wiki.metadata(d.id) }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    );
    const counts = { add: 0, update: 0, skip: 0 };
    for (const p of pages) counts[p.action]++;
    const preview: OkfPreview = {
      fingerprint,
      counts,
      pages: pages.map(({ path, name, action }) => ({ path, name, action })),
    };
    return { pages, preview };
  }
  async preview(projectId: string, buffer: Buffer) {
    return (await this.plan(projectId, buffer)).preview;
  }
  async apply(projectId: string, buffer: Buffer, fingerprint: string) {
    const { pages, preview } = await this.plan(projectId, buffer);
    if (fingerprint !== preview.fingerprint)
      throw fail('Knowledge or the bundle changed. Preview the import again.', 409);
    const changes = pages.filter((p) => p.action !== 'skip');
    if (!changes.length) return preview;
    const knowledge = this.wiki.knowledge;
    const db = knowledge.store.db;
    const root = await knowledge.folder(projectId);
    const staging = path.join(root, `.import-${randomUUID()}`);
    await mkdir(staging, { mode: 0o700 });
    const priorRows = db
      .prepare('SELECT * FROM documents WHERE projectId=?')
      .all(projectId) as any[];
    const priorRevisions = db
      .prepare('SELECT * FROM knowledge_revisions WHERE projectId=?')
      .all(projectId) as any[];
    const snapshots = new Map<string, string>();
    const moved: Page[] = [];
    let committed = false;
    try {
      for (const page of changes) {
        const directory = path.join(staging, page.id);
        if (page.previous) {
          snapshots.set(page.id, (await knowledge.read(projectId, page.id)).text);
          await cp(await knowledge.checkedDirectory(page.previous), directory, {
            recursive: true,
            dereference: false,
          });
        } else await mkdir(directory, { mode: 0o700 });
        // Never follow a copied source symlink. Every imported file is replaced before writing.
        const outputs: Record<string, Uint8Array> = {
          ...page.sources,
          'content.md': Buffer.from(page.content),
        };
        if (!page.previous && !outputs['source.md'] && page.kind === 'wiki')
          outputs['source.md'] = Buffer.from(page.content);
        for (const [name, bytes] of Object.entries(outputs)) {
          await rm(path.join(directory, name), { force: true });
          await writeFile(path.join(directory, name), bytes, { mode: 0o600, flag: 'wx' });
        }
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const revision = db.prepare('INSERT INTO knowledge_revisions VALUES (?,?,?,?,?,?)');
        for (const page of changes) {
          const destination = knowledge.directory({ projectId, id: page.id });
          if (page.previous) renameSync(destination, path.join(staging, `${page.id}.backup`));
          moved.push(page);
          renameSync(path.join(staging, page.id), destination);
          const at = new Date().toISOString();
          const previous = priorRevisions.filter((r) => r.documentId === page.id);
          if (page.previous && !previous.some((r) => r.content === snapshots.get(page.id)))
            revision.run(
              randomUUID(),
              page.id,
              projectId,
              page.previous.updatedAt,
              snapshots.get(page.id)!,
              JSON.stringify(this.wiki.metadata(page.id)),
            );
          const known = new Set(
            previous.map((r) => stable([r.at, r.content, JSON.parse(r.metadata)])),
          );
          for (const r of page.revisions) {
            const key = stable([r.at, r.content, r.metadata]);
            if (!known.has(key)) {
              revision.run(
                randomUUID(),
                page.id,
                projectId,
                r.at,
                r.content,
                JSON.stringify(r.metadata),
              );
              known.add(key);
            }
          }
          const bytes =
            page.kind === 'upload'
              ? page.sources[`source${page.extension}`]!.length
              : Buffer.byteLength(page.content);
          db.prepare(
            'INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,extension=excluded.extension,bytes=excluded.bytes,revision=excluded.revision,truncated=excluded.truncated,updatedAt=excluded.updatedAt',
          ).run(
            page.id,
            projectId,
            page.name,
            page.kind,
            page.extension,
            bytes,
            hash(page.content),
            Number(!!page.metadata.frame?.extraction_truncated),
            at,
          );
          revision.run(
            randomUUID(),
            page.id,
            projectId,
            at,
            page.content,
            JSON.stringify(page.metadata),
          );
        }
        db.exec('COMMIT');
        committed = true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      await this.wiki.sync(projectId);
    } catch (error) {
      for (const page of moved.reverse()) {
        const destination = knowledge.directory({ projectId, id: page.id });
        await rm(destination, { recursive: true, force: true });
        const backup = path.join(staging, `${page.id}.backup`);
        if (existsSync(backup)) renameSync(backup, destination);
      }
      if (committed) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM knowledge_revisions WHERE projectId=?').run(projectId);
          db.prepare('DELETE FROM documents WHERE projectId=?').run(projectId);
          for (const r of priorRows)
            db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?)').run(
              r.id,
              r.projectId,
              r.name,
              r.kind,
              r.extension,
              r.bytes,
              r.revision,
              r.truncated,
              r.updatedAt,
            );
          for (const r of priorRevisions)
            db.prepare('INSERT INTO knowledge_revisions VALUES (?,?,?,?,?,?)').run(
              r.id,
              r.documentId,
              r.projectId,
              r.at,
              r.content,
              r.metadata,
            );
          db.exec('COMMIT');
        } catch (restoreError) {
          db.exec('ROLLBACK');
          throw restoreError;
        }
        for (const p of changes.filter((p) => !p.previous))
          await rm(path.join(root, 'wiki', p.id + '.md'), { force: true });
        await this.wiki.sync(projectId);
      }
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return preview;
  }
}
