import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activitySteps,
  responseTurns,
  responseBlocks,
  currentActivityKey,
} from '../web/activity.js';
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
  const blocks = responseBlocks(turns[0].messages);
  assert.deepEqual(
    blocks.map((b) =>
      b.kind === 'content' ? b.item.index : activitySteps(b.messages).map((m) => m.index),
    ),
    [[1], 1, [2], 3, [4], 5, []],
  );
  assert.equal(
    currentActivityKey(turns[0].messages, blocks, true, 'Responding'),
    'activity-after-3',
  );
  assert.equal(
    currentActivityKey(turns[0].messages, blocks, true, 'Preparing tool call'),
    'activity-after-5',
  );
  assert.equal(
    currentActivityKey(turns[0].messages, blocks, false, 'completed'),
    'activity-after-3',
  );
});

test('live activity keeps its slot through tool completion, streamed reasoning, and visible continuation', () => {
  const messages: DisplayMessage[] = [{ role: 'assistant', text: 'I will check the source.' }];
  const items = () => messages.map((message, index) => ({ message, index }));
  const key = () => currentActivityKey(items(), responseBlocks(items()), true, 'Waiting for model');
  assert.equal(key(), 'activity-after-0');
  messages.push({ role: 'tool', name: 'search_knowledge', text: 'source found' });
  assert.equal(key(), 'activity-after-0');
  messages.push({ role: 'assistant', text: '', thinking: 'Check the source.' });
  assert.equal(key(), 'activity-after-0');
  messages[2].text = 'Here is what I found.';
  const blocks = responseBlocks(items());
  assert.equal(currentActivityKey(items(), blocks, true, 'Responding'), 'activity-after-0');
  const activity = blocks.find((b) => b.key === 'activity-after-0');
  assert(activity?.kind === 'activity');
  assert.deepEqual(
    activitySteps(activity.messages).map((m) => m.index),
    [1, 2],
  );
  assert.equal(
    currentActivityKey([], responseBlocks([]), true, 'Waiting for model'),
    'activity-start',
  );
});

test('chart content and failed tools retain their chronological locations and source indices', () => {
  const messages: DisplayMessage[] = [
    { role: 'tool', text: 'failed', failed: true, name: 'search_knowledge' },
    { role: 'assistant', text: 'I will try another source.' },
    { role: 'tool', text: 'chart ready', name: 'charts_create', chart: { id: 'chart' } as any },
    { role: 'assistant', text: 'The chart shows the trend.' },
  ];
  const blocks = responseBlocks(messages.map((message, index) => ({ message, index })));
  assert.deepEqual(
    blocks.filter((b) => b.kind === 'content').map((b) => b.item.index),
    [1, 2, 3],
  );
  assert.deepEqual(
    blocks
      .filter((b) => b.kind === 'activity')
      .flatMap((b) => activitySteps(b.messages).map((m) => m.index)),
    [0, 2],
  );
  assert.equal(blocks[0].kind === 'activity' && blocks[0].messages[0].message.failed, true);
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
