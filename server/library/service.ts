import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { LibraryEntry, LibraryPack, LibraryReference } from '../../shared/library.js';
import type { WorkerInput } from '../../shared/types.js';
import type { Store } from '../store.js';
import type { Runner } from '../runner.js';
import type { Knowledge } from '../knowledge.js';
import { bundledPacks } from './bundles.js';
const key = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const version = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/);
const date = z.iso.date();
const packSchema = z
  .object({
    id: key,
    version,
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1000),
    jurisdiction: z.array(z.string().min(1).max(160)).min(1).max(10),
    reviewedAt: date,
    rights: z.string().min(1).max(2000),
    pages: z
      .array(
        z
          .object({
            id: key,
            title: z.string().trim().min(1).max(160),
            description: z.string().min(1).max(600),
            tags: z.array(z.string().min(1).max(50)).max(16),
            kind: z.enum(['reference-brief', 'review-workflow']),
            applicability: z.string().min(1).max(1200),
            effectiveDate: date.nullable(),
            text: z.string().trim().min(1).max(20000),
            sources: z
              .array(
                z.object({
                  title: z.string().min(1).max(200),
                  url: z
                    .url()
                    .refine((v) => new URL(v).protocol === 'https:', 'Sources must use HTTPS'),
                  locator: z.string().min(1).max(400),
                }),
              )
              .max(12),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (p) => new Set(p.pages.map((s) => s.id)).size === p.pages.length,
    'Page IDs must be unique',
  );
const error = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const hash = (pack: LibraryPack) =>
  createHash('sha256')
    .update(JSON.stringify(packSchema.parse(pack)))
    .digest('hex');
const newer = (a: string, b: string) => {
  const aa = a.split('.').map(Number),
    bb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (aa[i] !== bb[i]) return aa[i]! > bb[i]!;
  }
  return false;
};
export function libraryUrl(pack: string, version: string, page: string) {
  return `/api/library/packs/${pack}/${version}/pages/${page}`;
}
export class KnowledgeLibrary {
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS library_packs(id TEXT NOT NULL, version TEXT NOT NULL, hash TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(id,version));
      CREATE TABLE IF NOT EXISTS project_library(projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, packId TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY(projectId,packId), FOREIGN KEY(packId,version) REFERENCES library_packs(id,version));`);
    for (const pack of bundledPacks) packSchema.parse(pack);
  }
  installed(): LibraryPack[] {
    return (
      this.store.db.prepare('SELECT payload FROM library_packs ORDER BY id,version').all() as {
        payload: string;
      }[]
    ).map((r) => JSON.parse(r.payload));
  }
  get(id: string, v: string): LibraryPack {
    key.parse(id);
    version.parse(v);
    const row = this.store.db
      .prepare('SELECT payload FROM library_packs WHERE id=? AND version=?')
      .get(id, v) as { payload: string } | undefined;
    const pack: LibraryPack | undefined = row
      ? JSON.parse(row.payload)
      : bundledPacks.find((p) => p.id === id && p.version === v);
    if (!pack) throw error('Library pack version not found.', 404);
    return pack;
  }
  install(input: unknown) {
    const pack = packSchema.parse(input);
    // Reserve bundled IDs: an imported file may not impersonate a Frame release.
    const builtin = bundledPacks.find((p) => p.id === pack.id);
    if (builtin && (builtin.version !== pack.version || hash(builtin) !== hash(pack)))
      throw error(
        'This ID is reserved for a bundled Frame pack. Use a separate ID for custom packs.',
      );
    const existing = this.store.db
      .prepare('SELECT hash FROM library_packs WHERE id=? AND version=?')
      .get(pack.id, pack.version) as { hash: string } | undefined;
    if (existing && existing.hash !== hash(pack))
      throw error('This version already exists with different content. Import a new version.', 409);
    this.store.db
      .prepare('INSERT OR IGNORE INTO library_packs VALUES (?,?,?,?)')
      .run(pack.id, pack.version, hash(pack), JSON.stringify(pack));
    return { ok: true };
  }
  attachments(projectId: string): { packId: string; version: string }[] {
    if (!this.store.project(projectId)) throw error('Project not found.', 404);
    return this.store.db
      .prepare('SELECT packId,version FROM project_library WHERE projectId=?')
      .all(projectId) as { packId: string; version: string }[];
  }
  list(projectId?: string): LibraryEntry[] {
    const installed = this.installed(),
      all = [...installed];
    for (const pack of bundledPacks)
      if (!all.some((p) => p.id === pack.id && p.version === pack.version)) all.push(pack);
    const attached = projectId ? this.attachments(projectId) : [];
    return all.map((pack) => ({
      pack,
      installed: installed.some((p) => p.id === pack.id && p.version === pack.version),
      attached: attached.some((p) => p.packId === pack.id && p.version === pack.version),
      bundled: bundledPacks.some((p) => p.id === pack.id && p.version === pack.version),
      newerVersion: all
        .filter((p) => p.id === pack.id && newer(p.version, pack.version))
        .sort((a, b) => (newer(a.version, b.version) ? -1 : 1))[0]?.version,
    }));
  }
  attach(projectId: string, packId: string, v: string | null, previousVersion: string | null) {
    const current = this.attachments(projectId).find((p) => p.packId === packId)?.version || null;
    key.parse(packId);
    if (current !== previousVersion)
      throw error('Project library changed. Refresh before updating.', 409);
    if (v === null)
      this.store.db
        .prepare('DELETE FROM project_library WHERE projectId=? AND packId=?')
        .run(projectId, packId);
    else {
      version.parse(v);
      if (!this.installed().some((p) => p.id === packId && p.version === v))
        throw error('Install this pack version in Settings first.');
      if (!current && this.attachments(projectId).length >= 8)
        throw error('A project can attach up to eight library packs.');
      this.store.db
        .prepare('INSERT OR REPLACE INTO project_library VALUES (?,?,?)')
        .run(projectId, packId, v);
    }
    return { ok: true };
  }
  catalog(projectId: string): NonNullable<WorkerInput['knowledge']> {
    return this.attachments(projectId).flatMap((a) => {
      const pack = this.get(a.packId, a.version);
      const revision = hash(pack);
      const authored = bundledPacks.some(
        (p) => p.id === pack.id && p.version === pack.version && hash(p) === revision,
      );
      return pack.pages.map((page) => {
        const library: LibraryReference = {
          pack: pack.title,
          version: pack.version,
          page: page.title,
          url: libraryUrl(pack.id, pack.version, page.id),
          reviewedAt: pack.reviewedAt,
          kind: page.kind,
        };
        return {
          id: `library:${pack.id}:${pack.version}:${page.id}`,
          name: `${pack.title} / ${page.title}`,
          revision,
          description: page.description,
          tags: page.tags,
          library,
          text: `# ${page.title}\n\nPack: ${pack.title} v${pack.version}. ${authored ? 'Frame-authored' : 'Imported, unverified'} ${page.kind}; not official legal text or company policy.\nSource check: ${pack.reviewedAt}; not a guarantee of current law. Effective date: ${page.effectiveDate || 'varies by provision; verify the applicable source'}.\nApplicability: ${page.applicability}\nLocal citation: [${page.title}](${library.url})\n\n${page.text}\n\n## Publisher references\n${page.sources.map((s) => `- [${s.title}](${s.url}) — ${s.locator}`).join('\n') || 'Original review workflow; cite the actual project agreements for factual and legal claims.'}`,
        };
      });
    });
  }
}
export function libraryApi(
  app: FastifyInstance,
  library: KnowledgeLibrary,
  runner: Runner,
  knowledge: Knowledge,
) {
  app.get('/api/library', () => library.list());
  app.post('/api/library/install', (request) => {
    const b = z.object({ id: key, version }).parse(request.body);
    return library.install(library.get(b.id, b.version));
  });
  app.post('/api/library/import', { bodyLimit: 1_500_000 }, (request) =>
    library.install(request.body),
  );
  app.get<{ Params: { id: string; version: string } }>(
    '/api/library/packs/:id/:version',
    (request, reply) => {
      const pack = library.get(request.params.id, request.params.version);
      reply.header('Content-Disposition', `attachment; filename="${pack.id}-${pack.version}.json"`);
      return pack;
    },
  );
  app.get<{ Params: { id: string; version: string; page: string } }>(
    '/api/library/packs/:id/:version/pages/:page',
    (request) => {
      const pack = library.get(request.params.id, request.params.version);
      const page = pack.pages.find((p) => p.id === request.params.page);
      if (!page) throw error('Library section not found.', 404);
      return {
        pack: {
          title: pack.title,
          version: pack.version,
          reviewedAt: pack.reviewedAt,
          rights: pack.rights,
        },
        page,
      };
    },
  );
  app.get<{ Params: { id: string } }>('/api/projects/:id/library', (request) =>
    library.list(z.string().uuid().parse(request.params.id)),
  );
  app.put<{ Params: { id: string; pack: string } }>(
    '/api/projects/:id/library/:pack',
    async (request) => {
      const id = z.string().uuid().parse(request.params.id);
      const b = z
        .object({ version: version.nullable(), previousVersion: version.nullable() })
        .parse(request.body);
      return knowledge.write(id, async () => {
        if (runner.projectBusy(id))
          throw error('Wait for this project’s task to finish before changing library packs.', 409);
        return library.attach(id, request.params.pack, b.version, b.previousVersion);
      });
    },
  );
}
