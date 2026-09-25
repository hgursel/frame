import parser from 'node-sql-parser';
import { z } from 'zod';
import type { MssqlSettings, SqlCommand } from '../../../shared/plugins.js';
export const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const identifier = z
  .string()
  .min(1)
  .max(128)
  .refine((s) => !/[\x00-\x1f]/.test(s), 'Invalid identifier');
const login = z.object({
  username: z.string().max(128),
  password: z.string().max(4096).optional(),
});
export const settingsSchema = z.object({
  enabled: z.boolean(),
  server: z
    .string()
    .max(253)
    .regex(/^[a-zA-Z0-9_.:-]*$/),
  port: z.number().int().min(1).max(65535),
  databases: z.array(identifier).max(50),
  read: login,
  write: login,
  allowDataChanges: z.boolean(),
  allowSchemaChanges: z.boolean(),
  allowProcedures: z.boolean(),
  /** Accept legacy configuration, but knowledge enrichment never samples business rows. */
  allowValueSampling: z
    .boolean()
    .default(false)
    .transform(() => false),
  procedures: z
    .array(z.object({ database: identifier, schema: identifier, name: identifier }))
    .max(500),
  trustServerCertificate: z.boolean(),
  timeoutSeconds: z.number().int().min(5).max(120),
  maxRows: z.number().int().min(1).max(5000),
});
export const commandSchema = z
  .object({
    database: identifier,
    sql: z.string().trim().min(1).max(32000).optional(),
    procedure: z.object({ schema: identifier, name: identifier }).optional(),
    parameters: z
      .array(
        z.object({
          name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/),
          type: z.enum(['text', 'int', 'decimal', 'bit', 'date']),
          value: z.union([z.string().max(8000), z.number().finite(), z.boolean(), z.null()]),
        }),
      )
      .max(100)
      .default([]),
  })
  .refine((v) => !!v.sql !== !!v.procedure, 'Provide SQL or a procedure, not both');
export const quote = (s: string) => '[' + s.replaceAll(']', ']]') + ']';
const sqlParser = new parser.Parser();
/** Parse the entire statement. Unsupported T-SQL fails closed; never infer safety from a prefix. */
export function classify(
  command: SqlCommand,
  settings: MssqlSettings,
): 'read' | 'data' | 'schema' | 'procedure' {
  if (!settings.enabled || !settings.databases.includes(command.database))
    throw fail('MSSQL or this database is not enabled.', 403);
  if (
    new Set(command.parameters?.map((p) => p.name.toLowerCase())).size !==
    (command.parameters?.length || 0)
  )
    throw fail('Duplicate SQL parameter');
  if (command.procedure) {
    if (
      !settings.allowProcedures ||
      !settings.procedures.some(
        (p) =>
          p.database === command.database &&
          p.schema === command.procedure!.schema &&
          p.name === command.procedure!.name,
      )
    )
      throw fail('This stored procedure is not enabled by the administrator.', 403);
    return 'procedure';
  }
  const sql = command.sql!;
  // Strip string values only. Quoted identifiers still undergo conservative checks.
  const syntax = sql.replace(/N?'(?:''|[^'])*'/g, "''");
  if (/--|\/\*|\*\//.test(syntax)) throw fail('Remove SQL comments before execution.');
  if (
    /\b(EXEC(?:UTE)?|USE|GRANT|DENY|REVOKE|DBCC|BACKUP|RESTORE|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|WAITFOR|OUTPUT|GO|TRANSACTION|COMMIT|ROLLBACK|IMPERSONATE|NEXT\s+VALUE|RECONFIGURE)\b/i.test(
      syntax,
    )
  )
    throw fail(
      'This SQL construct is not supported. Use the procedure tool for approved procedures.',
    );
  // Three/four part names, including quoted identifiers and omitted schema, are forbidden.
  const ident = '(?:\\[[^\\]]*(?:\\]\\][^\\]]*)*\\]|"(?:[^"]|"")+"|[\\w@$#]+)';
  if (new RegExp(ident + '\\s*\\.\\s*(?:' + ident + ')?\\s*\\.').test(syntax))
    throw fail('Use only schema.object references in the selected database.');
  let ast: any;
  try {
    ast = sqlParser.astify(sql, { database: 'TransactSQL' });
  } catch {
    throw fail(
      'Unsupported T-SQL syntax. Use one supported SELECT, INSERT, UPDATE, DELETE, or table/index schema statement.',
    );
  }
  const list = Array.isArray(ast) ? ast : [ast];
  if (list.length !== 1) throw fail('Submit one SQL statement per request.');
  const root = list[0];
  const kind =
    root.type === 'select'
      ? 'read'
      : ['insert', 'update', 'delete'].includes(root.type)
        ? 'data'
        : ['create', 'alter', 'drop', 'truncate'].includes(root.type) &&
            ['table', 'index'].includes(String(root.keyword).toLowerCase())
          ? 'schema'
          : undefined;
  if (!kind) throw fail('This statement type is not supported.');
  const inspect = (v: any) => {
    if (!v || typeof v !== 'object') return;
    if (
      v.into?.position ||
      (v.type === 'column_ref' && v.schema && v.db) ||
      (v.table && v.schema && v.db)
    )
      throw fail('Cross-database access and SELECT INTO are disabled.');
    if (
      kind === 'read' &&
      [
        'insert',
        'update',
        'delete',
        'create',
        'alter',
        'drop',
        'truncate',
        'exec',
        'call',
        'set',
      ].includes(v.type)
    )
      throw fail('Automatic queries must be read-only SELECT statements.');
    if (
      v.type === 'function' &&
      (v.name?.schema || v.name?.name?.length > 1 || /\./.test(JSON.stringify(v.name)))
    )
      throw fail('User-defined functions are not supported by the SQL guard.');
    Object.values(v).forEach(inspect);
  };
  inspect(root);
  if (
    (kind === 'data' && !settings.allowDataChanges) ||
    (kind === 'schema' && !settings.allowSchemaChanges)
  )
    throw fail('This operation is disabled in system plugin settings.', 403);
  return kind;
}
export function commandText(c: SqlCommand) {
  return (
    c.sql ||
    `EXEC ${quote(c.procedure!.schema)}.${quote(c.procedure!.name)} ${(c.parameters || []).map((p) => '@' + p.name + ' = @' + p.name).join(', ')}`
  );
}
