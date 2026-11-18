import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { browserTabSchema } from '../../shared/browser.js';
import type { Browsers } from './service.js';
import type { Runner } from '../runner.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Narrow device access. Never grant extension tokens administration, email-send, files, or SQL approval. */
export function browserDeviceRoute(url: string, method: string) {
  const p = url.split('?')[0]!;
  if (
    method === 'GET' &&
    [
      '/api/projects',
      '/api/conversations',
      '/api/settings',
      '/api/auth/me',
      '/api/browser/config',
      '/api/browser/device/poll',
    ].includes(p)
  )
    return true;
  if (method === 'POST' && ['/api/conversations', '/api/browser/device/child-tab'].includes(p))
    return true;
  if (method === 'GET' && /^\/api\/projects\/[^/]+\/plugins$/.test(p)) return true;
  if (method === 'GET' && /^\/api\/conversations\/[^/]+$/.test(p)) return true;
  if (method === 'GET' && /^\/api\/conversations\/[^/]+\/browser\/images\/[a-f0-9]{64}$/.test(p))
    return true;
  if (['GET', 'POST'].includes(method) && /^\/api\/browser\/device\/commands\/[^/]+$/.test(p))
    return true;
  if (
    method === 'POST' &&
    /^\/api\/conversations\/[^/]+\/(messages|stop|questions\/[^/]+)$/.test(p)
  )
    return true;
  if (
    ['GET', 'POST', 'DELETE'].includes(method) &&
    /^\/api\/conversations\/[^/]+\/browser(?:\/reviews\/[^/]+)?$/.test(p)
  )
    return true;
  return false;
}
export function browserApi(
  app: FastifyInstance,
  browser: Browsers,
  runner: Runner,
  origin: string,
) {
  const device = (req: any) =>
    browser.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''));
  const requireHttps = () => {
    if (!origin.startsWith('https:'))
      throw Object.assign(new Error('Frame for Browser requires trusted HTTPS.'), {
        statusCode: 400,
      });
  };
  app.get('/api/browser/config', async () => ({
    enabled: browser.enabled(),
    origin,
    https: origin.startsWith('https:'),
  }));
  app.put('/api/admin/browser', async (req) => {
    requireHttps();
    browser.setEnabled(z.object({ enabled: z.boolean() }).strict().parse(req.body).enabled);
    return { enabled: browser.enabled() };
  });
  app.get('/api/browser/devices', async (req) => browser.devices(req.user.id));
  app.delete<{ Params: { id: string } }>('/api/browser/devices/:id', async (req) => {
    browser.revoke(req.user.id, z.uuid().parse(req.params.id));
    return { ok: true };
  });
  app.post('/api/browser/pair-code', async (req) => {
    requireHttps();
    return browser.pairCode(req.user.id);
  });
  app.post(
    '/api/browser/device/pair',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      requireHttps();
      const b = z
        .object({ code: z.string().min(30).max(100), name: z.string().trim().min(1).max(100) })
        .strict()
        .parse(req.body);
      return browser.pair(b.code, b.name);
    },
  );
  app.post('/api/browser/device/child-tab', async (req) => {
    const b = z
      .object({ opener: z.string().min(1).max(80), tab: browserTabSchema })
      .strict()
      .parse(req.body);
    return browser.childTab(device(req).id, b.opener, b.tab);
  });
  app.get('/api/browser/device/poll', async (req) => browser.poll(device(req).id));
  app.get<{ Params: { id: string } }>('/api/browser/device/commands/:id', async (req) => {
    browser.valid(device(req).id, z.uuid().parse(req.params.id));
    return { valid: true };
  });
  app.post<{ Params: { id: string } }>(
    '/api/browser/device/commands/:id',
    { bodyLimit: 5 * 1024 * 1024 },
    async (req) => {
      const b = z
        .object({ result: z.unknown().optional(), error: z.string().max(2000).optional() })
        .strict()
        .parse(req.body);
      return browser.respond(device(req).id, z.uuid().parse(req.params.id), b.result, b.error);
    },
  );
  app.get<{ Params: { id: string } }>('/api/conversations/:id/browser', async (req) =>
    browser.state(req.params.id),
  );
  app.post<{ Params: { id: string } }>('/api/conversations/:id/browser', async (req) => {
    if (runner.active.has(req.params.id))
      throw Object.assign(new Error('Stop the current task before attaching tabs.'), {
        statusCode: 409,
      });
    const b = z.object({ tabs: z.unknown() }).strict().parse(req.body);
    browser.bind(req.user.id, req.params.id, device(req).id, b.tabs);
    return browser.state(req.params.id);
  });
  app.delete<{ Params: { id: string } }>('/api/conversations/:id/browser', async (req) => {
    browser.detach(req.params.id);
    runner.stop(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string; review: string } }>(
    '/api/conversations/:id/browser/reviews/:review',
    async (req) => {
      const b = z.object({ runId: z.uuid(), approve: z.boolean() }).strict().parse(req.body);
      return browser.decide(req.params.id, z.uuid().parse(req.params.review), b.runId, b.approve);
    },
  );
  app.get<{ Params: { id: string; hash: string } }>(
    '/api/conversations/:id/browser/images/:hash',
    async (req) => {
      const image = runner.image(
        req.params.id,
        z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(req.params.hash),
      );
      if (!image) throw Object.assign(new Error('Screenshot not found.'), { statusCode: 404 });
      return image;
    },
  );
  app.get('/api/browser/extension', async (_req, reply) => {
    try {
      return reply
        .type('application/zip')
        .header('Content-Disposition', 'attachment; filename="frame-browser.zip"')
        .send(await readFile(path.resolve('dist/frame-browser.zip')));
    } catch {
      return reply.code(404).send({ error: 'Build the extension with npm run build:browser.' });
    }
  });
}
