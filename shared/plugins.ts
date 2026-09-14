export interface SqlLogin {
  username: string;
  password: string;
}
export interface MssqlSettings {
  enabled: boolean;
  server: string;
  port: number;
  databases: string[];
  read: SqlLogin;
  write: SqlLogin;
  allowDataChanges: boolean;
  allowSchemaChanges: boolean;
  allowProcedures: boolean;
  procedures: { database: string; schema: string; name: string }[];
  trustServerCertificate: boolean;
  timeoutSeconds: number;
  maxRows: number;
}
export type PublicMssqlSettings = Omit<MssqlSettings, 'read' | 'write'> & {
  read: { username: string; hasPassword: boolean };
  write: { username: string; hasPassword: boolean };
};
export interface SqlParameter {
  name: string;
  type: 'text' | 'int' | 'decimal' | 'bit' | 'date';
  value: string | number | boolean | null;
}
export interface SqlCommand {
  database: string;
  sql?: string;
  procedure?: { schema: string; name: string };
  parameters?: SqlParameter[];
}
export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  affected: number;
  truncated: boolean;
  csv?: string;
  artifactNotice?: string;
  previewLimited?: boolean;
}
export interface SqlApproval {
  id: string;
  runId: string;
  database: string;
  sql: string;
  parameters: SqlParameter[];
  kind: 'data' | 'schema' | 'procedure';
  expiresAt: number;
}
export interface SchemaObject {
  id: string;
  database: string;
  schema: string;
  name: string;
  kind: string;
  text: string;
  obsolete: boolean;
  at: string;
}
export interface SchemaStatus {
  state: 'empty' | 'running' | 'ready' | 'stale' | 'error' | 'cancelled';
  count: number;
  at?: string;
  error?: string;
  progress?: string;
}
