import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

export const origin = 'http://127.0.0.1:3000';
const setupToken = 'test-setup-token';
const password = 'test-password-12345';

/** A fresh app in a temporary data directory. `auth` requests carry an administrator session. */
export async function appFixture(
  name: string,
  options: Omit<Parameters<typeof createApp>[0], 'dataDir' | 'origin' | 'setupToken'> = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), `frame-${name}-`));
  const ctx = await createApp({ dataDir: root, origin, setupToken, ...options });
  const call = (url: string, method = 'GET', payload?: unknown, cookie = '') =>
    ctx.app.inject({
      url: `/api${url}`,
      method: method as any,
      payload: payload as any,
      headers: { host: '127.0.0.1:3000', origin, ...(cookie ? { cookie } : {}) },
    });
  let token = '';
  return {
    ...ctx,
    root,
    call,
    auth: (url: string, method = 'GET', payload?: unknown) => call(url, method, payload, token),
    get token() {
      return token;
    },
    async signIn() {
      assert.equal(
        (await call('/auth/setup', 'POST', { token: setupToken, password })).statusCode,
        200,
      );
      const login = await call('/auth/login', 'POST', { password });
      token = String(login.headers['set-cookie']).split(';')[0]!;
      return token;
    },
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function waitUntil(test: () => boolean, timeout = 25000) {
  const end = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > end) throw new Error('Timed out waiting for agent');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/** Every registered API route, parsed from Fastify's route tree, with parameters filled in. */
export function apiRoutes(app: { printRoutes(options: { commonPrefix: false }): string }) {
  const stack: string[] = [];
  const routes: { method: string; url: string }[] = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const match = line.match(/^([│ ]*)[├└]── (\S+)(?: \(([^)]+)\))?/);
    if (!match) continue;
    stack.length = match[1]!.length / 4;
    stack.push(match[2]!);
    const url = stack.join('');
    for (const method of match[3]?.split(', ') || [])
      if (method !== 'HEAD' && url.startsWith('/api/'))
        routes.push({ method, url: url.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000') });
  }
  return routes;
}
