const labels: Record<string, string> = {
  reports_sources: 'Find report content',
  reports_create: 'Create PDF report',
  charts_create: 'Create chart',
  charts_datasets: 'Find chart datasets',
  charts_sources: 'Find chart sources',
  charts_import: 'Import chart data',
  charts_transform: 'Calculate chart data',
  mssql_schema_read: 'Read table structure',
  mssql_schema_search: 'Search database schema',
  mssql_knowledge_search: 'Search database knowledge',
  mssql_query: 'Run SQL query',
  mssql_procedure: 'Run stored procedure',
  read: 'Read file',
  write: 'Write file',
  edit: 'Edit file',
  bash: 'Run command',
  grep: 'Search file contents',
  find: 'Find files',
  ls: 'List files',
  search_knowledge: 'Search project knowledge',
  read_knowledge: 'Read project knowledge',
  propose_knowledge: 'Draft knowledge update',
  create_document: 'Create Word document',
};
export const toolLabel = (name?: string) =>
  name ? labels[name] || name.replaceAll('_', ' ') : 'Tool result';
export function statusLabel(status: string) {
  if (!status.startsWith('Running ')) return status;
  const label = toolLabel(status.slice('Running '.length));
  const verbs: Record<string, string> = {
    Run: 'Running',
    Read: 'Reading',
    Write: 'Writing',
    Edit: 'Editing',
    Search: 'Searching',
    Find: 'Finding',
    List: 'Listing',
    Create: 'Creating',
    Import: 'Importing',
    Calculate: 'Calculating',
    Draft: 'Drafting',
  };
  return label.replace(/^\w+/, (verb) => verbs[verb] || `Running ${verb}`);
}
