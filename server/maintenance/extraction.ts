import parser from 'node-sql-parser';
import { createHash } from 'node:crypto';
const sqlParser = new parser.Parser();
export const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Fail closed. The model never sees SQL values, result rows, aliases, comments or parameter values. */
export function queryTemplate(sql: string): string | undefined {
  if (sql.length > 32000 || /--|\/\*|\*\//.test(sql.replace(/N?'(?:''|[^'])*'/g, "''"))) return;
  try {
    const parsed = sqlParser.astify(sql, { database: 'TransactSQL' });
    const ast: any = Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0] : null) : parsed;
    if (!ast || ast.type !== 'select' || ast.with || ast.into?.position) return;
    const aliases = new Map<string, string>();
    let aliasId = 0;
    const collect = (v: any) => {
      if (!v || typeof v !== 'object') return;
      if (typeof v.as === 'string' && !aliases.has(v.as.toLowerCase()))
        aliases.set(v.as.toLowerCase(), `alias_${++aliasId}`);
      for (const child of Object.values(v)) collect(child);
    };
    collect(ast);
    const rewrite = (v: any, inOrderBy = false) => {
      if (!v || typeof v !== 'object') return;
      // Skip exotic constructs rather than leak uninterpreted AST values.
      if (v.type && /exec|declare|insert|update|delete|create|drop/i.test(v.type)) throw Error();
      for (const key of ['as', ...(v.type === 'column_ref' ? ['table'] : [])])
        if (typeof v[key] === 'string' && aliases.has(v[key].toLowerCase()))
          v[key] = aliases.get(v[key].toLowerCase());
      if (inOrderBy && v.type === 'column_ref' && !v.table && typeof v.column === 'string')
        v.column = aliases.get(v.column.toLowerCase()) || v.column;
      for (const [key, child] of Object.entries(v)) rewrite(child, inOrderBy || key === 'orderby');
    };
    rewrite(ast);
    const canonical = sqlParser.sqlify(ast, { database: 'TransactSQL' });
    let output = '',
      i = 0,
      parameter = 0;
    const parameters = new Map<string, string>();
    while (i < canonical.length) {
      const rest = canonical.slice(i);
      const quoted = /^(?:N)?'(?:''|[^'])*'/i.exec(rest);
      const number = /^(?:0x[0-9a-f]+|\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)/i.exec(rest);
      const variable = /^@[A-Za-z_][A-Za-z0-9_$]*/.exec(rest);
      // sqlify quotes even parameter references as identifiers.
      const identifier = /^\[(?:[^\]]|\]\])*\]/.exec(rest);
      if (quoted || number || variable || identifier?.[0].startsWith('[@')) {
        const token = (quoted || number || variable || identifier)![0];
        if (!parameters.has(token)) parameters.set(token, `@p${++parameter}`);
        output += parameters.get(token);
        i += token.length;
      } else if (identifier) {
        output += identifier[0];
        i += identifier[0].length;
      } else {
        const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(rest);
        if (word) {
          output += word[0];
          i += word[0].length;
        } else if (/^[\s(),.*+\-/=<>!%|&;:]$/.test(rest[0]!)) {
          output += rest[0];
          i++;
        } else return;
      }
    }
    return output.length <= 8000 ? output : undefined;
  } catch {
    return;
  }
}

export interface LearningUnit {
  key: string;
  kind: 'query' | 'conversation';
  text: string;
  source: string;
}
/** SQL-tainted conversations are structural-only, including replies before/after a query. */
export function learningUnits(branch: any[]): LearningUnit[] {
  const messages = branch
    .filter((e) => e.type === 'message')
    .map((e) => ({ ...e.message, entryId: e.id }));
  const calls = messages.flatMap((m) =>
    Array.isArray(m.content) ? m.content.filter((c: any) => c.type === 'toolCall') : [],
  );
  const sql =
    calls.some((c) => c.name?.startsWith('mssql_')) ||
    messages.some((m) => m.toolName?.startsWith('mssql_'));
  if (sql) {
    return calls
      .filter(
        (c) =>
          c.name === 'mssql_query' &&
          messages.some((m) => m.role === 'toolResult' && m.toolCallId === c.id && !m.isError),
      )
      .flatMap((c) => {
        const text =
          typeof c.arguments?.sql === 'string' ? queryTemplate(c.arguments.sql) : undefined;
        // Database is operational metadata, never a user-supplied title or example output.
        const database = String(c.arguments?.database || '');
        if (!text || !/^[\p{L}\p{N}_ -]{1,128}$/u.test(database)) return [];
        const body = `Database: ${database}\n\nParameterized query template; review parameters and current schema before execution. Prior execution is not business validation.\n\n\`\`\`sql\n${text}\n\`\`\`\n\nNo result rows, sample values, or parameter values are retained.`;
        return [{ key: fingerprint(body), kind: 'query' as const, text: body, source: c.id }];
      });
  }
  const prose = messages
    .filter((m) => ['user', 'assistant'].includes(m.role))
    .map((m) => {
      let text: string =
        typeof m.content === 'string'
          ? m.content
          : (m.content || [])
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('\n');
      if (m.role === 'assistant' && text.trimStart().startsWith('<think>')) {
        const end = text.indexOf('</think>');
        text = end < 0 ? '' : text.slice(end + 8);
      }
      return { text, role: m.role, source: m.entryId };
    });
  // Exclude the whole conversation: later prose may repeat values from an earlier pasted table.
  if (
    prose.some(({ text }) =>
      /```|\|.*\||\b(?:SELECT\s|INSERT\s|UPDATE\s|DELETE\s|sql|csv|query results|result rows)\b/i.test(
        text,
      ),
    )
  )
    return [];
  const units: LearningUnit[] = [];
  let current = '',
    source = '';
  const flush = () => {
    if (current.trim())
      units.push({ key: fingerprint(current), kind: 'conversation', text: current, source });
    current = '';
  };
  for (const m of prose) {
    if (!m.text.trim()) continue;
    // Stable complete-message groups deduplicate across follow-ups. Split long messages with
    // overlap so later corrections survive without sending an entire conversation to the model.
    if (current.length + m.text.length + 20 > 5000) flush();
    source = m.source;
    if (m.text.length > 4800) {
      for (let at = 0; at < m.text.length; at += 4400) {
        current = `${m.role}: ${m.text.slice(at, at + 4800)}`;
        flush();
        if (at + 4800 >= m.text.length) break;
      }
    } else current += `\n${m.role}: ${m.text}`;
  }
  flush();
  return units;
}
