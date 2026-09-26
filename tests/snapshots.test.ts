import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyUpdate, newerSnapshot } from '../web/snapshots.js';
test('late HTTP snapshots cannot roll streaming state backward or resurrect a stopped task', () => {
  const starting = { revision: 1, messages: [], running: true, status: 'Starting local model' };
  const streaming = { ...starting, revision: 2, status: 'Responding' };
  const done = { ...streaming, revision: 3, running: false, status: 'completed' };
  assert.equal(newerSnapshot(streaming, starting), streaming);
  assert.equal(newerSnapshot(done, streaming), done);
  assert.equal(newerSnapshot(starting, streaming), streaming);
  assert.equal(newerSnapshot(streaming, done), done);
});
test('streaming updates replace only the in-progress tail of the same message version', () => {
  const user = { role: 'user' as const, text: 'Question' };
  const base = { revision: 1, messagesVersion: 7, messages: [user], running: true, status: 'x' };
  const tail = (text: string) => ({ role: 'assistant' as const, text });
  const first = applyUpdate(base, { ...base, revision: 2, tail: tail('Hel') })!;
  assert.deepEqual(first.messages, [user, tail('Hel')]);
  assert.equal(first.streaming, true);
  const second = applyUpdate(first, { ...base, revision: 3, tail: tail('Hello') })!;
  assert.deepEqual(second.messages, [user, tail('Hello')]);
  assert.deepEqual(applyUpdate(second, { ...base, revision: 4, tail: null })!.messages, [user]);
  assert.equal(applyUpdate(second, { ...base, revision: 2, tail: tail('old') }), second);
  assert.equal(
    applyUpdate(second, { ...base, revision: 5, messagesVersion: 8, tail: null }),
    undefined,
  );
});
