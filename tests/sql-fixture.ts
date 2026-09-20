import { defaults } from '../server/plugins/mssql/service.js';
import type { SqlDriver } from '../server/plugins/mssql/driver.js';
import type { MssqlSettings, SqlCommand, SqlResult } from '../shared/plugins.js';
export const config: MssqlSettings = {
  ...defaults,
  enabled: true,
  server: '127.0.0.1',
  databases: ['Dev'],
  read: { username: 'reader', password: 'reader-secret' },
  write: { username: 'writer', password: 'writer-secret' },
  allowDataChanges: true,
  allowSchemaChanges: true,
  allowProcedures: true,
  procedures: [{ database: 'Dev', schema: 'dbo', name: 'Approved' }],
};
export class FakeSql implements SqlDriver {
  calls: { login: string; command: SqlCommand }[] = [];
  count = 1105;
  failMetadata = false;
  hold = false;
  async execute(
    _s: MssqlSettings,
    login: 'read' | 'write',
    command: SqlCommand,
    signal: AbortSignal,
  ): Promise<SqlResult> {
    this.calls.push({ login, command });
    signal.throwIfAborted();
    if (this.hold)
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }),
      );
    if (command.sql?.includes('sys.objects o')) {
      if (this.failMetadata) throw new Error('metadata unavailable');
      const after = Number(command.parameters![0]!.value);
      const rows = [];
      for (let i = after + 1; i <= Math.min(after + 100, this.count); i++)
        rows.push([
          i,
          'dbo',
          `Table${i}`,
          'USER_TABLE',
          `Business table ${i}`,
          i * 10,
          i === 1 ? 1104 : 0,
          '[{"name":"id","dataType":"int","maxLength":4,"nullable":false,"identityColumn":true},{"name":"parentId","dataType":"int","maxLength":4,"nullable":true},{"name":"value","dataType":"nvarchar","maxLength":200,"nullable":true},{"name":"açıklama","dataType":"nvarchar","maxLength":400,"nullable":true,"description":"Şube açıklaması"}]',
          '[{"name":"PK","primaryKey":true,"columnName":"id","ordinal":1}]',
          '[{"name":"FK_parent","columnName":"parentId","referencedSchema":"dbo","referencedTable":"Table1","referencedColumn":"id"}]',
          i === 1
            ? '[{"name":"FK_parent","referencingSchema":"dbo","referencingTable":"Table2","referencingColumn":"parentId","columnName":"id"}]'
            : '[]',
          '[]',
        ]);
      return {
        columns: [
          'objectId',
          'schemaName',
          'objectName',
          'kind',
          'description',
          'approxRows',
          'referencedByCount',
          'columnsJson',
          'indexesJson',
          'relationshipsJson',
          'referencedByJson',
          'parametersJson',
        ],
        rows,
        affected: 0,
        truncated: false,
      };
    }
    return {
      columns: ['id', 'value'],
      rows: [
        [1, '=HYPERLINK("bad")'],
        [2, 'hello'],
      ],
      affected: login === 'write' ? 1 : 0,
      truncated: false,
    };
  }
}
