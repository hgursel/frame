import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Runner } from '../../runner.js';
import type { PrivateTools } from './service.js';
export function privateToolsApi(app: FastifyInstance, plugin: PrivateTools, runner: Runner) {
  app.get('/api/plugins/private-tools', () => plugin.settings());
  app.put('/api/plugins/private-tools', (req) => {
    if (runner.active.size)
      throw Object.assign(new Error('Stop active chats before changing Private Tools.'), {
        statusCode: 409,
      });
    return plugin.save(req.body);
  });
  app.post<{ Params: { id: string; approval: string } }>(
    '/api/conversations/:id/private-tool-approvals/:approval',
    (req) => {
      const conversation = z.string().uuid().parse(req.params.id);
      const { runId, approve } = z
        .object({ runId: z.string().uuid(), approve: z.boolean() })
        .strict()
        .parse(req.body);
      const active = runner.active.get(conversation);
      if (!active || active.runId !== runId || active.stopRequested)
        throw Object.assign(new Error('This task is no longer awaiting approval.'), {
          statusCode: 409,
        });
      return plugin.decide(
        conversation,
        z.string().uuid().parse(req.params.approval),
        runId,
        approve,
      );
    },
  );
}
