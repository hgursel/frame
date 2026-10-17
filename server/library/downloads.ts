import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { bundledPacks } from './bundles.js';
import { downloadCatalog } from './download-catalog.js';
import { KnowledgeLibrary, packSchema } from './service.js';

const fail = (message: string, statusCode = 502) =>
  Object.assign(new Error(message), { statusCode });

export function libraryDownloadsApi(
  app: FastifyInstance,
  library: KnowledgeLibrary,
  fetcher: typeof fetch = fetch,
) {
  app.get('/api/library/downloads', async () => {
    const installed = library.installed();
    return downloadCatalog.map((entry) => ({
      ...entry,
      installed: installed.some((p) => p.id === entry.id && p.version === entry.version),
    }));
  });

  async function download(id: string, version: string) {
    const entry = downloadCatalog.find((p) => p.id === id && p.version === version);
    if (!entry) throw fail('This pack version is not in the Frame catalog.', 404);
    const bundled = bundledPacks.find((p) => p.id === id && p.version === version);
    let data: Buffer;
    if (bundled) {
      data = Buffer.from(JSON.stringify(bundled, null, 2) + '\n');
    } else {
      // Only catalog IDs can reach this fixed host/path. No credentials, project data,
      // user-supplied URLs, redirects, background refreshes, or automatic retries.
      const url = `https://raw.githubusercontent.com/hgursel/frame/main/knowledge-packs/${id}/${version}.json`;
      try {
        const response = await fetcher(url, {
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw fail('Pack download was unavailable. Please try again later.');
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          const length = response.headers.get('content-length');
          if (length && Number(length) > entry.bytes)
            throw fail('Pack size did not match the catalog.');
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > entry.bytes || size > 1_500_000)
              throw fail('Pack exceeded its catalog size.');
            chunks.push(value);
          }
          data = Buffer.concat(chunks);
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      } catch {
        throw fail('Could not download this pack. Check internet access and try again.');
      }
    }
    if (
      data.length !== entry.bytes ||
      createHash('sha256').update(data).digest('hex') !== entry.sha256
    )
      throw fail(
        'Pack verification failed. No pack was installed. Update Frame or try again later.',
      );
    const parsed = packSchema.safeParse(JSON.parse(data.toString('utf8')));
    if (!parsed.success || parsed.data.id !== id || parsed.data.version !== version)
      throw fail('Downloaded pack is invalid. No pack was installed.');
    return { data, pack: parsed.data };
  }

  for (const action of ['download', 'install'] as const) {
    app.post<{ Params: { id: string; version: string } }>(
      `/api/library/downloads/:id/:version/${action}`,
      async (request, reply) => {
        // Return safe, actionable download errors; the global handler hides 5xx details.
        let result;
        try {
          result = await download(request.params.id, request.params.version);
        } catch (e) {
          const error = e as Error & { statusCode?: number };
          return reply.code(error.statusCode || 502).send({ error: error.message });
        }
        if (action === 'install') return library.install(result.pack);
        return reply
          .header(
            'Content-Disposition',
            `attachment; filename="${result.pack.id}-${result.pack.version}.json"`,
          )
          .type('application/json')
          .send(result.data);
      },
    );
  }
}
