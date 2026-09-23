import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Runner } from '../../runner.js';
import type { ChartsPlugin } from './service.js';
export function chartsApi(app: FastifyInstance, charts: ChartsPlugin, runner: Runner) {
  app.get('/api/plugins/charts', () => ({ enabled: charts.enabled() }));
  app.put('/api/plugins/charts', (request, reply) => {
    if (runner.active.size)
      return reply.code(409).send({ error: 'Stop active tasks before changing chart settings.' });
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    charts.store.setMeta('charts:enabled', String(enabled));
    return { enabled };
  });
  app.get<{ Params: { conversation: string; id: string }; Querystring: { format?: string } }>(
    '/api/conversations/:conversation/charts/:id',
    (request, reply) => {
      const chart = charts.get(
        z.string().uuid().parse(request.params.conversation),
        z.string().uuid().parse(request.params.id),
      );
      if (request.query.format !== 'csv') return chart;
      const cell = (value: unknown) => {
        let text = value == null ? '' : String(value);
        if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
      };
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="chart-${chart.id}.csv"`)
        .send(
          [[chart.x, ...chart.y], ...chart.rows].map((row) => row.map(cell).join(',')).join('\r\n'),
        );
    },
  );
}
