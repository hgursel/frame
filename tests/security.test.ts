import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  hashPassword,
  verifyPassword,
  localEndpoint,
  inside,
  openArtifact,
} from '../server/security.js';

test('password hashes are salted and compared correctly', () => {
  const password = 'test-password-long-enough';
  const hash = hashPassword(password);
  assert(verifyPassword(password, hash));
  assert(!verifyPassword('incorrect-password', hash));
  assert.notEqual(hash, hashPassword(password));
});
test('only literal loopback/private model endpoints are permitted', () => {
  for (const input of [
    'http://localhost:8080',
    'http://127.0.0.1:8080/v1/',
    'http://10.1.2.3:8080/v1',
    'https://192.168.1.5/v1',
    'http://172.31.0.2/v1',
    'http://[::1]:8080/v1',
  ])
    assert(localEndpoint(input).endsWith('/v1'));
  for (const input of [
    'https://api.openai.com/v1',
    'http://8.8.8.8/v1',
    'http://169.254.169.254/v1',
    'http://172.32.1.1/v1',
    'file:///etc/passwd',
    'http://user:pass@localhost/v1',
    'http://localhost/v1?q=a',
    'http://localhost/v1#test',
    'http://localhost:8080/admin',
  ])
    assert.throws(() => localEndpoint(input), input);
});
test('containment handles sibling-prefix escapes', () => {
  assert(inside('/tmp/project', '/tmp/project/file'));
  assert(!inside('/tmp/project', '/tmp/project-other/file'));
  assert(!inside('/tmp/project', '/tmp/file'));
});
test('artifact download rejects traversal, symlinks, and hardlinks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-artifact-test-'));
  try {
    await writeFile(path.join(root, 'report.txt'), 'hello');
    const valid = await openArtifact(root, 'report.txt');
    assert.equal(valid.size, 5);
    await valid.file.close();
    await symlink(path.join(root, 'report.txt'), path.join(root, 'redirect.txt'));
    await assert.rejects(openArtifact(root, 'redirect.txt'));
    await assert.rejects(openArtifact(root, '../report.txt'));
    await link(path.join(root, 'report.txt'), path.join(root, 'hard.txt'));
    await assert.rejects(openArtifact(root, 'hard.txt'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
