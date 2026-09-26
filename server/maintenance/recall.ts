import type { WorkerInput } from '../../shared/types.js';
import type { MssqlPlugin } from '../plugins/mssql/service.js';
import { factHashOf } from '../plugins/mssql/notes.js';
import type { Method, Methods } from './methods.js';
import { knowledgeContext } from '../knowledge-discovery.js';

export function queryDependencies(sql: MssqlPlugin, projectId: string, text: string) {
  const database = text.split('\n')[0]!.slice(10);
  const dependencies: { id: string; hash: string }[] = [];
  for (const m of text.matchAll(/\b(?:FROM|JOIN)\s+\[([^\]]+)\]\.\[([^\]]+)\]/gi)) {
    const row = sql.store.db
      .prepare(
        'SELECT id,text FROM mssql_schema WHERE projectId=? AND generation=? AND databaseName=? AND schemaName=? COLLATE NOCASE AND name=? COLLATE NOCASE AND obsolete=0',
      )
      .get(projectId, sql.schema.generation(projectId), database, m[1]!, m[2]!) as any;
    if (!row) return [];
    if (!dependencies.some((d) => d.id === row.id))
      dependencies.push({ id: row.id, hash: factHashOf(row.text) });
  }
  return dependencies;
}
export function validSqlMethod(sql: MssqlPlugin, method: Method) {
  try {
    const settings = sql.requireProject(method.projectId);
    sql.schema.ensureSource(method.projectId, settings);
    if (
      sql.schema.status(method.projectId).state !== 'ready' ||
      !settings.databases.includes(method.text.split('\n')[0]!.slice(10))
    )
      return false;
    if (method.schemaSource && method.schemaSource !== sql.schema.source(settings)) return false;
    if (method.dependencies?.length)
      return method.dependencies.every((d) => {
        const row = sql.store.db
          .prepare(
            'SELECT text FROM mssql_schema WHERE projectId=? AND generation=? AND id=? AND obsolete=0',
          )
          .get(method.projectId, sql.schema.generation(method.projectId), d.id) as any;
        return row && factHashOf(row.text) === d.hash;
      });
    return (
      !!method.schemaRevision && method.schemaRevision === sql.schema.generation(method.projectId)
    );
  } catch {
    return false;
  }
}

/** No model call and no live SQL: supply a small reference pack before generation. */
export function recall(
  methods: Methods,
  sql: MssqlPlugin,
  projectId: string,
  query: string,
  documents: NonNullable<WorkerInput['knowledge']>,
  contextWindow: number,
) {
  let generation: string | undefined;
  let databases: string[] = [];
  try {
    const settings = sql.requireProject(projectId);
    sql.schema.ensureSource(projectId, settings);
    if (sql.schema.status(projectId).state === 'ready') {
      generation = sql.schema.generation(projectId);
      databases = settings.databases;
    }
  } catch {
    /* Disabled, stale, or uninitialized SQL must not contribute recipes. */
  }
  const learned = methods
    .catalog(projectId, generation, (m) => validSqlMethod(sql, m))
    .filter(
      (m) =>
        !m.text.startsWith('Database: ') || databases.includes(m.text.split('\n')[0]!.slice(10)),
    );
  const catalog = [...learned, ...documents];
  const pack = knowledgeContext(catalog, query, contextWindow);
  let schemaBudget = Math.min(12000, Math.floor(contextWindow / 3));
  const schema: { id: string; name: string; text: string; truncated: boolean }[] = [];
  const seen = new Set<string>();
  if (generation)
    for (const entry of pack) {
      const doc = learned.find((d) => d.id === entry.id);
      if (!doc || !doc.text.startsWith('Database: ')) continue;
      const database = doc.text.split('\n')[0]!.slice(10);
      for (const match of doc.text.matchAll(/\b(?:FROM|JOIN)\s+\[([^\]]+)\]\.\[([^\]]+)\]/gi)) {
        const object = sql.store.db
          .prepare(
            'SELECT id,schemaName,name,text FROM mssql_schema WHERE projectId=? AND generation=? AND databaseName=? AND schemaName=? COLLATE NOCASE AND name=? COLLATE NOCASE AND obsolete=0',
          )
          .get(projectId, generation, database, match[1]!, match[2]!) as any;
        if (!object || seen.has(object.id) || schemaBudget < 500 || schema.length >= 4) continue;
        seen.add(object.id);
        const text = String(object.text).slice(0, Math.min(5000, Math.floor(schemaBudget / 3)));
        schemaBudget -= Buffer.byteLength(text);
        schema.push({
          id: object.id,
          name: `${database}.${object.schemaName}.${object.name}`,
          text,
          truncated: text.length < object.text.length,
        });
      }
    }
  return {
    catalog,
    reference: { pages: pack, schema, schemaAt: sql.schema.status(projectId).at },
    ids: pack.filter((p) => learned.some((m) => m.id === p.id)).map((p) => p.id),
  };
}
