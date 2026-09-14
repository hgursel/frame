import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newerSnapshot } from '../web/snapshots.js';
test('late HTTP snapshots cannot roll streaming state backward or resurrect a stopped task', () => {
  const starting = { revision: 1, messages: [], running: true, status: 'Starting local model' };
  const streaming = { ...starting, revision: 2, status: 'Responding' };
  const done = { ...streaming, revision: 3, running: false, status: 'completed' };
  assert.equal(newerSnapshot(streaming, starting), streaming);
  assert.equal(newerSnapshot(done, streaming), done);
  assert.equal(newerSnapshot(starting, streaming), streaming);
  assert.equal(newerSnapshot(streaming, done), done);
});
