import { z } from 'zod';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const dataset = z.object({
  columns: z.array(z.string().min(1).max(128)).min(1).max(200),
  rows: z
    .array(z.array(z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.null()])))
    .max(5000),
  truncated: z.boolean(),
  notices: z.array(z.string()).optional(),
  source: z
    .object({
      kind: z.enum(['sql', 'document', 'message', 'file']),
      name: z.string(),
      id: z.string().optional(),
      table: z.number().optional(),
    })
    .optional(),
});
export type Dataset = z.infer<typeof dataset>;
export type Cell = Dataset['rows'][number][number];
export function numeric(value: unknown): number | null {
  if (value === null) return null;
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
        ? Number(value)
        : NaN;
  if (
    !Number.isFinite(number) ||
    Math.abs(number) > 1e100 ||
    (Number.isInteger(number) && !Number.isSafeInteger(number))
  )
    throw fail(
      'Choose numeric measure columns with finite, safely representable values. Currency symbols and thousands separators must be normalized in the source first.',
    );
  return number;
}
function tabular(rows: Cell[][]): Dataset {
  const columns = rows.shift()?.map((v) => String(v ?? '').trim()) || [];
  if (!columns.length || columns.some((v) => !v) || new Set(columns).size !== columns.length)
    throw fail('Tables need a header row with nonempty, unique column names.');
  if (!rows.length) throw fail('This table has no data rows.');
  if (rows.some((r) => r.length !== columns.length))
    throw fail('Every row must match the header column count.');
  return dataset.parse({ columns, rows, truncated: false });
}
/** UTF-8 comma-separated values, including quoted newlines and escaped quotes. */
export function parseCsv(input: string): Dataset {
  const text = input.replace(/^\uFEFF/, '');
  const rows: Cell[][] = [];
  let row: Cell[] = [],
    field = '',
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(field === '' ? null : field);
    field = '';
    closed = false;
    if (row.length > 200) throw fail('CSV exceeds 200 columns.');
  };
  const record = () => {
    cell();
    rows.push(row);
    row = [];
    if (rows.length > 5001)
      throw fail('CSV exceeds 5,000 data rows. Split or summarize the source first.');
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ',') cell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record();
    } else if (c === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || c === '"') throw fail('Malformed CSV quoting.');
      field += c;
    }
    if (field.length > 20000) throw fail('CSV cell exceeds 20,000 characters.');
  }
  if (quoted) throw fail('CSV has an unclosed quoted field.');
  if (field || closed || row.length) record();
  return tabular(rows);
}
const parser = unified().use(remarkParse).use(remarkGfm);
type Node = { type: string; value?: string; alt?: string; children?: Node[] };
const cellText = (node: Node): string =>
  node.value ??
  node.alt ??
  (node.type === 'break' ? '\n' : (node.children || []).map(cellText).join(''));
export function markdownTables(text: string): Cell[][][] {
  const tables: Cell[][][] = [];
  const visit = (node: Node) => {
    if (node.type === 'table') {
      tables.push(
        (node.children || []).map((row) =>
          (row.children || []).map((cell) => cellText(cell).trim() || null),
        ),
      );
      return;
    }
    for (const child of node.children || []) visit(child);
  };
  visit(parser.parse(text) as Node);
  return tables;
}
export function parseMarkdown(text: string, table = 1): Dataset {
  const tables = markdownTables(text);
  const rows = tables[table - 1];
  if (!rows)
    throw fail(`Markdown table ${table} not found. This source has ${tables.length} tables.`);
  return tabular(rows);
}
const filterSchema = z
  .object({
    column: z.string(),
    op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_null', 'not_null']),
    value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(),
  })
  .strict();
export const transformSchema = z
  .object({
    datasetId: z.string().uuid(),
    filters: z.array(filterSchema).max(10).default([]),
    groupBy: z.array(z.string()).max(3).default([]),
    measures: z
      .array(
        z
          .object({
            column: z.string().optional(),
            operation: z.enum(['sum', 'avg', 'min', 'max', 'count']),
            as: z.string().trim().min(1).max(128),
          })
          .strict(),
      )
      .max(5)
      .default([]),
    sort: z
      .array(
        z
          .object({
            column: z.string(),
            direction: z.enum(['asc', 'desc']),
            numeric: z.boolean().default(false),
          })
          .strict(),
      )
      .max(3)
      .default([]),
  })
  .strict();
export function transformData(input: Dataset, spec: z.infer<typeof transformSchema>): Dataset {
  const index = (name: string, columns = input.columns) => {
    if (columns.filter((c) => c === name).length !== 1)
      throw fail('Column names must exist exactly once.');
    return columns.indexOf(name);
  };
  const predicates = spec.filters.map((filter) => {
    const i = index(filter.column),
      v = filter.value;
    if (!['is_null', 'not_null'].includes(filter.op) && v === undefined)
      throw fail('This filter requires a value.');
    if (filter.op === 'contains' && typeof v !== 'string')
      throw fail('Contains requires a text value.');
    return (row: Cell[]) => {
      const a = row[i];
      if (filter.op === 'is_null') return a === null;
      if (filter.op === 'not_null') return a !== null;
      if (filter.op === 'contains') return typeof a === 'string' && a.includes(v as string);
      if (filter.op === 'eq' || filter.op === 'ne') {
        // A numeric comparison never turns missing data into zero.
        const same = typeof v === 'number' && a !== null ? numeric(a) === v : a === v;
        return filter.op === 'eq' ? same : !same;
      }
      if (a === null || v === null) return false;
      const left = numeric(a)!,
        right = numeric(v)!;
      return filter.op === 'gt'
        ? left > right
        : filter.op === 'gte'
          ? left >= right
          : filter.op === 'lt'
            ? left < right
            : left <= right;
    };
  });
  let rows = input.rows.filter((row) => predicates.every((p) => p(row))).map((r) => [...r]);
  let columns = [...input.columns];
  if (spec.groupBy.length && !spec.measures.length)
    throw fail('Grouping requires at least one measure.');
  if (spec.measures.length) {
    const groups = spec.groupBy.map((c) => index(c));
    const measures = spec.measures.map((m) => {
      if (!m.column && m.operation !== 'count') throw fail('Numeric measures require a column.');
      return { ...m, index: m.column ? index(m.column) : undefined };
    });
    columns = [...spec.groupBy, ...measures.map((m) => m.as)];
    if (new Set(columns).size !== columns.length)
      throw fail('Group and measure names must be distinct.');
    const buckets = new Map<string, { key: Cell[]; rows: Cell[][] }>();
    for (const row of rows) {
      const key = groups.map((i) => row[i]);
      const id = JSON.stringify(key);
      if (!buckets.has(id)) buckets.set(id, { key, rows: [] });
      buckets.get(id)!.rows.push(row);
    }
    rows = [...buckets.values()].map((bucket) => [
      ...bucket.key,
      ...measures.map((m) => {
        if (m.operation === 'count')
          return bucket.rows.filter((r) => m.index === undefined || r[m.index] !== null).length;
        const values = bucket.rows
          .map((r) => numeric(r[m.index!]))
          .filter((v): v is number => v !== null);
        if (!values.length) return null;
        const value =
          m.operation === 'min'
            ? Math.min(...values)
            : m.operation === 'max'
              ? Math.max(...values)
              : values.reduce((a, b) => numeric(a + b)!, 0) /
                (m.operation === 'avg' ? values.length : 1);
        return numeric(value);
      }),
    ]);
    if (!groups.length) {
      columns.unshift('Group');
      rows = rows.map((r) => ['All rows', ...r]);
    }
  }
  const order = spec.sort.map((s) => ({ ...s, index: index(s.column, columns) }));
  // Validate all numeric keys, even when a comparator would never visit a one-row result.
  for (const s of order) if (s.numeric) for (const row of rows) numeric(row[s.index]);
  rows.sort((a, b) => {
    for (const s of order) {
      const left = s.numeric ? numeric(a[s.index]) : a[s.index],
        right = s.numeric ? numeric(b[s.index]) : b[s.index];
      if (left === right) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      const cmp = s.numeric
        ? Number(left) - Number(right)
        : String(left) === String(right)
          ? 0
          : String(left) < String(right)
            ? -1
            : 1;
      if (cmp) return s.direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
  if (!rows.length) throw fail('No rows match these filters.');
  if (new Set(columns).size !== columns.length) throw fail('Result column names must be distinct.');
  return dataset.parse({
    ...input,
    columns,
    rows,
    notices: [
      ...(input.notices || []),
      `Locally calculated from ${input.rows.length} source rows: ${spec.filters.length} filter(s), ${spec.measures.length} measure(s), ${spec.sort.length} sort column(s).`,
    ],
  });
}
