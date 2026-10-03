import { isIP } from 'node:net';

const loopback = (host: string) => ['127.0.0.1', 'localhost', '::1'].includes(host);
const privateIPv4 = (host: string) => {
  const [a, b] = host.split('.').map(Number);
  return (
    isIP(host) === 4 &&
    (a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168))
  );
};

/** Deployment settings only; model endpoint restrictions are separate. */
export function listenConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.FRAME_PORT || 3000);
  const host = env.FRAME_HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FRAME_PORT');
  if (!['127.0.0.1', '::1', '0.0.0.0'].includes(host) && !privateIPv4(host))
    throw new Error('FRAME_HOST must be loopback, a private IPv4 address, or 0.0.0.0.');
  if (!loopback(host) && !env.FRAME_ORIGIN)
    throw new Error('Set FRAME_ORIGIN to the exact address browsers will use for LAN access.');
  const url = new URL(env.FRAME_ORIGIN || `http://${host === '::1' ? '[::1]' : host}:${port}`);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'FRAME_ORIGIN must be an HTTP(S) origin without credentials, path, query, or fragment.',
    );
  const browserHost = url.hostname.replace(/^\[|\]$/g, '');
  if (browserHost === '0.0.0.0' || browserHost === '::')
    throw new Error('FRAME_ORIGIN must use the server address, not a wildcard bind address.');
  if (!loopback(host) && loopback(browserHost))
    throw new Error('LAN binding requires a non-loopback FRAME_ORIGIN.');
  const httpLan = url.protocol === 'http:' && !loopback(browserHost);
  if (httpLan && (!privateIPv4(browserHost) || env.FRAME_ALLOW_HTTP_LAN !== 'true'))
    throw new Error(
      'LAN HTTP requires a private IPv4 FRAME_ORIGIN and FRAME_ALLOW_HTTP_LAN=true. Use HTTPS otherwise.',
    );
  return { host, port, origin: url.origin, httpLan };
}
