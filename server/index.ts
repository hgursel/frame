import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { randomToken } from './security.js';

process.umask(0o077);
const port = Number(process.env.FRAME_PORT || 3000);
const host = process.env.FRAME_HOST || '127.0.0.1';
const origin = process.env.FRAME_ORIGIN || `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FRAME_PORT');
if (!['127.0.0.1', '::1'].includes(host))
  throw new Error(
    'Frame binds to loopback only. Use an authenticated deployment behind an HTTPS reverse proxy for LAN access.',
  );
if (
  !new URL(origin).hostname.match(/^(127\.0\.0\.1|localhost|\[::1\])$/) &&
  !origin.startsWith('https://')
)
  throw new Error('Non-loopback FRAME_ORIGIN requires HTTPS');
const setupToken = process.env.FRAME_SETUP_TOKEN || randomToken();
const source = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(source, import.meta.url.endsWith('.ts') ? 'dist/web' : 'web');
const { app, store, runner } = await createApp({
  dataDir: path.resolve(process.env.FRAME_DATA_DIR || 'data'),
  origin,
  setupToken,
  webDir,
});
if (!store.meta('password')) console.log(`First-run setup token (keep private): ${setupToken}`);
await app.listen({ host, port });
console.log(`Frame is ready at ${origin}`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void (async () => {
      await runner.close();
      await app.close();
      process.exit(0);
    })();
  });
