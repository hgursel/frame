import { lstatSync, mkdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from './store.js';
import type { Runner } from './runner.js';
import type { Knowledge } from './knowledge.js';

const present = (file: string) => {
  try {
    lstatSync(file);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
type Journal = { committed: boolean; moves: { from: string; to: string }[] };
/** Check ancestors, not the leaf: deleting a symlink must remove the link, never its target. */
function checkedParent(store: Store, relative: string) {
  const full = path.resolve(store.root, relative);
  if (!full.startsWith(store.root + path.sep)) throw fail('Invalid deletion path.');
  let parent = path.dirname(full);
  while (parent !== store.root) {
    if (present(parent) && realpathSync(parent) !== parent)
      throw fail('A data directory has been replaced. Restore it before deleting.');
    parent = path.dirname(parent);
  }
  return full;
}
function recover(store: Store, key: string, journal: Journal) {
  for (const move of [...journal.moves].reverse()) {
    const to = checkedParent(store, move.to);
    if (journal.committed) rmSync(to, { recursive: true, force: true });
    else if (present(to)) {
      const from = checkedParent(store, move.from);
      if (present(from))
        throw fail('Deletion recovery needs attention: original path already exists.');
      renameSync(to, from);
    }
  }
  store.db.prepare('DELETE FROM meta WHERE key=?').run(key);
}
/** Finish committed cleanup or restore an interrupted staging operation after a restart. */
export function recoverDeletions(store: Store) {
  const rows = store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'deletion:%'").all() as {
    key: string;
    value: string;
  }[];
  for (const row of rows) recover(store, row.key, JSON.parse(row.value));
}
export function deleteWorkspaceData(
  store: Store,
  runner: Runner,
  knowledge: Knowledge,
  projectId: string,
  conversationId?: string,
) {
  const sql = runner.mssql!;
  if (
    runner.projectBusy(projectId) ||
    runner.reports?.busy(projectId) ||
    knowledge.locks.has(projectId) ||
    sql.schema.jobs.has(projectId) ||
    sql.notes.jobs.has(projectId) ||
    sql.inFlight.size
  )
    throw fail(
      'Stop active tasks and wait for uploads, database operations, and knowledge generation before deleting.',
    );
  const conversations = store
    .conversations()
    .filter((c) => c.projectId === projectId && (!conversationId || c.id === conversationId));
  const paths = conversations.flatMap((c) => [
    path.relative(store.root, store.sessionFile(c.id)),
    `agent/${c.id}`,
  ]);
  if (conversationId) paths.push(`projects/${projectId}/outputs/${conversationId}`);
  else paths.push(`projects/${projectId}`);
  // Move files aside before the transaction; restore them on failure. A durable journal covers restart.
  const trash = checkedParent(store, 'deleted/placeholder');
  mkdirSync(path.dirname(trash), { recursive: true, mode: 0o700 });
  const key = `deletion:${randomUUID()}`;
  const journal: Journal = {
    committed: false,
    moves: paths.map((from, i) => ({ from, to: `deleted/${key.slice(9)}-${i}` })),
  };
  for (const move of journal.moves) checkedParent(store, move.from);
  store.setMeta(key, JSON.stringify(journal));
  try {
    for (const move of journal.moves) {
      try {
        renameSync(checkedParent(store, move.from), checkedParent(store, move.to));
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    store.db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of conversations) {
        store.db.prepare('DELETE FROM charts WHERE conversationId=?').run(c.id);
        store.db.prepare('DELETE FROM chart_datasets WHERE conversationId=?').run(c.id);
        store.db.prepare('DELETE FROM mssql_operations WHERE conversationId=?').run(c.id);
        store.db.prepare('DELETE FROM runs WHERE conversationId=?').run(c.id);
        store.db.prepare('DELETE FROM meta WHERE key=?').run(`metrics:${c.id}`);
        store.db
          .prepare("DELETE FROM maintenance_candidates WHERE json_extract(payload,'$.sourceId')=?")
          .run(c.id);
        store.db.prepare('DELETE FROM maintenance_processed WHERE sourceId=?').run(c.id);
        runner.ephemeral.delete(c.id);
        store.db.prepare('DELETE FROM conversations WHERE id=?').run(c.id);
      }
      if (!conversationId) {
        if (sql.schema.fts)
          store.db
            .prepare(
              'DELETE FROM mssql_schema_fts WHERE rowid IN (SELECT rowid FROM mssql_schema WHERE projectId=?)',
            )
            .run(projectId);
        for (const table of [
          'maintenance_candidates',
          'maintenance_processed',
          'maintenance_findings',
          'knowledge_revisions',
          'documents',
          'project_plugins',
          'report_settings',
          'mssql_schema',
          'mssql_schema_state',
          'mssql_notes',
          'mssql_pages',
          'mssql_gaps',
          'mssql_notes_catalog',
          'mssql_notes_state',
        ])
          store.db.prepare(`DELETE FROM ${table} WHERE projectId=?`).run(projectId);
        store.db.prepare('DELETE FROM projects WHERE id=?').run(projectId);
        const settings = store.meta('maintenance-settings');
        if (settings) {
          const value = JSON.parse(settings);
          value.projectIds = value.projectIds.filter((id: string) => id !== projectId);
          store.setMeta('maintenance-settings', JSON.stringify(value));
        }
      }
      store.setMeta(key, JSON.stringify({ ...journal, committed: true }));
      store.db.exec('COMMIT');
      journal.committed = true;
    } catch (error) {
      store.db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    recover(store, key, journal);
    throw error;
  }
  // Tell open event streams to close before their next snapshot reads deleted metadata.
  for (const c of conversations) runner.emit(c.id);
  try {
    recover(store, key, journal);
  } catch {
    throw fail(
      'Records deleted, but file cleanup is incomplete. Check disk permissions and restart Frame to finish cleanup.',
      409,
    );
  }
  return { ok: true };
}
