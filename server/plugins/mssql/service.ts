import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Store } from '../../store.js';
import type {
  MssqlSettings,
  PublicMssqlSettings,
  SqlApproval,
  SqlResult,
} from '../../../shared/plugins.js';
import { classify, commandSchema, commandText, fail, settingsSchema } from './policy.js';
import { SchemaCache } from './schema.js';
import { SchemaNotes, factHashOf } from './notes.js';
import { LocalGenerator, type Generator } from './generate.js';
import { TediousDriver, type SqlDriver } from './driver.js';
export const defaults: MssqlSettings = {
  enabled: false,
  server: '',
  port: 1433,
  databases: [],
  read: { username: '', password: '' },
  write: { username: '', password: '' },
  allowDataChanges: false,
  allowSchemaChanges: false,
  allowProcedures: false,
  allowValueSampling: false,
  procedures: [],
  trustServerCertificate: false,
  timeoutSeconds: 30,
  maxRows: 500,
};
type Pending = {
  conversation: string;
  approval: SqlApproval;
  resolve: (approved: boolean) => void;
};
export class MssqlPlugin extends EventEmitter {
  readonly schema: SchemaCache;
  readonly notes: SchemaNotes;
  readonly pending = new Map<string, Pending>();
  readonly controllers = new Map<string, AbortController>();
  readonly inFlight = new Set<Promise<unknown>>();
  captureChartData?: (
    conversation: string,
    operation: string,
    database: string,
    result: SqlResult,
  ) => string | undefined;
  constructor(
    readonly store: Store,
    readonly driver: SqlDriver = new TediousDriver(),
    generator: Generator = new LocalGenerator(() => store.settings()),
  ) {
    super();
    this.schema = new SchemaCache(store, driver);
    this.notes = new SchemaNotes(
      store,
      this.schema,
      generator,
      () => store.settings(),
      () => this.driver,
    );
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS project_plugins (projectId TEXT, plugin TEXT, enabled INTEGER NOT NULL, PRIMARY KEY(projectId,plugin));
      CREATE TABLE IF NOT EXISTS mssql_operations (id TEXT PRIMARY KEY, conversationId TEXT, runId TEXT, databaseName TEXT, kind TEXT, sql TEXT, parameters TEXT, status TEXT, at TEXT);`);
    if (
      !(store.db.prepare('PRAGMA table_info(mssql_operations)').all() as any[]).some(
        (c) => c.name === 'source',
      )
    )
      store.db.exec('ALTER TABLE mssql_operations ADD COLUMN source TEXT');
    store.db.exec(
      "UPDATE mssql_operations SET status='unknown' WHERE status='executing'; UPDATE mssql_operations SET status='expired' WHERE status='awaiting_approval';",
    );
  }
  /** Automatic exports belong to their query result, not the conversation deliverables list.
   * Match persisted operation IDs so this also covers old exports without hiding ordinary CSVs.
   */
  isAutomaticExport(conversation: string, name: string) {
    if (!name.startsWith('sql-') || !name.endsWith('.csv')) return false;
    return !!this.store.db
      .prepare('SELECT id FROM mssql_operations WHERE id=? AND conversationId=?')
      .get(name.slice(4, -4), conversation);
  }
  settings(): MssqlSettings {
    const file = path.join(this.store.root, 'mssql.json');
    return {
      ...structuredClone(defaults),
      ...(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}),
    };
  }
  publicSettings(): PublicMssqlSettings {
    const s = this.settings();
    return {
      ...s,
      read: { username: s.read.username, hasPassword: !!s.read.password },
      write: { username: s.write.username, hasPassword: !!s.write.password },
    };
  }
  save(input: unknown) {
    const v = settingsSchema.parse(input),
      prior = this.settings();
    const s: MssqlSettings = {
      ...v,
      read: { ...v.read, password: v.read.password ?? prior.read.password },
      write: { ...v.write, password: v.write.password ?? prior.write.password },
    };
    if (s.enabled && (!s.server || !s.databases.length || !s.read.username || !s.read.password))
      throw fail('Configure server, databases, and the read-only SQL login before enabling MSSQL.');
    if (
      (s.allowDataChanges || s.allowSchemaChanges || s.allowProcedures) &&
      (!s.write.username || !s.write.password)
    )
      throw fail('Configure the write SQL login before enabling changes.');
    if (s.write.username && s.read.username.toLowerCase() === s.write.username.toLowerCase())
      throw fail('Use different SQL logins for reads and writes.');
    if (new Set(s.databases.map((d) => d.toLowerCase())).size !== s.databases.length)
      throw fail('Duplicate database names.');
    if (s.procedures.some((p) => !s.databases.includes(p.database)))
      throw fail('Every procedure must belong to an allowed database.');
    const file = path.join(this.store.root, 'mssql.json');
    writeFileSync(file + '.tmp', JSON.stringify(s, null, 2), { mode: 0o600 });
    renameSync(file + '.tmp', file);
    if (this.schema.source(prior) !== this.schema.source(s)) {
      this.schema.invalidate();
      this.notes.reset();
    }
    return this.publicSettings();
  }
  projectEnabled(id: string) {
    return !!(
      this.store.db
        .prepare("SELECT enabled FROM project_plugins WHERE projectId=? AND plugin='mssql'")
        .get(id) as any
    )?.enabled;
  }
  setProject(id: string, enabled: boolean) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO project_plugins VALUES (?,'mssql',?)")
      .run(id, Number(enabled));
  }
  requireProject(id: string) {
    const s = this.settings();
    if (!this.store.project(id) || !s.enabled || !this.projectEnabled(id))
      throw fail('MSSQL is disabled for this project.', 403);
    return s;
  }
  approval(conversation: string) {
    return [...this.pending.values()].find((p) => p.conversation === conversation)?.approval;
  }
  decide(conversation: string, id: string, runId: string, approve: boolean) {
    const p = this.pending.get(id);
    if (
      !p ||
      p.conversation !== conversation ||
      p.approval.runId !== runId ||
      Date.now() >= p.approval.expiresAt
    )
      throw fail('This SQL approval expired or was already handled.', 409);
    this.pending.delete(id);
    p.resolve(approve);
    this.emit('change', conversation);
    return { ok: true };
  }
  cancelRun(runId: string) {
    this.controllers.get(runId)?.abort();
    for (const [id, p] of this.pending)
      if (p.approval.runId === runId) {
        this.pending.delete(id);
        p.resolve(false);
        this.emit('change', p.conversation);
      }
  }
  async invoke(conversation: string, runId: string, action: string, args: unknown) {
    const projectId = this.store.conversation(conversation)!.projectId;
    const settings = this.requireProject(projectId);
    if (action === 'schema_search' || action === 'schema_read' || action === 'notes_search')
      this.schema.ensureSource(projectId, settings);
    if (action === 'schema_search') {
      const v = z
        .object({
          query: z.string().max(200).default(''),
          offset: z.number().int().min(0).max(50000).default(0),
        })
        .parse(args);
      const found = this.schema.search(projectId, settings.databases, v.query, v.offset);
      // A search that found nothing names vocabulary the notes are missing; enrichment reads these.
      if (!v.offset) this.notes.recordGap(projectId, v.query, found.total);
      return found;
    }
    if (action === 'schema_read') {
      const v = z
        .object({
          id: z.string().regex(/^[a-f0-9]{64}$/),
          offset: z.number().int().min(0).max(240000).default(0),
        })
        .parse(args);
      const doc = this.schema.read(projectId, settings.databases, v.id);
      const page = doc.text + this.notesSection(projectId, doc);
      return {
        ...doc,
        text: page.slice(v.offset, v.offset + 8000),
        nextOffset: v.offset + 8000 < page.length ? v.offset + 8000 : null,
        status: this.schema.status(projectId),
      };
    }
    if (action === 'notes_search') {
      const v = z
        .object({
          query: z.string().max(200).default(''),
          kind: z.enum(['domain', 'glossary', 'recipe', 'codes', 'any']).default('any'),
        })
        .parse(args);
      return this.notes.search(projectId, v.query, v.kind);
    }
    if (action !== 'query') throw fail('Unknown MSSQL action.');
    if (this.controllers.has(runId)) throw fail('Wait for the current SQL request.', 409);
    const command = commandSchema.parse(args),
      kind = classify(command, settings),
      operation = randomUUID();
    const signature = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    const sql = commandText(command);
    this.store.db
      .prepare(
        'INSERT INTO mssql_operations (id,conversationId,runId,databaseName,kind,sql,parameters,status,at,source) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        operation,
        conversation,
        runId,
        command.database,
        kind,
        sql,
        JSON.stringify(command.parameters),
        kind === 'read' ? 'ready' : 'awaiting_approval',
        new Date().toISOString(),
        this.schema.source(settings),
      );
    let executing = false;
    try {
      if (kind !== 'read') {
        const approval: SqlApproval = {
          id: operation,
          runId,
          database: command.database,
          sql,
          parameters: command.parameters,
          kind,
          expiresAt: Date.now() + 300000,
        };
        const allowed = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            this.pending.delete(operation);
            resolve(false);
            this.emit('change', conversation);
          }, 300000);
          this.pending.set(operation, {
            conversation,
            approval,
            resolve: (v) => {
              clearTimeout(timer);
              resolve(v);
            },
          });
          this.emit('change', conversation);
        });
        if (!allowed)
          throw fail('SQL change denied, cancelled, or approval expired. Nothing was submitted.');
      }
      controller.signal.throwIfAborted();
      const current = this.requireProject(projectId);
      if (signature !== createHash('sha256').update(JSON.stringify(current)).digest('hex'))
        throw fail('SQL settings changed. Request a new approval.');
      classify(command, current);
      this.store.db
        .prepare("UPDATE mssql_operations SET status='executing' WHERE id=?")
        .run(operation);
      executing = true;
      if (kind === 'schema' || kind === 'procedure') this.schema.invalidate();
      const promise = this.driver.execute(
        current,
        kind === 'read' ? 'read' : 'write',
        command,
        controller.signal,
      );
      this.inFlight.add(promise);
      let result: SqlResult;
      try {
        result = await promise;
      } finally {
        this.inFlight.delete(promise);
      }
      this.store.db
        .prepare("UPDATE mssql_operations SET status='completed' WHERE id=?")
        .run(operation);
      let datasetId: string | undefined;
      let chartNotice: string | undefined;
      try {
        datasetId = this.captureChartData?.(conversation, operation, command.database, result);
      } catch {
        chartNotice =
          'SQL completed, but its chart dataset could not be saved (size or storage limit). Do not repeat a change to recreate chart data.';
      }
      const csvName = `sql-${operation}.csv`;
      const directory = this.store.artifacts(this.store.conversation(conversation)!);
      const cell = (value: unknown) => {
        let s = value == null ? '' : String(value);
        if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
      };
      let csv: string | undefined;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(
          path.join(directory, csvName),
          [result.columns, ...result.rows].map((row) => row.map(cell).join(',')).join('\r\n'),
          { mode: 0o600, flag: 'wx' },
        );
        csv = csvName;
      } catch {
        /* Execution succeeded: never turn export failure into a reason to repeat SQL. */
      }
      let budget = 8000;
      let previewLimited = result.rows.length > 20 || result.columns.length > 50;
      const columns = result.columns.slice(0, 50).map((c) => c.slice(0, 128));
      const rows: unknown[][] = [];
      for (const row of result.rows.slice(0, 20)) {
        const preview = row.slice(0, 50).map((v) => {
          if (typeof v === 'string' && v.length > 500) {
            previewLimited = true;
            return v.slice(0, 500) + '…';
          }
          return v;
        });
        const size = JSON.stringify(preview).length;
        if (size > budget) {
          previewLimited = true;
          break;
        }
        budget -= size;
        rows.push(preview);
      }
      return {
        ...result,
        columns,
        rows,
        datasetId,
        chartNotice,
        returnedRows: result.rows.length,
        previewLimited,
        csv,
        artifactNotice: csv
          ? undefined
          : 'SQL completed, but CSV could not be saved. Do not repeat a change to recreate its export.',
        database: command.database,
        operationId: operation,
      };
    } catch (error) {
      this.store.db
        .prepare("UPDATE mssql_operations SET status=? WHERE id=? AND status<>'completed'")
        .run(executing && kind !== 'read' ? 'unknown' : 'failed', operation);
      throw error;
    } finally {
      this.controllers.delete(runId);
      this.pending.delete(operation);
      this.emit('change', conversation);
    }
  }
  knowledgeMap(projectId: string) {
    try {
      this.schema.ensureSource(projectId, this.requireProject(projectId));
      return this.notes.map(projectId);
    } catch {
      return '';
    }
  }
  /** Model-written notes render below the catalog facts on every page that has one. */
  notesSection(
    projectId: string,
    doc: { database: string; schema: string; name: string; text: string },
  ) {
    return this.notes.section(projectId, doc.database, doc.schema, doc.name, factHashOf(doc.text));
  }
  /** The OKF export carries the catalog pages, their notes, and the generated knowledge pages. */
  exportPages(projectId: string, databases: string[]) {
    const pages: Record<string, string> = {};
    for (const [file, body] of Object.entries(this.schema.pages(projectId, databases))) {
      const id = file.replace(/^mssql\/|\.md$/g, '');
      // Hash the stored page, not the export body: the obsolete marker is not a catalog change.
      const doc = this.store.db
        .prepare(
          'SELECT databaseName AS database,schemaName AS schema,name,text FROM mssql_schema WHERE projectId=? AND generation=? AND id=?',
        )
        .get(projectId, this.schema.generation(projectId), id) as any;
      pages[file] = doc ? body + this.notesSection(projectId, doc) : body;
    }
    for (const page of this.notes.pages(projectId))
      pages[`mssql-knowledge/${page.kind}-${page.id.slice(0, 16)}.md`] =
        `---\n${JSON.stringify({ type: 'Database Knowledge', title: page.title, kind: page.kind, generated: { by: `model:${page.modelId}`, at: page.at }, review: page.state })}\n---\n\n# ${page.title}\n\nModel-written interpretation of catalog metadata, not a catalog fact.\n\n${page.body}\n`;
    return pages;
  }
  async test(database: string, login: 'read' | 'write') {
    const s = this.settings();
    if (!s.databases.includes(database) || !s[login].username || !s[login].password)
      throw fail('Configure this database and login first.');
    return this.driver.execute(
      s,
      login,
      {
        database,
        sql: "SELECT DB_NAME() AS databaseName, USER_NAME() AS databaseUser, IS_SRVROLEMEMBER('sysadmin') AS sysadmin, IS_MEMBER('db_owner') AS dbOwner, IS_MEMBER('db_datawriter') AS dataWriter",
      },
      AbortSignal.timeout(15000),
    );
  }
  async close() {
    for (const run of this.controllers.keys()) this.cancelRun(run);
    await Promise.allSettled([...this.inFlight]);
    await this.notes.close();
    await this.schema.close();
  }
}
