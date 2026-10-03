import { listenConfig } from './listen-config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { randomToken } from './security.js';

process.umask(0o077);
const { host, port, origin, httpLan } = listenConfig();
if (httpLan)
  console.warn(
    'LAN HTTP enabled: passwords, sessions, and chat traffic are not encrypted. Use only on a trusted network; HTTPS is recommended.',
  );
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
    // A hung SQL, model, or Python request must not keep the service from stopping.
    setTimeout(() => {
      console.error('Shutdown timed out; exiting.');
      process.exit(1);
    }, 20_000).unref();
    void (async () => {
      try {
        await runner.close();
        await app.close();
        process.exit(0);
      } catch (error) {
        console.error('Shutdown failed:', error);
        process.exit(1);
      }
    })();
  });
