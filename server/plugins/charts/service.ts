import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../../store.js';
import type { SqlResult } from '../../../shared/plugins.js';
import type { ChartData, ChartRef } from '../../../shared/charts.js';
import { dataset, numeric, fail, transformSchema, transformData } from './data.js';
import { ChartSources } from './sources.js';
import type { Knowledge } from '../../knowledge.js';
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
export class ChartsPlugin {
  readonly sources: ChartSources;
  constructor(
    readonly store: Store,
    knowledge: Knowledge,
  ) {
    this.sources = new ChartSources(store, knowledge);
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
    return this.save(conversationId, id, database, {
      ...result,
      source: { kind: 'sql', name: database },
    });
  }
  private save(conversationId: string, id: string, database: string, input: unknown) {
    this.requireConversation(conversationId);
    const value = dataset.parse(input);
    if (value.rows.some((row) => row.length !== value.columns.length))
      throw fail('Dataset row does not match its columns.');
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
          source: data.source || { kind: 'sql', name: row.databaseName },
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
  async listSources(conversationId: string, args: unknown) {
    this.requireConversation(conversationId);
    return this.sources.list(conversationId, args);
  }
  async importSource(conversationId: string, args: unknown) {
    this.requireConversation(conversationId);
    const data = await this.sources.read(conversationId, args);
    const id = this.save(conversationId, randomUUID(), '', data)!;
    return { datasetId: id, columns: data.columns, rows: data.rows.length, source: data.source };
  }
  transform(conversationId: string, args: unknown) {
    this.requireConversation(conversationId);
    const spec = transformSchema.parse(args);
    const source = this.source(conversationId, spec.datasetId);
    const data = transformData(dataset.parse(JSON.parse(source.data)), spec);
    const id = this.save(conversationId, randomUUID(), source.databaseName, data)!;
    return { datasetId: id, columns: data.columns, rows: data.rows.length, notices: data.notices };
  }
  private source(conversationId: string, id: string) {
    const source = this.store.db
      .prepare('SELECT * FROM chart_datasets WHERE id=? AND conversationId=?')
      .get(id, conversationId) as any;
    if (!source)
      throw fail(
        'Dataset not found in this conversation. Import a source or obtain a new read-only SQL result.',
        404,
      );
    return source;
  }
  create(conversationId: string, args: unknown): ChartRef {
    this.requireConversation(conversationId);
    const spec = definition.parse(args);
    const source = this.source(conversationId, spec.datasetId);
    const input = dataset.parse(JSON.parse(source.data));
    const columns = [spec.x, ...spec.y];
    if (new Set(spec.y).size !== spec.y.length) throw fail('Use distinct measure columns.');
    const indexes = columns.map((name) => {
      if (input.columns.filter((c) => c === name).length !== 1)
        throw fail('Column names must exist exactly once. Rename duplicate columns in the source.');
      return input.columns.indexOf(name);
    });
    if (spec.kind === 'pie' && spec.y.length !== 1)
      throw fail('Pie charts need exactly one measure.');
    if (spec.donut && spec.kind !== 'pie') throw fail('Donut is an option for pie charts only.');
    const limit = spec.kind === 'pie' ? 20 : Math.floor(1000 / spec.y.length);
    if (input.rows.length > limit)
      throw fail(
        `This chart supports up to ${limit} rows. Aggregate or filter with charts_transform; no rows were silently dropped.`,
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
          throw fail('Category labels are too long. Select a shorter label in the source.');
        return label;
      }),
    );
    if (!rows.some((row) => row[0] !== null && row.slice(1).some((v) => v !== null)))
      throw fail('No complete numeric points to plot.');
    if (spec.kind === 'pie') {
      if (rows.some((row) => row[0] === null || row[1] === null || Number(row[1]) < 0))
        throw fail('Pie values must be nonnegative and categories/values must not be NULL.');
      if (new Set(rows.map((row) => row[0])).size !== rows.length)
        throw fail('Group duplicate pie categories with charts_transform first.');
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
      source: input.source || { kind: 'sql', name: source.databaseName },
      database: source.databaseName,
      sourceAt: source.at,
      createdAt: new Date().toISOString(),
      truncated: input.truncated,
      notices: [
        ...(input.notices || []),
        ...(input.truncated
          ? [
              'The source result reached its limit. This chart represents only returned rows, not the complete result.',
            ]
          : []),
        ...(nulls ? ['NULL values are gaps or omitted points; they are not treated as zero.'] : []),
        ...(spec.kind === 'line'
          ? [
              'Categories follow source order at equal spacing; dates are not a continuous time scale.',
            ]
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
