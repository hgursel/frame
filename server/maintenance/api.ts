import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Maintenance } from './service.js';
export function maintenanceApi(app: FastifyInstance, maintenance: Maintenance) {
  app.get('/api/maintenance', () => maintenance.status());
  app.put('/api/maintenance/settings', (request) => maintenance.save(request.body));
  app.post('/api/maintenance/run', (_request, reply) => {
    const run = maintenance.enqueue();
    void maintenance.tick().catch(() => {});
    return reply.code(202).send(run);
  });
  app.delete<{ Params: { id: string } }>('/api/maintenance/methods/:id', (request) => {
    maintenance.methods.forget(z.string().uuid().parse(request.params.id));
    return { ok: true };
  });
  app.post('/api/maintenance/stop', () => {
    maintenance.stop();
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/maintenance/drafts/:id/publish', async (request) => {
    const { verified } = z
      .object({ verified: z.boolean().default(false) })
      .parse(request.body || {});
    return maintenance.publish(z.string().uuid().parse(request.params.id), verified);
  });
  app.post<{ Params: { id: string } }>('/api/maintenance/drafts/:id/reject', (request) => {
    maintenance.reject(z.string().uuid().parse(request.params.id));
    return { ok: true };
  });
}
