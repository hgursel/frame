import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { Store } from './store.js';
import { Runner } from './runner.js';
import { PythonRuntime } from './python.js';
import { Knowledge } from './knowledge.js';
import { Wiki } from './wiki.js';
import { knowledgeApi } from './knowledge-api.js';
import {
  digest,
  equal,
  hashPassword,
  localEndpoint,
  openArtifact,
  randomToken,
  verifyPassword,
} from './security.js';

const uuid = z.string().uuid();
const projectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  instructions: z.string().max(16000).default(''),
  toolsEnabled: z.boolean().default(false),
});
const modelSchema = z
  .object({
    baseUrl: z.string().transform((value, ctx) => {
      try {
        return localEndpoint(value);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: (error as Error).message });
        return z.NEVER;
      }
    }),
    modelId: z.string().trim().min(1).max(200),
    contextWindow: z.number().int().min(2048).max(2_000_000),
    maxTokens: z.number().int().min(128).max(131072),
    instructions: z.string().max(16000),
    apiKey: z.string().max(4096).optional(),
  })
  .refine((v) => v.maxTokens < v.contextWindow, 'Output limit must be smaller than context window');
const credentialsSchema = z.object({
  password: z.string().min(12).max(256),
  token: z.string().max(256).optional(),
});

export async function createApp(options: {
  dataDir: string;
  origin: string;
  setupToken: string;
  webDir?: string;
}) {
  const origin = new URL(options.origin).origin;
  const store = new Store(path.resolve(options.dataDir));
  const runner = new Runner(store);
  const python = new PythonRuntime(store.root);
  const knowledge = new Knowledge(store, python);
  const wiki = new Wiki(knowledge);
  const streams = new Set<ServerResponse>();
  const app = Fastify({ bodyLimit: 128 * 1024, logger: false, trustProxy: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  const authLimit = { rateLimit: { max: 5, timeWindow: '1 minute' } };
  const publicRoutes = new Set(['/api/auth/status', '/api/auth/setup', '/api/auth/login']);
  app.setErrorHandler((error: any, _request, reply) => {
    const validation = error instanceof z.ZodError;
    const status = validation ? 400 : error.statusCode || 500;
    const message = validation
      ? error.issues.map((i: any) => i.message).join('; ')
      : status < 500
        ? error.message
        : 'Request failed. Check configuration and try again.';
    reply.code(status).send({ error: message });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
    );
    if (request.headers.host !== new URL(origin).host)
      return reply.code(403).send({ error: 'Unexpected host' });
    const route = request.url.split('?')[0]!;
    if (!route.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.origin !== origin)
      return reply.code(403).send({ error: 'Same-origin request required' });
    if (request.headers['sec-fetch-site'] === 'cross-site')
      return reply.code(403).send({ error: 'Cross-site request rejected' });
    if (publicRoutes.has(route)) return;
    const token = request.cookies.frame_session;
    const login =
      token &&
      store.db
        .prepare('SELECT token FROM logins WHERE token=? AND expires>?')
        .get(digest(token), Date.now());
    if (!login) return reply.code(401).send({ error: 'Sign in to Frame' });
  });
  const sessionCookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: origin.startsWith('https:'),
    maxAge: 8 * 3600,
  };
  app.get('/api/auth/status', async () => ({ setupRequired: !store.meta('password') }));
  app.post('/api/auth/setup', { config: authLimit }, async (request, reply) => {
    if (store.meta('password')) return reply.code(409).send({ error: 'Already initialized' });
    const data = credentialsSchema.parse(request.body);
    if (!data.token || !equal(data.token, options.setupToken))
      return reply.code(403).send({ error: 'Incorrect setup token' });
    store.setMeta('password', hashPassword(data.password));
    return { ok: true };
  });
  app.post('/api/auth/login', { config: authLimit }, async (request, reply) => {
    const { password } = credentialsSchema.parse(request.body);
    const stored = store.meta('password');
    if (!stored || !verifyPassword(password, stored))
      return reply.code(401).send({ error: 'Incorrect password' });
    const token = randomToken();
    store.db.prepare('DELETE FROM logins WHERE expires<=?').run(Date.now());
    store.db
      .prepare('INSERT INTO logins VALUES (?, ?)')
      .run(digest(token), Date.now() + 8 * 3600_000);
    reply.setCookie('frame_session', token, sessionCookie);
    return { ok: true };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    store.db
      .prepare('DELETE FROM logins WHERE token=?')
      .run(digest(request.cookies.frame_session || ''));
    reply.clearCookie('frame_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/settings', async () => {
    const { apiKey, ...settings } = store.settings();
    return { ...settings, hasApiKey: !!apiKey };
  });
  app.put('/api/settings', async (request) => {
    if (runner.active.size)
      throw Object.assign(new Error('Stop running tasks before changing settings.'), {
        statusCode: 409,
      });
    const value = modelSchema.parse(request.body);
    store.saveSettings({
      ...value,
      apiKey: value.apiKey === undefined ? store.settings().apiKey : value.apiKey,
    });
    return { ok: true };
  });
  app.post(
    '/api/settings/test',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const settings = store.settings();
      try {
        const response = await fetch(`${localEndpoint(settings.baseUrl)}/models`, {
          headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        });
        if (!response.ok)
          return reply.code(502).send({ error: `llama.cpp returned HTTP ${response.status}` });
        // Bound response size even for an accidentally misconfigured local service.
        const reader = response.body!.getReader();
        let text = '';
        const decoder = new TextDecoder();
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          text += decoder.decode(part.value, { stream: true });
          if (text.length > 1_000_000) {
            await reader.cancel();
            throw new Error('Too large');
          }
        }
        const json = JSON.parse(text);
        const models = z
          .array(z.object({ id: z.string() }))
          .parse(json.data)
          .map((m) => m.id);
        return {
          ok: true,
          models,
          selectedModelFound: models.includes(settings.modelId),
          note: 'Discovery succeeded. A chat/tool test is still required.',
        };
      } catch {
        return reply.code(502).send({
          error:
            'Could not query the local endpoint. Check address, authentication, and llama.cpp availability.',
        });
      }
    },
  );
  app.get('/api/projects', async () => store.projects());
  app.post('/api/projects', async (request) =>
    store.createProject(projectSchema.parse(request.body)),
  );
  app.put<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const id = uuid.parse(request.params.id);
    if (!store.project(id)) return reply.code(404).send({ error: 'Project not found' });
    if (runner.projectBusy(id))
      return reply.code(409).send({ error: 'Stop this project’s task first' });
    return store.updateProject(id, projectSchema.parse(request.body));
  });
  app.get('/api/conversations', async () => store.conversations());
  app.post('/api/conversations', async (request, reply) => {
    const { projectId } = z.object({ projectId: uuid }).parse(request.body);
    if (!store.project(projectId)) return reply.code(404).send({ error: 'Project not found' });
    return store.createConversation(projectId);
  });
  const conversationId = (id: string) => {
    uuid.parse(id);
    if (!store.conversation(id))
      throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
    return id;
  };
  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (request) =>
    runner.snapshot(conversationId(request.params.id)),
  );
  app.post<{ Params: { id: string } }>(
    '/api/conversations/:id/messages',
    async (request, reply) => {
      const id = conversationId(request.params.id);
      const { requestId, text, documentIds } = z
        .object({
          requestId: uuid,
          text: z.string().trim().min(1).max(32000),
          documentIds: z.array(uuid).max(5).default([]),
        })
        .parse(request.body);
      if (store.db.prepare('SELECT id FROM runs WHERE id=?').get(requestId))
        return reply.code(202).send(runner.start(id, requestId, text));
      const project = store.project(store.conversation(id)!.projectId)!;
      return knowledge.write(project.id, async () => {
        const documents = await knowledge.context(
          project.id,
          documentIds,
          store.settings().contextWindow,
        );
        const runtime = project.toolsEnabled ? await python.status() : undefined;
        const catalog = await wiki.catalog(project.id);
        return reply
          .code(202)
          .send(
            runner.start(
              id,
              requestId,
              text,
              documents,
              runtime?.state === 'ready' ? python.executable : undefined,
              catalog,
            ),
          );
      });
    },
  );
  app.post<{ Params: { id: string } }>('/api/conversations/:id/stop', async (request) => {
    runner.stop(conversationId(request.params.id));
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>('/api/conversations/:id/events', async (request, reply) => {
    const id = conversationId(request.params.id);
    if (runner.listenerCount(id) >= 8)
      return reply.code(429).send({ error: 'Too many open tabs for this conversation' });
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    reply.hijack();
    streams.add(reply.raw);
    const publish = () => {
      if (reply.raw.destroyed) return;
      const login = store.db
        .prepare('SELECT token FROM logins WHERE token=? AND expires>?')
        .get(digest(request.cookies.frame_session || ''), Date.now());
      if (!login) {
        reply.raw.end();
        return;
      }
      if (reply.raw.writableLength > 2_000_000) {
        reply.raw.destroy();
        return;
      }
      reply.raw.write(`data: ${JSON.stringify(runner.snapshot(id))}\n\n`);
    };
    runner.on(id, publish);
    publish();
    const heartbeat = setInterval(() => {
      const login = store.db
        .prepare('SELECT token FROM logins WHERE token=? AND expires>?')
        .get(digest(request.cookies.frame_session || ''), Date.now());
      if (!login) reply.raw.end();
      else reply.raw.write(': heartbeat\n\n');
    }, 15000);
    reply.raw.on('close', () => {
      clearInterval(heartbeat);
      runner.off(id, publish);
      streams.delete(reply.raw);
    });
  });
  app.get<{ Params: { id: string } }>('/api/conversations/:id/artifacts', async (request) => {
    const id = conversationId(request.params.id);
    const root = store.artifacts(store.conversation(id)!);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name }));
  });
  app.get<{ Params: { id: string; name: string } }>(
    '/api/conversations/:id/artifacts/:name',
    async (request, reply) => {
      const id = conversationId(request.params.id);
      try {
        const { file, size } = await openArtifact(
          store.artifacts(store.conversation(id)!),
          request.params.name,
        );
        reply.header('Content-Type', 'application/octet-stream');
        reply.header('Content-Length', size);
        reply.header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(request.params.name).replace(/'/g, '%27')}`,
        );
        reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
        return reply.send(file.createReadStream({ autoClose: true }));
      } catch {
        return reply.code(404).send({ error: 'Artifact unavailable' });
      }
    },
  );
  knowledgeApi(app, knowledge, wiki, runner);
  if (options.webDir && existsSync(options.webDir)) {
    await app.register(staticFiles, { root: options.webDir, wildcard: false });
  }
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
    await runner.close();
    await python.close();
  });
  app.addHook('onClose', async () => {
    store.close();
  });
  return { app, store, runner, knowledge, wiki, python };
}
