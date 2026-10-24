import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  return !!salt && !!hash && equal(scryptSync(password, salt, 64).toString('hex'), hash);
}

/** Administrator-selected OpenAI-compatible base URL; no automatic fallback. */
export function localEndpoint(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use an HTTP(S) endpoint without credentials, query strings, or fragments.');
  if (url.pathname === '/') url.pathname = '/v1';
  return url.toString().replace(/\/$/, '');
}

export function inside(root: string, target: string) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

/** Open an authenticated download by flat filename, not an arbitrary browser path. */
export async function openArtifact(root: string, name: string) {
  if (!name || name !== path.basename(name) || name.includes('\\') || name.startsWith('.'))
    throw new Error('Invalid artifact');
  const canonicalRoot = await realpath(root);
  const target = path.join(canonicalRoot, name);
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    const actual = await realpath(`/proc/self/fd/${file.fd}`);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      !inside(canonicalRoot, actual) ||
      stat.size > 100 * 1024 * 1024
    )
      throw new Error('Artifact unavailable');
    return { file, size: stat.size };
  } catch (error) {
    await file.close();
    throw error;
  }
}
