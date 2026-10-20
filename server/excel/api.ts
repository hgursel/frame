import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Runner } from '../runner.js';
import type { ExcelSessions } from './service.js';
import { selectionSchema, MAX_SELECTION_BYTES } from '../../shared/excel.js';
import { excelIcon, excelManifest } from './manifest.js';
import type { WorkerInput, KnowledgePage } from '../../shared/types.js';
import { readFile } from 'node:fs/promises';

export function excelApi(
  app: FastifyInstance,
  excel: ExcelSessions,
  runner: Runner,
  origin: string,
  references: (
    projectId: string,
    query: string,
  ) => Promise<{ catalog: KnowledgePage[]; reference: WorkerInput['reference'] }>,
) {
  const requireHttps = () => {
    if (!origin.startsWith('https:'))
      throw Object.assign(
        new Error(
          'Frame for Excel requires a trusted HTTPS connection. See Settings → Frame for Excel.',
        ),
        { statusCode: 400 },
      );
  };
  app.get('/api/excel/config', async () => ({
    origin,
    https: origin.startsWith('https:'),
    name: 'Frame for Excel',
    pilot: true,
    limits: excel.limits(),
    contextWindow: excel.store.settings().contextWindow,
  }));
  app.put('/api/excel/config', async (request) => ({ limits: excel.setLimits(request.body) }));
  app.get('/api/excel/manifest', async (_request, reply) =>
    reply
      .header('Content-Disposition', 'attachment; filename="frame-excel-manifest.xml"')
      .type('application/xml')
      .send(excelManifest(origin)),
  );
  app.get<{ Querystring: { size?: string } }>('/excel-icon.png', async (request, reply) => {
    const size = Number(request.query.size || 32);
    return reply.type('image/png').send(excelIcon(size === 16 ? 16 : size === 80 ? 80 : 32));
  });
  app.get('/excel-setup', async (_request, reply) =>
    reply
      .type('text/plain; charset=utf-8')
      .send(
        await readFile(
          new URL(
            import.meta.url.endsWith('.ts')
              ? '../../docs/FRAME_FOR_EXCEL.md'
              : '../../../docs/FRAME_FOR_EXCEL.md',
            import.meta.url,
          ),
          'utf8',
        ).catch(
          () =>
            'Open Settings → Frame for Excel. Setup guide: https://github.com/hgursel/frame/blob/main/docs/FRAME_FOR_EXCEL.md',
        ),
      ),
  );
  app.post('/api/excel/sessions', async (request) => {
    requireHttps();
    const b = z.object({ projectId: z.uuid() }).strict().parse(request.body);
    return excel.create(b.projectId);
  });
  const auth = (id: string, key: unknown) => {
    requireHttps();
    z.uuid().parse(id);
    excel.authorize(id, key);
  };
  app.get<{ Params: { id: string } }>('/api/excel/sessions/:id', async (request) => {
    auth(request.params.id, request.headers['x-frame-excel-key']);
    return {
      snapshot: runner.snapshot(request.params.id),
      proposals: excel.summaries(request.params.id),
      inspection: excel.inspection(request.params.id),
    };
  });
  app.get<{ Params: { id: string; proposal: string } }>(
    '/api/excel/sessions/:id/proposals/:proposal',
    async (request) => {
      auth(request.params.id, request.headers['x-frame-excel-key']);
      z.uuid().parse(request.params.proposal);
      return excel.get(request.params.id, request.params.proposal);
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/excel/sessions/:id/messages',
    { bodyLimit: MAX_SELECTION_BYTES + 100000 },
    async (request, reply) => {
      const id = request.params.id;
      auth(id, request.headers['x-frame-excel-key']);
      const b = z
        .object({
          requestId: z.uuid(),
          text: z.string().trim().min(1).max(16000),
          selection: selectionSchema,
        })
        .strict()
        .parse(request.body);
      // A retry of an accepted request only returns its state, never replays work.
      const prior = excel.store.db
        .prepare('SELECT conversationId,status FROM runs WHERE id=?')
        .get(b.requestId) as { conversationId: string; status: string } | undefined;
      if (prior) {
        if (prior.conversationId !== id)
          return reply.code(409).send({ error: 'Request ID already used.' });
        return reply.code(202).send({ id: b.requestId, status: prior.status, duplicate: true });
      }
      const turn = excel.turn(id, b.selection);
      const projectId = excel.store.conversation(id)!.projectId;
      const recalled = await references(projectId, b.text);
      return reply
        .code(202)
        .send(
          runner.start(
            id,
            b.requestId,
            b.text,
            undefined,
            undefined,
            recalled.catalog,
            'prompt',
            recalled.reference,
            undefined,
            turn,
          ),
        );
    },
  );
  app.post<{ Params: { id: string; proposal: string } }>(
    '/api/excel/sessions/:id/proposals/:proposal',
    async (request) => {
      const { id, proposal } = request.params;
      auth(id, request.headers['x-frame-excel-key']);
      z.uuid().parse(proposal);
      if ((request.body as any)?.action === 'claim' && runner.active.has(id))
        throw Object.assign(new Error('Wait for the response to finish before applying.'), {
          statusCode: 409,
        });
      const result = excel.transition(id, proposal, request.body);
      return { id: result.id, status: result.status, result: result.result };
    },
  );
}
