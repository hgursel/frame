import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ReportsPlugin } from './service.js';
import type { Runner } from '../../runner.js';
export function reportsApi(app: FastifyInstance, reports: ReportsPlugin, runner: Runner) {
  for (const prefix of ['/api/plugins/reports', '/api/projects/:id/reports']) {
    const scope = (request: any) => {
      const id = request.params.id;
      if (id !== undefined) {
        z.string().uuid().parse(id);
        if (!reports.store.project(id))
          throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
      }
      return id as string | undefined;
    };
    const idle = (id?: string) => {
      if (reports.busy() || (id ? runner.projectBusy(id) : runner.active.size))
        throw Object.assign(
          new Error('Wait for active tasks and reports before changing report settings.'),
          { statusCode: 409 },
        );
    };
    app.get(prefix, (req) => reports.settings(scope(req)));
    app.put(prefix, async (req) => {
      const id = scope(req);
      idle(id);
      reports.update(req.body, id);
      return reports.settings(id);
    });
    app.post(prefix + '/logo', async (req) => {
      const id = scope(req);
      idle(id);
      const upload = await req.file({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
      if (!upload)
        throw Object.assign(new Error('Choose a PNG or JPEG logo.'), { statusCode: 400 });
      const buffer = await upload.toBuffer();
      scope(req);
      idle(id);
      await reports.uploadLogo(buffer, id);
      return reports.settings(id);
    });
    app.delete(prefix + '/logo', async (req) => {
      const id = scope(req);
      idle(id);
      const { inherit } = z.object({ inherit: z.boolean().default(false) }).parse(req.body || {});
      reports.clearLogo(id, inherit);
      return reports.settings(id);
    });
    app.post(prefix + '/sample', async (req, reply) => {
      const id = scope(req);
      idle(id);
      const { template } = z
        .object({ template: z.enum(['executive', 'analytical', 'technical']).optional() })
        .parse(req.body || {});
      const result = await reports.sample(id, template);
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', 'attachment; filename="report-design-sample.pdf"')
        .send(Buffer.from(result.pdf, 'base64'));
    });
  }
}
