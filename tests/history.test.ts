import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { displayMessages, readHistory } from '../server/history.js';
import { appFixture } from './helpers.js';

const longConversation = (turns: number, size: number) =>
  Array.from({ length: turns }, (_, i) => [
    { role: 'user', content: `Question ${i}` },
    { role: 'toolResult', toolName: 'search_knowledge', content: `Source ${i}` },
    { role: 'assistant', content: `Answer ${i}: ${'x'.repeat(size)}` },
  ]).flat();

for (const [name, turns, size] of [
  ['more than 100 messages', 45, 10],
  ['more than 500,000 characters', 10, 60_000],
] as const) {
  test(`display preserves the first prompt and every message with ${name}`, () => {
    const messages = longConversation(turns, size);
    const displayed = displayMessages(messages);
    assert.equal(displayed.length, messages.length);
    assert.deepEqual(
      displayed.map((m) => m.text),
      messages.map((m) => m.content),
    );
    assert.equal(displayed[0]?.role, 'user');
    // A live tail update must not change the completed transcript.
    assert.deepEqual(
      displayMessages(messages, true).map((m) => m.text),
      displayed.map((m) => m.text),
    );
  });
}

test('reopening long native history through the API retains the complete active branch', async () => {
  const f = await appFixture('long-history');
  try {
    await f.signIn();
    const project = f.store.createProject({
      name: 'History',
      instructions: '',
      toolsEnabled: false,
    });
    const chat = f.store.createConversation(project.id);
    const messages = longConversation(45, 15_000);
    const entries = messages.map((message, i) => ({
      type: 'message',
      id: `m${i}`,
      parentId: i ? `m${i - 1}` : null,
      message,
    }));
    // An abandoned branch must stay hidden even when all active history is displayed.
    entries.splice(1, 0, {
      type: 'message',
      id: 'abandoned',
      parentId: 'm0',
      message: { role: 'assistant', content: 'Other branch' },
    });
    const file = f.store.sessionFile(chat.id);
    const raw = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    await writeFile(file, raw);
    const expected = messages.map((m) => m.content);
    assert.deepEqual(
      readHistory(file).map((m) => m.text),
      expected,
    );
    for (let reopen = 0; reopen < 2; reopen++) {
      const response = await f.auth(`/conversations/${chat.id}`);
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(
        response.json().messages.map((m: { text: string }) => m.text),
        expected,
      );
    }
    assert.equal(await readFile(file, 'utf8'), raw, 'display never rewrites native history');
  } finally {
    await f.cleanup();
  }
});
