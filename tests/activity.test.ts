import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySteps, responseTurns } from '../web/activity.js';
import { statusLabel } from '../web/tool-labels.js';
import type { DisplayMessage } from '../shared/types.js';

test('groups all tool continuations into one response without changing knowledge indices', () => {
  const messages: DisplayMessage[] = [
    { role: 'user', text: 'Analyze sales' },
    { role: 'assistant', text: 'I will check sales.', thinking: 'Find the table.' },
    { role: 'tool', text: 'schema', name: 'mssql_schema_read' },
    { role: 'assistant', text: 'Now I will calculate totals.' },
    { role: 'tool', text: 'rows', name: 'mssql_query' },
    { role: 'assistant', text: 'Here are the totals.' },
    { role: 'user', text: 'What changed?' },
    { role: 'assistant', text: 'Comparing…' },
  ];
  const turns = responseTurns(messages);
  assert.equal(turns.length, 2);
  assert.deepEqual(
    turns[0].messages.map((m) => m.index),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    activitySteps(turns[0].messages).map((m) => m.index),
    [1, 2, 4],
  );
  assert.equal(turns[1].messages[0].index, 7);
  for (const turn of turns)
    for (const { index, message } of turn.messages) assert.equal(message, messages[index]);
});

test('handles truncated history, pending replies, and empty conversations', () => {
  const turns = responseTurns([
    { role: 'tool', text: 'earlier output' },
    { role: 'assistant', text: 'Earlier answer' },
    { role: 'user', text: 'Next question' },
  ]);
  assert.equal(turns[0].user, undefined);
  assert.equal(turns[0].messages.length, 2);
  assert.equal(turns[1].user?.index, 2);
  assert.deepEqual(turns[1].messages, []);
  assert.deepEqual(responseTurns([]), []);
});

test('activity status follows current events and uses readable tool labels', () => {
  assert.equal(statusLabel('Running mssql_query'), 'Running SQL query');
  assert.equal(statusLabel('Running mssql_schema_read'), 'Reading table structure');
  assert.equal(statusLabel('Running reports_create'), 'Creating PDF report');
  assert.equal(statusLabel('Running charts_transform'), 'Calculating chart data');
  for (const status of ['Thinking', 'Waiting for model', 'Stopping', 'Compacting context'])
    assert.equal(statusLabel(status), status);
  assert.equal(statusLabel('Running custom_tool'), 'Running custom tool');
});
