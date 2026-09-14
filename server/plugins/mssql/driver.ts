import { Connection, Request, TYPES } from 'tedious';
import type { MssqlSettings, SqlCommand, SqlResult } from '../../../shared/plugins.js';
import { quote } from './policy.js';
export interface SqlDriver {
  execute(
    settings: MssqlSettings,
    login: 'read' | 'write',
    command: SqlCommand,
    signal: AbortSignal,
    limits?: { rows: number; bytes: number },
  ): Promise<SqlResult>;
}
/** A fresh connection per operation prevents state/transaction leakage between requests. */
export class TediousDriver implements SqlDriver {
  execute(
    settings: MssqlSettings,
    login: 'read' | 'write',
    command: SqlCommand,
    signal: AbortSignal,
    limits = { rows: settings.maxRows, bytes: 1_000_000 },
  ): Promise<SqlResult> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const connection = new Connection({
        server: settings.server,
        authentication: {
          type: 'default',
          options: { userName: settings[login].username, password: settings[login].password },
        },
        options: {
          database: command.database,
          port: settings.port,
          encrypt: true,
          trustServerCertificate: settings.trustServerCertificate,
          connectTimeout: 15000,
          requestTimeout: settings.timeoutSeconds * 1000,
          cancelTimeout: 3000,
          maxRetriesOnTransientErrors: 0,
          rowCollectionOnDone: false,
          rowCollectionOnRequestCompletion: false,
          appName: 'Frame MSSQL',
        },
      });
      let settled = false,
        limited = false,
        bytes = 0,
        affected = 0;
      let columns: string[] = [];
      const rows: unknown[][] = [];
      const finish = (error?: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        signal.removeEventListener('abort', abort);
        connection.close();
        if (error)
          reject(
            new Error(
              login === 'write'
                ? 'SQL change failed, timed out, or was cancelled. Its outcome may be uncertain; verify the database before retrying.'
                : 'SQL request failed or was cancelled. Check connectivity, permissions, syntax, and timeout.',
            ),
          );
        else resolve({ columns, rows, affected, truncated: limited });
      };
      const abort = () => {
        connection.cancel();
        finish(new Error('Cancelled'));
      };
      const deadline = setTimeout(abort, (settings.timeoutSeconds + 15) * 1000);
      signal.addEventListener('abort', abort, { once: true });
      connection.on('error', finish);
      connection.connect((error) => {
        if (settled) return;
        if (error) return finish(error);
        const request = new Request(
          command.procedure
            ? `${quote(command.procedure.schema)}.${quote(command.procedure.name)}`
            : command.sql!,
          (error) => finish(limited && login === 'read' && !signal.aborted ? undefined : error),
        );
        const types = {
          text: TYPES.NVarChar,
          int: TYPES.Int,
          decimal: TYPES.Decimal,
          bit: TYPES.Bit,
          date: TYPES.DateTime2,
        };
        try {
          for (const p of command.parameters || []) {
            let value: any = p.value;
            if (p.type === 'date' && value != null) {
              value = new Date(String(value));
              if (!Number.isFinite(value.getTime())) throw new Error('Invalid date');
            }
            if (
              p.type === 'int' &&
              value != null &&
              (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
            )
              throw new Error('Invalid integer');
            if (p.type === 'decimal' && value != null && typeof value !== 'number')
              throw new Error('Invalid decimal');
            if (p.type === 'bit' && value != null && typeof value !== 'boolean')
              throw new Error('Invalid bit');
            request.addParameter(
              p.name,
              types[p.type],
              value,
              p.type === 'decimal' ? { precision: 28, scale: 8 } : {},
            );
          }
        } catch (e) {
          return finish(e as Error);
        }
        let resultSets = 0;
        request.on('columnMetadata', (meta) => {
          resultSets++;
          if (resultSets === 1)
            columns = (Array.isArray(meta) ? meta : Object.values(meta)).map((c) => c.colName);
        });
        request.on('row', (cells) => {
          if (resultSets > 1) {
            limited = true;
            return;
          }
          const row = cells.map((c: any) =>
            Buffer.isBuffer(c.value)
              ? '[binary]'
              : c.value instanceof Date
                ? c.value.toISOString()
                : typeof c.value === 'bigint'
                  ? String(c.value)
                  : c.value,
          );
          const size = Buffer.byteLength(JSON.stringify(row));
          if (rows.length >= limits.rows || bytes + size > limits.bytes) {
            limited = true;
            if (login === 'read') connection.cancel();
            return;
          }
          bytes += size;
          rows.push(row);
        });
        request.on('doneProc', (count) => {
          affected += count || 0;
        });
        request.on('doneInProc', (count) => {
          affected += count || 0;
        });
        request.on('done', (count) => {
          affected += count || 0;
        });
        if (command.procedure) connection.callProcedure(request);
        else connection.execSql(request);
      });
    });
  }
}
