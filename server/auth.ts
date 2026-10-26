import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from './store.js';
import { digest, hashPassword, verifyPassword } from './security.js';
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
  disabled: number;
  mustChangePassword: number;
}
declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}
export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/)
  .transform((v) => v.toLowerCase());
export const displayNameSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^[^\x00-\x1f\x7f]*$/);
export const emailAddressSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .regex(/^[^\s<>\x00-\x1f\x7f]+$/)
  .transform((v) => v.toLowerCase());
const profileFields = {
  displayName: displayNameSchema,
  email: z.union([emailAddressSchema, z.literal('')]),
};
export const passwordSchema = z.string().min(12).max(256);
const fail = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });
export function installAuthorization(app: FastifyInstance, store: Store) {
  app.decorateRequest('user');
  app.addHook('preHandler', async (request) => {
    const route = request.routeOptions.url || '';
    if (
      !route.startsWith('/api/') ||
      ['/api/auth/status', '/api/auth/login', '/api/auth/setup'].includes(route)
    )
      return;
    const user = store.db
      .prepare(
        `SELECT u.id,u.username,u.displayName,u.email,u.role,u.disabled,u.mustChangePassword FROM users u JOIN logins l ON l.userId=u.id WHERE l.token=? AND l.expires>? AND u.disabled=0`,
      )
      .get(digest(request.cookies.frame_session || ''), Date.now()) as unknown as User;
    if (!user) throw fail(401, 'Sign in to Frame');
    request.user = user;
    if (
      user.mustChangePassword &&
      !['/api/auth/me', '/api/auth/password', '/api/auth/logout'].includes(route)
    )
      throw fail(403, 'Change your temporary password before continuing.');
    const params = request.params as Record<string, string>;
    const ownProject = (id: string) => {
      if (!store.ownsProject(user.id, id)) throw fail(404, 'Project not found');
    };
    const ownChat = (id: string) => {
      if (!store.ownsConversation(user.id, id)) throw fail(404, 'Conversation not found');
    };
    if (route.startsWith('/api/projects/:id')) ownProject(params.id!);
    if (route.startsWith('/api/conversations/:')) ownChat(params.conversation || params.id!);
    if (route.startsWith('/api/excel/sessions/:id')) ownChat(params.id!);
    if (
      ['/api/conversations', '/api/excel/sessions'].includes(route) &&
      request.method === 'POST'
    ) {
      const id = (request.body as any)?.projectId;
      if (typeof id !== 'string') throw fail(400, 'Choose a project');
      ownProject(id);
    }
    const mutation = !['GET', 'HEAD'].includes(request.method);
    if (
      mutation &&
      route.startsWith('/api/conversations/:') &&
      store.conversation(params.conversation || params.id!)?.scheduled &&
      !route.endsWith('/stop')
    )
      throw fail(409, 'Scheduled run history is read-only. Manage the task from Scheduled.');
    const admin =
      route.startsWith('/api/admin/') ||
      (route.startsWith('/api/settings') && mutation) ||
      route.startsWith('/api/plugins/') ||
      route === '/api/skills' ||
      route === '/api/projects/:id/skills' ||
      route === '/api/document-tools/install' ||
      (route.startsWith('/api/library/') && mutation) ||
      (route === '/api/excel/config' && mutation) ||
      (route.startsWith('/api/maintenance') &&
        !route.includes('/methods/') &&
        !route.includes('/drafts/'));
    if (admin && user.role !== 'admin') throw fail(403, 'Administrator access required');
    if (route.includes('/maintenance/methods/')) {
      const row = store.db
        .prepare('SELECT projectId FROM project_methods WHERE id=?')
        .get(params.id!) as any;
      if (!row) throw fail(404, 'Method not found');
      ownProject(row.projectId);
    }
    if (route.includes('/maintenance/drafts/')) {
      const row = store.db
        .prepare('SELECT payload FROM maintenance_candidates WHERE id=?')
        .get(params.id!) as any;
      if (!row) throw fail(404, 'Draft not found');
      ownProject(JSON.parse(row.payload).projectId);
    }
  });
  app.get('/api/auth/me', (request) => request.user);
  app.post('/api/auth/password', async (request) => {
    const data = z
      .object({ currentPassword: passwordSchema, password: passwordSchema })
      .parse(request.body);
    const stored = store.db
      .prepare('SELECT password FROM users WHERE id=?')
      .get(request.user.id) as any;
    if (!verifyPassword(data.currentPassword, stored.password))
      throw fail(400, 'Incorrect current password');
    store.db
      .prepare('UPDATE users SET password=?,mustChangePassword=0 WHERE id=?')
      .run(hashPassword(data.password), request.user.id);
    store.db
      .prepare('DELETE FROM logins WHERE userId=? AND token<>?')
      .run(request.user.id, digest(request.cookies.frame_session || ''));
    return { ok: true };
  });
  app.get('/api/admin/users', () =>
    store.db
      .prepare(
        'SELECT id,username,displayName,email,role,disabled,mustChangePassword FROM users ORDER BY username',
      )
      .all(),
  );
  app.post('/api/admin/users', (request) => {
    const data = z
      .object({
        username: usernameSchema,
        password: passwordSchema,
        role: z.enum(['admin', 'user']).default('user'),
        displayName: profileFields.displayName.default(''),
        email: profileFields.email.default(''),
      })
      .parse(request.body);
    if (store.db.prepare('SELECT id FROM users WHERE username=?').get(data.username))
      throw fail(409, 'Username already exists');
    return store.createUser(data.username, data.password, data.role, true, {
      displayName: data.displayName,
      email: data.email,
    });
  });
  app.patch<{ Params: { id: string } }>('/api/admin/users/:id', (request) => {
    const data = z
      .object({
        disabled: z.boolean().optional(),
        password: passwordSchema.optional(),
        displayName: profileFields.displayName.optional(),
        email: profileFields.email.optional(),
      })
      .strict()
      .parse(request.body);
    if (!store.user(request.params.id)) throw fail(404, 'User not found');
    if (
      request.params.id === request.user.id &&
      (data.disabled !== undefined || data.password !== undefined)
    )
      throw fail(
        400,
        'Use your account settings to change your password. You cannot disable your own account.',
      );
    if (data.disabled !== undefined)
      store.db
        .prepare('UPDATE users SET disabled=? WHERE id=?')
        .run(Number(data.disabled), request.params.id);
    if (data.password)
      store.db
        .prepare('UPDATE users SET password=?,mustChangePassword=1 WHERE id=?')
        .run(hashPassword(data.password), request.params.id);
    if (data.displayName !== undefined)
      store.db
        .prepare('UPDATE users SET displayName=? WHERE id=?')
        .run(data.displayName, request.params.id);
    if (data.email !== undefined)
      store.db.prepare('UPDATE users SET email=? WHERE id=?').run(data.email, request.params.id);
    if (data.disabled !== undefined || data.password)
      store.db.prepare('DELETE FROM logins WHERE userId=?').run(request.params.id);
    return store.user(request.params.id);
  });
}
