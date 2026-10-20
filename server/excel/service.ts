import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store.js';
import type { SqlResult } from '../../shared/plugins.js';
import {
  MAX_IMPORT_CELLS,
  proposalSchema,
  scalar,
  type ExcelProposal,
  type ExcelSelection,
  type ExcelTurn,
} from '../../shared/excel.js';

const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class ExcelSessions {
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS excel_sessions(conversationId TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE, clientHash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS excel_proposals(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, payload TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS excel_sources(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, payload TEXT NOT NULL);`);
    for (const row of store.db.prepare('SELECT id,payload FROM excel_proposals').all() as {
      id: string;
      payload: string;
    }[]) {
      const p: ExcelProposal = JSON.parse(row.payload);
      if (p.status === 'pending' || p.status === 'applying') {
        p.status = p.status === 'applying' ? 'unknown' : 'rejected';
        p.result = 'Frame restarted. Inspect the workbook; this proposal will not be replayed.';
        this.save(p);
      }
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
  list(id: string): ExcelProposal[] {
    return (
      this.store.db
        .prepare(
          'SELECT payload FROM excel_proposals WHERE conversationId=? ORDER BY at DESC,rowid DESC LIMIT 20',
        )
        .all(id) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  turn(id: string, selection: ExcelSelection): ExcelTurn {
    if (this.list(id).some((p) => p.status === 'pending' || p.status === 'applying'))
      throw fail('Apply or reject the waiting proposal before sending another message.');
    return {
      selection,
      recent: this.list(id)
        .slice(0, 5)
        .map(({ summary, status, result }) => ({ summary, status, result })),
    };
  }
  capture(conversationId: string, operation: string, result: SqlResult) {
    if (!this.has(conversationId)) return;
    const clean = (v: unknown) =>
      scalar.parse(v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? String(v) : v);
    const values = [result.columns.map(clean), ...result.rows.map((r) => r.map(clean))];
    if (
      !values[0]!.length ||
      values.some((r) => r.length !== values[0]!.length) ||
      values[0]!.length > 100 ||
      values.length * values[0]!.length > MAX_IMPORT_CELLS ||
      JSON.stringify(values).length > 200000
    )
      return;
    this.store.db
      .prepare('INSERT OR IGNORE INTO excel_sources VALUES (?,?,?)')
      .run(operation, conversationId, JSON.stringify({ values, truncated: result.truncated }));
  }
  propose(id: string, runId: string, selection: ExcelSelection, args: unknown) {
    if (!this.has(id)) throw fail('Workbook tools require an Excel session.', 403);
    if (this.list(id).some((p) => p.status === 'pending' || p.status === 'applying'))
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
          'Saved SQL result unavailable or exceeds the 10,000-cell/200 KB pilot limit. Query a smaller result; never reconstruct rows from a preview.',
        );
      const parsed = JSON.parse(source.payload);
      values = parsed.values;
      sourceNotice = `SQL operation ${change.sourceOperationId}. ${parsed.truncated ? 'Row limit reached: this is a partial query result.' : 'All rows returned by this query.'}`;
    }
    if (!values) throw fail('No proposed values.');
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
      .prepare('INSERT INTO excel_proposals VALUES (?,?,?,?)')
      .run(proposal.id, id, JSON.stringify(proposal), Date.now());
    return {
      id: proposal.id,
      status: 'pending',
      message:
        'Preview ready in Excel. Nothing has been changed. End your response and wait for the user to Apply or Reject; do not call this tool again this turn.',
    };
  }
  get(id: string, proposalId: string): ExcelProposal {
    const row = this.store.db
      .prepare('SELECT payload FROM excel_proposals WHERE conversationId=? AND id=?')
      .get(id, proposalId) as { payload: string } | undefined;
    if (!row) throw fail('Proposal not found in this Excel session.', 404);
    return JSON.parse(row.payload);
  }
  private save(p: ExcelProposal) {
    this.store.db
      .prepare('UPDATE excel_proposals SET payload=? WHERE id=?')
      .run(JSON.stringify(p), p.id);
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
    for (const p of this.list(id)) {
      if (p.status === 'pending') {
        p.status = 'rejected';
        p.result = 'Task stopped.';
        this.save(p);
      }
    }
  }
}
