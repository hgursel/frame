import test from 'node:test';
import assert from 'node:assert/strict';
import { reportMarkdown } from '../server/plugins/reports/markdown.js';

const two = '| Name | Value |\n| --- | --- |\n| First | 12 |';
const three = '| A | B | C |\n| --- | --- | --- |\n| x | y | z |';
const four = '| A | B | C | D |\n| --- | --- | --- | --- |\n| x | y | z | w |';
const tables = (text: string) => (reportMarkdown(text) as any[]).filter((b) => b.type === 'table');

test('report Markdown independently parses tables mixed with headings and different widths', () => {
  assert.equal(tables(two).length, 1);
  assert.deepEqual(
    (reportMarkdown(`## Findings\n\n${two}`) as any[]).map((b) => b.type),
    ['heading', 'table'],
  );
  const text = `## High Priority\n\n${four}\n\n### Medium Priority\n\n${three}\n\n${four}\n\n${three}\n\n${four}`;
  assert.deepEqual(
    tables(text).map((b) => b.columns.length),
    [4, 3, 4, 3, 4],
  );
  assert.equal(tables(`${four}\n### Medium Priority\n${three}`).length, 2);
});

test('unseparated trailing prose is retained as prose rather than rejected as a short row', () => {
  const parsed = reportMarkdown(
    `${two}\nConcluding paragraph with **emphasis**.\nContinued explanation.\n\n${three}`,
  ) as any[];
  assert.deepEqual(
    parsed.map((b) => b.type),
    ['table', 'paragraph', 'table'],
  );
  assert.equal(parsed[0].rows.length, 1);
  assert.match(parsed[1].text, /Concluding paragraph with <b>emphasis<\/b>/);
  assert.match(parsed[1].text, /Continued explanation/);
});

test('cell formatting, escaped pipes, code, quotes and Unicode preserve cell values', () => {
  const text =
    '| Label | Value |\n| :--- | ---: |\n| **bold** and _italic_ | a\\|b — … "quoted" |\n| `code` | `x\\|y` |';
  assert.deepEqual(tables(text)[0].rows, [
    ['bold and italic', 'a|b — … "quoted"'],
    ['code', 'x|y'],
  ]);
  assert.deepEqual(tables('A | B\n--- | ---\nx | y')[0].rows, [['x', 'y']]);
  assert.deepEqual(tables('| Name |\n| --- |\nValue')[0].rows, [['Value']]);
});

test('table errors identify the input block, table, row, original line and cell counts', () => {
  assert.throws(
    () => reportMarkdown(`${two}\n\n${three}\n| extra | cell | here | invalid |`, 4),
    /Markdown block 4, table 2, data row 2 \(line 8\): expected 3 cells, received 4.*extra/,
  );
  assert.throws(
    () => reportMarkdown(`${two}\nSummary\n\n${three}\n| missing | cell |`, 2),
    /Markdown block 2, table 2, data row 2 \(line 9\): expected 3 cells, received 2/,
  );
  assert.throws(() => reportMarkdown('| A | B |\n| --- | --- |'), /at least one data row/);
  const row = '| ' + Array.from({ length: 21 }, (_, i) => `C${i}`).join(' | ') + ' |';
  assert.throws(
    () => reportMarkdown(`${row}\n| ${Array(21).fill('---').join(' | ')} |\n${row}`),
    /header has 21 columns/,
  );
});

test('normalization leaves fenced code and non-table pipe text unchanged', () => {
  const text = `Before | prose\n\n\`\`\`markdown\n${two}\nNot a table row\n\`\`\``;
  const parsed = reportMarkdown(text) as any[];
  assert.deepEqual(
    parsed.map((b) => b.type),
    ['paragraph', 'code'],
  );
  assert.equal(parsed[1].text, `${two}\nNot a table row`);
});
