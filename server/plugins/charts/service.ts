import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../../store.js';
import type { SqlResult } from '../../../shared/plugins.js';
import type { ChartData, ChartRef } from '../../../shared/charts.js';
const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const definition = z
  .object({
    datasetId: z.string().uuid(),
    kind: z.enum(['bar', 'line', 'pie', 'scatter']),
    title: z.string().trim().min(1).max(120),
    x: z.string().min(1).max(128),
    y: z.array(z.string().min(1).max(128)).min(1).max(5),
    donut: z.boolean().default(false),
  })
  .strict();
const dataset = z.object({
  columns: z.array(z.string().max(128)).min(1).max(200),
  rows: z
    .array(z.array(z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.null()])))
    .max(5000),
  truncated: z.boolean(),
});
function numeric(value: unknown): number | null {
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
      'Choose numeric measure columns with finite, safely representable values. Aggregate or scale large values in SQL first.',
    );
  return number;
}
export class ChartsPlugin {
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS chart_datasets (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, databaseName TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS charts (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chart_dataset_conversation ON chart_datasets(conversationId);
      CREATE INDEX IF NOT EXISTS chart_conversation ON charts(conversationId);`);
  }
  enabled() {
    return this.store.meta('charts:enabled') === 'true';
  }
  projectEnabled(id: string) {
    return !!(
      this.store.db
        .prepare("SELECT enabled FROM project_plugins WHERE projectId=? AND plugin='charts'")
        .get(id) as any
    )?.enabled;
  }
  setProject(id: string, enabled: boolean) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO project_plugins VALUES (?,'charts',?)")
      .run(id, Number(enabled));
  }
  requireConversation(id: string) {
    const conversation = this.store.conversation(id);
    if (!conversation) throw fail('Conversation not found.', 404);
    if (!this.enabled() || !this.projectEnabled(conversation.projectId))
      throw fail('Charts is disabled for this project.', 403);
    return conversation;
  }
  /** Capture typed SQL results before their chat preview is shortened; never parse the escaped CSV. */
  capture(conversationId: string, id: string, database: string, result: SqlResult) {
    this.requireConversation(conversationId);
    const value = dataset.parse(result);
    if (!value.rows.length) return undefined;
    const data = JSON.stringify(value);
    if (Buffer.byteLength(data) > 1_100_000) throw fail('Chart dataset exceeds 1 MB.');
    const count = this.store.db
      .prepare('SELECT count(*) AS n FROM chart_datasets WHERE conversationId=?')
      .get(conversationId) as any;
    if (count.n >= 100) throw fail('This conversation has reached its 100-dataset limit.');
    this.store.db
      .prepare('INSERT INTO chart_datasets VALUES (?,?,?,?,?)')
      .run(id, conversationId, database, new Date().toISOString(), data);
    return id;
  }
  list(conversationId: string) {
    this.requireConversation(conversationId);
    let budget = 10000;
    return (
      this.store.db
        .prepare(
          'SELECT id,databaseName,at,data FROM chart_datasets WHERE conversationId=? ORDER BY at DESC,rowid DESC LIMIT 20',
        )
        .all(conversationId) as any[]
    )
      .map((row) => {
        const data = JSON.parse(row.data);
        return {
          datasetId: row.id,
          database: row.databaseName,
          at: row.at,
          columns: data.columns.slice(0, 40),
          columnsOmitted: Math.max(0, data.columns.length - 40),
          rows: data.rows.length,
          truncated: data.truncated,
        };
      })
      .filter((item) => {
        budget -= JSON.stringify(item).length;
        return budget >= 0;
      });
  }
  create(conversationId: string, args: unknown): ChartRef {
    this.requireConversation(conversationId);
    const spec = definition.parse(args);
    const source = this.store.db
      .prepare('SELECT * FROM chart_datasets WHERE id=? AND conversationId=?')
      .get(spec.datasetId, conversationId) as any;
    if (!source)
      throw fail(
        'SQL dataset not found in this conversation. Old results without a dataset ID cannot be charted; obtain a new read-only result if needed.',
        404,
      );
    const input = dataset.parse(JSON.parse(source.data));
    const columns = [spec.x, ...spec.y];
    if (new Set(spec.y).size !== spec.y.length) throw fail('Use distinct measure columns.');
    const indexes = columns.map((name) => {
      if (input.columns.filter((c) => c === name).length !== 1)
        throw fail('Column names must exist exactly once. Use SQL aliases for duplicate names.');
      return input.columns.indexOf(name);
    });
    if (spec.kind === 'pie' && spec.y.length !== 1)
      throw fail('Pie charts need exactly one measure.');
    if (spec.donut && spec.kind !== 'pie') throw fail('Donut is an option for pie charts only.');
    const limit = spec.kind === 'pie' ? 20 : Math.floor(1000 / spec.y.length);
    if (input.rows.length > limit)
      throw fail(
        `This chart supports up to ${limit} rows. Aggregate or filter in SQL; no rows were silently dropped.`,
      );
    let nulls = false;
    const rows = input.rows.map((row) =>
      indexes.map((index, i) => {
        const raw = row[index];
        if (raw === undefined) throw fail('Dataset row does not match its columns.');
        if (raw === null) {
          nulls = true;
          return null;
        }
        if (i > 0 || spec.kind === 'scatter') return numeric(raw);
        const label = String(raw);
        if (label.length > 200)
          throw fail('Category labels are too long. Select a shorter label in SQL.');
        return label;
      }),
    );
    if (!rows.some((row) => row[0] !== null && row.slice(1).some((v) => v !== null)))
      throw fail('No complete numeric points to plot.');
    if (spec.kind === 'pie') {
      if (rows.some((row) => row[0] === null || row[1] === null || Number(row[1]) < 0))
        throw fail('Pie values must be nonnegative and categories/values must not be NULL.');
      if (new Set(rows.map((row) => row[0])).size !== rows.length)
        throw fail('Group duplicate pie categories in SQL first.');
      const total = rows.reduce((sum, row) => sum + Number(row[1]), 0);
      if (!(total > 0) || !Number.isFinite(total))
        throw fail('Pie values must have a finite positive total.');
    }
    const count = this.store.db
      .prepare('SELECT count(*) AS n FROM charts WHERE conversationId=?')
      .get(conversationId) as any;
    if (count.n >= 100) throw fail('This conversation has reached its 100-chart limit.');
    const chart: ChartData = {
      id: randomUUID(),
      title: spec.title,
      kind: spec.kind,
      donut: spec.donut,
      x: spec.x,
      y: spec.y,
      rows,
      database: source.databaseName,
      sourceAt: source.at,
      createdAt: new Date().toISOString(),
      truncated: input.truncated,
      notices: [
        ...(input.truncated
          ? [
              'The SQL result reached its limit. This chart represents only returned rows, not the complete query result.',
            ]
          : []),
        ...(nulls ? ['NULL values are gaps or omitted points; they are not treated as zero.'] : []),
        ...(spec.kind === 'line'
          ? ['Categories follow SQL result order at equal spacing. Use ORDER BY in SQL.']
          : []),
      ],
    };
    this.store.db
      .prepare('INSERT INTO charts VALUES (?,?,?)')
      .run(chart.id, conversationId, JSON.stringify(chart));
    return { id: chart.id, title: chart.title, kind: chart.kind };
  }
  /** Disabling creation does not erase charts already in conversation history. */
  get(conversationId: string, id: string): ChartData {
    if (!this.store.conversation(conversationId)) throw fail('Conversation not found.', 404);
    const row = this.store.db
      .prepare('SELECT data FROM charts WHERE id=? AND conversationId=?')
      .get(id, conversationId) as any;
    if (!row) throw fail('Chart not found in this conversation.', 404);
    return JSON.parse(row.data);
  }
}
