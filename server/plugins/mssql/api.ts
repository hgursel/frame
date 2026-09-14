import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zipSync, strToU8 } from 'fflate';
import type { Runner } from '../../runner.js';
import { fail, identifier } from './policy.js';
import type { MssqlPlugin } from './service.js';
export function mssqlApi(app: FastifyInstance, plugin: MssqlPlugin, runner: Runner) {
  const project = (id: string) => {
    z.string().uuid().parse(id);
    if (!plugin.store.project(id)) throw fail('Project not found', 404);
    return id;
  };
  const idle = (id?: string) => {
    if (
      id
        ? runner.projectBusy(id) || plugin.schema.jobs.has(id)
        : runner.active.size || plugin.schema.jobs.size || plugin.controllers.size
    )
      throw fail('Stop active tasks and schema imports before changing plugin settings.', 409);
  };
  app.get('/api/plugins/mssql', () => plugin.publicSettings());
  app.put('/api/plugins/mssql', async (r) => {
    idle();
    return plugin.save(r.body);
  });
  app.post('/api/plugins/mssql/test', async (r) => {
    const v = z.object({ database: identifier, login: z.enum(['read', 'write']) }).parse(r.body);
    return plugin.test(v.database, v.login);
  });
  app.get<{ Params: { id: string } }>('/api/projects/:id/plugins', (r) => ({
    mssql: plugin.projectEnabled(project(r.params.id)),
    systemEnabled: plugin.settings().enabled,
  }));
  app.put<{ Params: { id: string } }>('/api/projects/:id/plugins', async (r) => {
    const id = project(r.params.id);
    idle(id);
    const { mssql } = z.object({ mssql: z.boolean() }).parse(r.body);
    plugin.setProject(id, mssql);
    return { mssql };
  });
  app.get<{ Params: { id: string } }>('/api/projects/:id/mssql/schema/status', (r) =>
    plugin.schema.status(project(r.params.id)),
  );
  app.post<{ Params: { id: string } }>('/api/projects/:id/mssql/schema', async (r, reply) => {
    const id = project(r.params.id);
    idle(id);
    const s = plugin.requireProject(id);
    return reply.code(202).send(plugin.schema.start(id, s));
  });
  app.post<{ Params: { id: string } }>('/api/projects/:id/mssql/schema/cancel', async (r) => {
    plugin.schema.cancel(project(r.params.id));
    return { ok: true };
  });
  app.get<{ Params: { id: string }; Querystring: { q?: string; offset?: string } }>(
    '/api/projects/:id/mssql/schema',
    (r) => {
      const id = project(r.params.id),
        s = plugin.requireProject(id);
      plugin.schema.ensureSource(id, s);
      const q = z
        .string()
        .max(200)
        .parse(r.query.q || '');
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(50000)
        .parse(r.query.offset || 0);
      return plugin.schema.search(id, s.databases, q, offset);
    },
  );
  app.get<{ Params: { id: string; object: string } }>(
    '/api/projects/:id/mssql/schema/objects/:object',
    (r) => {
      const id = project(r.params.id),
        s = plugin.requireProject(id);
      plugin.schema.ensureSource(id, s);
      return plugin.schema.read(
        id,
        s.databases,
        z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(r.params.object),
      );
    },
  );
  app.get<{ Params: { id: string } }>('/api/projects/:id/mssql/schema/export', async (r, reply) => {
    const id = project(r.params.id),
      s = plugin.requireProject(id);
    plugin.schema.ensureSource(id, s);
    const pages = plugin.schema.pages(id, s.databases);
    const index =
      '---\nokf_version: "0.2"\n---\n\n# MSSQL schema knowledge\n\n' +
      Object.keys(pages)
        .map((p) => `- [${p}](${p})`)
        .join('\n');
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="frame-sql-schema.zip"')
      .send(
        Buffer.from(
          zipSync(
            Object.fromEntries(
              Object.entries({ 'index.md': index, ...pages }).map(([p, s]) => [p, strToU8(s)]),
            ),
            { level: 1 },
          ),
        ),
      );
  });
  app.post<{ Params: { id: string; approval: string } }>(
    '/api/conversations/:id/sql-approvals/:approval',
    async (r) => {
      const { runId, approve } = z
        .object({ runId: z.string().uuid(), approve: z.boolean() })
        .parse(r.body);
      return plugin.decide(
        z.string().uuid().parse(r.params.id),
        z.string().uuid().parse(r.params.approval),
        runId,
        approve,
      );
    },
  );
}
