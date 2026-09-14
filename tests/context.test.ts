import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextBudget, metricsKey, pruneToolOutputs } from '../server/context.js';
import { defaults } from '../server/store.js';

test('context budgets scale to local slots and reserve output headroom', () => {
  for (const window of [4096, 8192, 32768, 131072]) {
    const settings = { ...defaults, contextWindow: window, maxTokens: Math.floor(window / 8) };
    const budget = contextBudget(settings);
    assert.equal(budget.threshold, window * 0.75);
    assert(budget.keepRecentTokens < budget.threshold);
    assert(budget.reserveTokens >= settings.maxTokens + 256);
  }
  const constrained = contextBudget({
    ...defaults,
    contextWindow: 8192,
    maxTokens: 4096,
    compactAtPercent: 90,
  });
  assert(constrained.threshold < 4096, 'Large output limit must move the trigger earlier');
  const project = { id: 'project', name: 'Project', instructions: '', toolsEnabled: false };
  assert.notEqual(
    metricsKey(defaults, project),
    metricsKey({ ...defaults, modelId: 'other' }, project),
  );
  assert.notEqual(
    metricsKey(defaults, project),
    metricsKey(defaults, { ...project, toolsEnabled: true }),
  );
});

test('pruning preserves recent turns, errors, mutations, IDs, and the authoritative transcript', () => {
  const output = 'HEAD important source\n' + 'x'.repeat(16000) + '\nTAIL conclusion';
  const tool = (name: string, isError = false) => ({
    role: 'toolResult',
    toolName: name,
    toolCallId: name,
    isError,
    content: [{ type: 'text', text: output }],
  });
  const messages = [
    { role: 'user', content: 'old question' },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'read', name: 'read', arguments: { path: 'wiki.md' } }],
    },
    tool('read'),
    tool('write'),
    tool('bash'),
    tool('read_knowledge', true),
    tool('propose_knowledge'),
    { role: 'user', content: 'protected turn one' },
    tool('grep'),
    { role: 'user', content: 'protected turn two' },
    tool('find'),
  ];
  const before = JSON.stringify(messages);
  const pruned = pruneToolOutputs(messages, 8192);
  assert(pruned.saved > 3000);
  const read = pruned.messages[2] as ReturnType<typeof tool>;
  assert.equal(read.toolCallId, 'read');
  assert.match(read.content[0]!.text, /HEAD important source/);
  assert.match(read.content[0]!.text, /TAIL conclusion/);
  assert.match(read.content[0]!.text, /full result remains/);
  for (const index of [0, 1, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.deepEqual(pruned.messages[index], messages[index]);
  assert.equal(JSON.stringify(messages), before);
  assert.deepEqual(
    pruneToolOutputs(pruned.messages, 8192).messages,
    pruned.messages,
    'Projection must be idempotent',
  );
  assert.deepEqual(
    pruneToolOutputs(messages.slice(0, 7), 8192).messages,
    messages.slice(0, 7),
    'Do not trim when fewer than two recent user turns exist',
  );
});
