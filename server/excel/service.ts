import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store.js';
import type { SqlResult } from '../../shared/plugins.js';
import { WorkbookBridge } from './bridge.js';
import {
  workbookPlanSchema,
  workbookReadSchema,
  workbookCheckSchema,
  checkPlanLimits,
  isWorkbookProposal,
  rangeBounds,
  type AnyExcelProposal,
  type WorkbookProposal,
} from '../../shared/excel-workbook.js';
import {
  MAX_IMPORT_CELLS,
  MAX_SELECTION_BYTES,
  DEFAULT_EXCEL_LIMITS,
  excelLimitsSchema,
  jsonBytes,
  selectionSection,
  type ExcelInspection,
  type ExcelModelContext,
  type ExcelProposalSummary,
  proposalSchema,
  scalar,
  type ExcelProposal,
  type ExcelSelection,
  type ExcelTurn,
  selectionSchema,
} from '../../shared/excel.js';

const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const summarize = (p: AnyExcelProposal): ExcelProposalSummary => ({
  id: p.id,
  runId: p.runId,
  summary: p.summary,
  status: p.status,
  result: p.result,
  sourceNotice: p.sourceNotice,
  target: isWorkbookProposal(p)
    ? p.plan.actions.map((a) => `${a.sheet}!${a.range}`).join('; ')
    : p.change.target === 'new_sheet'
      ? `New sheet: ${p.change.sheetName}`
      : `Replace ${p.baseline.address}`,
  rows: isWorkbookProposal(p)
    ? p.plan.actions.reduce((n, a) => n + rangeBounds(a.range).rows, 0)
    : p.change.values.length,
  columns: isWorkbookProposal(p)
    ? Math.max(...p.plan.actions.map((a) => rangeBounds(a.range).columns))
    : p.change.values[0]!.length,
  operations: isWorkbookProposal(p) ? p.plan.actions.length : undefined,
});
export class ExcelSessions {
  readonly bridge = new WorkbookBridge();
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS excel_sessions(conversationId TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE, clientHash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS excel_proposals(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, payload TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS excel_sources(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS excel_inspections(conversationId TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE, payload TEXT NOT NULL);`);
    if (
      !(store.db.prepare('PRAGMA table_info(excel_proposals)').all() as { name: string }[]).some(
        (c) => c.name === 'summary',
      )
    )
      store.db.exec('ALTER TABLE excel_proposals ADD COLUMN summary TEXT');
    store.db.exec(
      'CREATE INDEX IF NOT EXISTS excel_proposals_conversation ON excel_proposals(conversationId,at DESC)',
    );
    for (const row of store.db
      .prepare(
        "SELECT id,payload FROM excel_proposals WHERE summary IS NULL OR json_extract(summary,'$.status') IN ('pending','applying')",
      )
      .all() as {
      id: string;
      payload: string;
    }[]) {
      const p: AnyExcelProposal = JSON.parse(row.payload);
      if (p.status === 'pending' || p.status === 'applying') {
        p.status = p.status === 'applying' ? 'unknown' : 'rejected';
        p.result = 'Frame restarted. Inspect the workbook; this proposal will not be replayed.';
      }
      this.save(p);
    }
  }
  create(projectId: string) {
    if (!this.store.project(projectId)) throw fail('Project not found.', 404);
    const conversation = this.store.createConversation(projectId);
    const clientKey = randomBytes(32).toString('hex');
    this.store.db
      .prepare('INSERT INTO excel_sessions VALUES (?,?)')
      .run(conversation.id, digest(clientKey));
    this.store.db
      .prepare('UPDATE conversations SET title=? WHERE id=?')
      .run('Excel conversation', conversation.id);
    return { conversationId: conversation.id, clientKey };
  }
  has(id: string) {
    return !!this.store.db.prepare('SELECT 1 FROM excel_sessions WHERE conversationId=?').get(id);
  }
  limits() {
    return excelLimitsSchema.parse(
      JSON.parse(this.store.meta('excel:limits') || JSON.stringify(DEFAULT_EXCEL_LIMITS)),
    );
  }
  setLimits(input: unknown) {
    const limits = excelLimitsSchema.parse(input);
    this.store.setMeta('excel:limits', JSON.stringify(limits));
    return limits;
  }
  summaries(id: string): ExcelProposalSummary[] {
    const rows = this.store.db
      .prepare(
        'SELECT summary FROM excel_proposals WHERE conversationId=? ORDER BY at DESC,rowid DESC LIMIT 20',
      )
      .all(id) as { summary: string }[];
    return rows.map((r) => JSON.parse(r.summary));
  }
  inspection(id: string): ExcelInspection | undefined {
    const row = this.store.db
      .prepare('SELECT payload FROM excel_inspections WHERE conversationId=?')
      .get(id) as { payload: string } | undefined;
    return row && JSON.parse(row.payload);
  }
  private record(id: string, data: ExcelInspection) {
    this.store.db
      .prepare('INSERT OR REPLACE INTO excel_inspections VALUES (?,?)')
      .run(id, JSON.stringify(data));
  }
  context(id: string, runId: string, turn: ExcelTurn, maxBytes: number): ExcelModelContext {
    const s = turn.selection;
    let initial;
    try {
      initial = selectionSection(
        s,
        0,
        0,
        s.values.length,
        s.values[0]!.length,
        Math.max(0, maxBytes),
      );
    } catch {
      /* A large first cell can be read explicitly if context becomes available. */
    }
    this.record(id, {
      runId,
      address: s.address,
      rows: s.values.length,
      columns: s.values[0]!.length,
      ranges: initial ? [{ row: 0, column: 0, rows: initial.rows, columns: initial.columns }] : [],
    });
    return {
      captureId: runId,
      selection: {
        sheetId: s.sheetId,
        sheetName: s.sheetName,
        address: s.address,
        row: s.row,
        column: s.column,
        rows: s.values.length,
        columns: s.values[0]!.length,
      },
      initial,
      recent: turn.recent,
      limits: this.limits(),
    };
  }
  read(id: string, runId: string, s: ExcelSelection, input: unknown) {
    const b = z
      .object({
        row: z.number().int().min(0),
        column: z.number().int().min(0),
        rows: z.number().int().min(1).max(MAX_IMPORT_CELLS),
        columns: z.number().int().min(1).max(4096),
        maxBytes: z.number().int().min(0).max(64000),
      })
      .strict()
      .parse(input);
    const inspection = this.inspection(id);
    if (!inspection || inspection.runId !== runId) throw fail('Selection belongs to another run.');
    if (inspection.ranges.length >= 256)
      throw fail(
        'Section-read limit reached. Continue with a focused selection in the next message.',
      );
    const section = selectionSection(s, b.row, b.column, b.rows, b.columns, b.maxBytes);
    inspection.ranges.push({
      row: section.row,
      column: section.column,
      rows: section.rows,
      columns: section.columns,
    });
    this.record(id, inspection);
    return { captureId: runId, ...section };
  }
  authorize(id: string, key: unknown) {
    const row = this.store.db
      .prepare('SELECT clientHash FROM excel_sessions WHERE conversationId=?')
      .get(id) as { clientHash: string } | undefined;
    if (
      !row ||
      typeof key !== 'string' ||
      key.length !== 64 ||
      !timingSafeEqual(Buffer.from(row.clientHash), Buffer.from(digest(key)))
    )
      throw fail(
        'This Excel session belongs to a different task pane. Start a new session here.',
        403,
      );
  }
  list(id: string): AnyExcelProposal[] {
    return (
      this.store.db
        .prepare(
          'SELECT payload FROM excel_proposals WHERE conversationId=? ORDER BY at DESC,rowid DESC LIMIT 20',
        )
        .all(id) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  turn(id: string, selection: ExcelSelection): ExcelTurn {
    const limits = this.limits();
    if (
      selection.values.length * selection.values[0]!.length > limits.maxCells ||
      selection.values[0]!.length > limits.maxColumns
    )
      throw fail(
        `Selection exceeds configured limits (${limits.maxCells.toLocaleString()} cells / ${limits.maxColumns.toLocaleString()} columns).`,
        400,
      );
    if (this.summaries(id).some((p) => p.status === 'pending' || p.status === 'applying'))
      throw fail('Apply or reject the waiting proposal before sending another message.');
    return {
      selection,
      recent: this.summaries(id)
        .slice(0, 5)
        .map(({ summary, status, result }) => ({ summary, status, result })),
    };
  }
  capture(conversationId: string, operation: string, result: SqlResult) {
    if (!this.has(conversationId)) return;
    const limits = this.limits();
    if (
      (result.rows.length + 1) * result.columns.length > limits.maxCells ||
      result.columns.length > limits.maxColumns
    )
      return;
    const clean = (v: unknown) =>
      scalar.parse(v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? String(v) : v);
    const values = [result.columns.map(clean), ...result.rows.map((r) => r.map(clean))];
    if (
      !values[0]!.length ||
      values.some((r) => r.length !== values[0]!.length) ||
      values[0]!.length > limits.maxColumns ||
      values.length * values[0]!.length > MAX_IMPORT_CELLS ||
      jsonBytes(values) > 8 * 1024 * 1024
    )
      return;
    this.store.db
      .prepare('INSERT OR IGNORE INTO excel_sources VALUES (?,?,?)')
      .run(operation, conversationId, JSON.stringify({ values, truncated: result.truncated }));
  }
  propose(id: string, runId: string, selection: ExcelSelection, args: unknown) {
    if (!this.has(id)) throw fail('Workbook tools require an Excel session.', 403);
    if (this.summaries(id).some((p) => p.status === 'pending' || p.status === 'applying'))
      throw fail('One batch is already waiting for review. Stop and let the user review it.');
    const change = proposalSchema.parse(args);
    let values = change.values;
    let sourceNotice: string | undefined;
    if (change.sourceOperationId) {
      const source = this.store.db
        .prepare('SELECT payload FROM excel_sources WHERE id=? AND conversationId=?')
        .get(change.sourceOperationId, id) as { payload: string } | undefined;
      if (!source)
        throw fail(
          'Saved SQL result unavailable or exceeds the configured cell/column limits or 8 MiB import ceiling. Query a smaller result; never reconstruct rows from a preview.',
        );
      const parsed = JSON.parse(source.payload);
      values = parsed.values;
      sourceNotice = `SQL operation ${change.sourceOperationId}. ${parsed.truncated ? 'Row limit reached: this is a partial query result.' : 'All rows returned by this query.'}`;
    }
    if (!values) throw fail('No proposed values.');
    const limits = this.limits();
    if (
      values.length * values[0]!.length > limits.maxCells ||
      values[0]!.length > limits.maxColumns
    )
      throw fail('Proposal exceeds configured Excel cell/column limits.');
    if (
      change.target === 'selection' &&
      (values.length !== selection.values.length ||
        values[0]!.length !== selection.values[0]!.length)
    )
      throw fail(
        'Replacement must match the captured selection dimensions. Use a new worksheet for a different shape.',
      );
    if (
      (change.table || change.chart) &&
      (values.length < 2 ||
        values[0]!.some((v) => typeof v !== 'string' || !v.trim()) ||
        new Set(values[0]!.map((v) => String(v).toLowerCase())).size !== values[0]!.length)
    )
      throw fail('Tables/charts require unique nonempty text headers and at least one data row.');
    if (change.chart && values[0]!.length < 2)
      throw fail('Charts require a category column and at least one data column.');
    const proposal: ExcelProposal = {
      id: randomUUID(),
      runId,
      summary: change.summary,
      status: 'pending',
      change: { ...change, values },
      baseline: selection,
      sourceNotice,
    };
    this.store.db
      .prepare(
        'INSERT INTO excel_proposals(id,conversationId,payload,at,summary) VALUES (?,?,?,?,?)',
      )
      .run(
        proposal.id,
        id,
        JSON.stringify(proposal),
        Date.now(),
        JSON.stringify(summarize(proposal)),
      );
    return {
      id: proposal.id,
      status: 'pending',
      message:
        'Preview ready in Excel. Nothing has been changed. End your response and wait for the user to Apply or Reject; do not call this tool again this turn.',
    };
  }
  async readWorkbook(id: string, runId: string, input: unknown, signal: AbortSignal) {
    const b = z
      .object({ query: workbookReadSchema, maxBytes: z.number().int().min(512).max(64000) })
      .strict()
      .parse(input);
    const response = await this.bridge.request(
      id,
      { runId, limits: this.limits(), task: { kind: 'read', ...b } },
      signal,
    );
    if (b.query.kind === 'read_range') {
      const s = selectionSchema.parse(response);
      const section = selectionSection(s, 0, 0, s.values.length, s.values[0]!.length, b.maxBytes);
      return {
        sheetId: s.sheetId,
        sheetName: s.sheetName,
        address: s.address,
        origin: { row: s.row, column: s.column },
        ...section,
      };
    }
    if (jsonBytes(response) > b.maxBytes)
      throw new Error(
        'Worksheet metadata exceeds remaining context. Request a more focused range or fewer sheets.',
      );
    return response;
  }
  async proposeWorkbook(id: string, runId: string, args: unknown, signal: AbortSignal) {
    if (!this.has(id)) throw fail('Workbook tools require an Excel session.', 403);
    if (this.summaries(id).some((p) => p.status === 'pending' || p.status === 'applying'))
      throw fail('One batch is already waiting for review.');
    let plan = workbookPlanSchema.parse(args);
    const notices: string[] = [];
    for (const a of plan.actions)
      if (a.kind === 'write' && a.sourceOperationId) {
        const row = this.store.db
          .prepare('SELECT payload FROM excel_sources WHERE id=? AND conversationId=?')
          .get(a.sourceOperationId, id) as { payload: string } | undefined;
        if (!row) throw fail('Saved SQL result unavailable in this conversation.');
        const source = JSON.parse(row.payload);
        notices.push(
          `SQL operation ${a.sourceOperationId}: ${source.truncated ? 'partial result (query row limit reached)' : 'all returned rows'}.`,
        );
        a.values = source.values;
        delete a.sourceOperationId;
      }
    plan = workbookPlanSchema.parse(plan);
    checkPlanLimits(plan, this.limits());
    const response = await this.bridge.request(
      id,
      { runId, limits: this.limits(), task: { kind: 'inspect', plan } },
      signal,
    );
    const checks = z.array(workbookCheckSchema).length(plan.actions.length).parse(response);
    if (signal.aborted) throw fail('Task stopped.');
    if (this.summaries(id).some((p) => p.status === 'pending' || p.status === 'applying'))
      throw fail('One batch is already waiting for review.');
    if (jsonBytes(checks) > MAX_SELECTION_BYTES)
      throw fail('Preview data exceeds the transfer ceiling. Split the batch.');
    const p: WorkbookProposal = {
      kind: 'workbook',
      id: randomUUID(),
      runId,
      summary: plan.summary,
      status: 'pending',
      plan,
      checks,
      sourceNotice: notices.join('\n') || undefined,
    };
    this.store.db
      .prepare(
        'INSERT INTO excel_proposals(id,conversationId,payload,at,summary) VALUES (?,?,?,?,?)',
      )
      .run(p.id, id, JSON.stringify(p), Date.now(), JSON.stringify(summarize(p)));
    return {
      id: p.id,
      status: 'pending',
      message:
        'Preview ready. End this response and wait for Apply or Reject. No cells have changed.',
    };
  }
  get(id: string, proposalId: string): AnyExcelProposal {
    const row = this.store.db
      .prepare('SELECT payload FROM excel_proposals WHERE conversationId=? AND id=?')
      .get(id, proposalId) as { payload: string } | undefined;
    if (!row) throw fail('Proposal not found in this Excel session.', 404);
    return JSON.parse(row.payload);
  }
  private save(p: AnyExcelProposal) {
    this.store.db
      .prepare('UPDATE excel_proposals SET payload=?,summary=? WHERE id=?')
      .run(JSON.stringify(p), JSON.stringify(summarize(p)), p.id);
  }
  transition(id: string, proposalId: string, input: unknown) {
    const { action, result } = z
      .object({
        action: z.enum(['claim', 'reject', 'applied', 'failed', 'unknown']),
        result: z.string().max(1000).optional(),
      })
      .strict()
      .parse(input);
    const p = this.get(id, proposalId);
    if (action === 'claim' || action === 'reject') {
      if (p.status !== 'pending') throw fail('Proposal already handled. Never apply it again.');
      p.status = action === 'claim' ? 'applying' : 'rejected';
    } else {
      if (p.status === action && p.result === result) return p;
      if (p.status !== 'applying')
        throw fail('This proposal is not awaiting an execution receipt.');
      p.status = action;
    }
    p.result = result;
    this.save(p);
    return p;
  }
  cancel(id: string) {
    for (const summary of this.summaries(id)) {
      if (summary.status !== 'pending') continue;
      const p = this.get(id, summary.id);
      if (p.status === 'pending') {
        p.status = 'rejected';
        p.result = 'Task stopped.';
        this.save(p);
      }
    }
  }
}
