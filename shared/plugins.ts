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
  /** Enables sampling rows from small lookup tables during enrichment. Off by default. */
  allowValueSampling: boolean;
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
  datasetId?: string;
  chartNotice?: string;
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
export interface SchemaCard {
  id: string;
  database: string;
  schema: string;
  name: string;
  kind: string;
  obsolete: boolean;
  at: string;
  /** Approximate catalog row count; null for caches imported before row counts were collected. */
  rowCount: number | null;
  /** One line of catalog facts, shown in search results so triage needs no read. */
  summary: string | null;
}
export interface SchemaObject extends SchemaCard {
  text: string;
  noteVersion?: string;
}
export interface SchemaNote {
  purpose: string;
  grain: string;
  domain: string;
  aliases: string[];
  columnNotes: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
  /** How many annotated columns did not exist; a hallucination signal kept for review. */
  invented: number;
  factHash?: string;
  modelId?: string;
  at?: string;
  state?: 'proposed' | 'accepted' | 'rejected';
}
export interface NotesPage {
  id: string;
  kind: 'domain' | 'glossary' | 'recipe' | 'codes';
  title: string;
  body: string;
  at: string;
  modelId: string;
  state: string;
}
export interface NotesStatus {
  state: 'empty' | 'running' | 'ready' | 'error' | 'cancelled';
  count: number;
  at?: string;
  error?: string;
  progress?: string;
}
export interface SchemaStatus {
  state: 'empty' | 'running' | 'ready' | 'stale' | 'error' | 'cancelled';
  count: number;
  at?: string;
  error?: string;
  progress?: string;
}
