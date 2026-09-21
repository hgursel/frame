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
import type { Generator } from '../server/plugins/mssql/generate.js';
/** Answers every enrichment prompt shape; one deliberately invents a column to exercise validation. */
export class FakeGenerator implements Generator {
  calls: string[] = [];
  fail = false;
  prose = false;
  gapTarget: string | false = false;
  async complete(
    request: { system: string; prompt: string; maxTokens: number },
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    this.calls.push(request.prompt);
    if (this.fail) throw new Error('model unavailable');
    const wrap = (json: string) =>
      this.prose ? `Sure! Here you go:\n\`\`\`json\n${json}\n\`\`\`` : json;
    if (request.prompt.includes('"title"')) {
      const first = /^(\w+)\.(\w+) \(/m.exec(request.prompt);
      return wrap(
        JSON.stringify({
          title: 'Sales',
          summary: 'Orders and the tables that hang off them.',
          coreTables: [first ? `${first[1]}.${first[2]}` : 'dbo.Nope', 'dbo.NotInCluster'],
        }),
      );
    }
    if (request.prompt.includes('"terms"'))
      return wrap(JSON.stringify({ terms: { Table: 'A business table.', Nonsense: 'invented' } }));
    if (request.prompt.includes('"question"'))
      return wrap(JSON.stringify({ question: 'Which rows are in the table?' }));
    if (request.prompt.includes('"meaning"'))
      return wrap(JSON.stringify({ meaning: '1 = open, 2 = closed.' }));
    if (request.prompt.includes('"object"'))
      return wrap(
        JSON.stringify({ object: /found nothing/.test(request.prompt) && this.gapTarget }),
      );
    return wrap(
      JSON.stringify({
        purpose: 'Holds business records.',
        grain: 'one row per record',
        aliases: ['cari hesap', 'müşteri'],
        columnNotes: { parentId: 'Parent record.', ghostColumn: 'Does not exist.' },
        domain: 'Sales',
        confidence: 'high',
      }),
    );
  }
}
