import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Runner } from '../runner.js';
import type { MssqlPlugin } from './mssql/service.js';
import type { ChartsPlugin } from './charts/service.js';
import type { ReportsPlugin } from './reports/service.js';
export function projectPluginsApi(
  app: FastifyInstance,
  runner: Runner,
  sql: MssqlPlugin,
  charts: ChartsPlugin,
  reports: ReportsPlugin,
) {
  const project = (id: string) => {
    z.string().uuid().parse(id);
    if (!sql.store.project(id))
      throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
    return id;
  };
  const snapshot = (id: string) => ({
    mssql: sql.projectEnabled(id),
    systemEnabled: sql.settings().enabled,
    charts: charts.projectEnabled(id),
    chartsSystemEnabled: charts.enabled(),
    reports: reports.projectEnabled(id),
    reportsSystemEnabled: reports.enabled(),
  });
  app.get<{ Params: { id: string } }>('/api/projects/:id/plugins', (req) =>
    snapshot(project(req.params.id)),
  );
  app.put<{ Params: { id: string } }>('/api/projects/:id/plugins', (req) => {
    const id = project(req.params.id);
    if (
      runner.projectBusy(id) ||
      sql.schema.jobs.has(id) ||
      sql.notes.jobs.has(id) ||
      sql.controllers.size ||
      reports.busy(id)
    )
      throw Object.assign(new Error('Stop active tasks before changing project plugins.'), {
        statusCode: 409,
      });
    const value = z
      .object({
        mssql: z.boolean().optional(),
        charts: z.boolean().optional(),
        reports: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    if (value.mssql !== undefined) sql.setProject(id, value.mssql);
    if (value.charts !== undefined) charts.setProject(id, value.charts);
    if (value.reports !== undefined) reports.setProject(id, value.reports);
    return snapshot(id);
  });
}
