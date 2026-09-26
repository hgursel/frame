import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';
import type { DiscoveryMetadata, PublishPolicy } from '../../shared/maintenance.js';
import { fingerprint } from './extraction.js';
import { readSessionBranch } from '../history.js';

export interface Method {
  id: string;
  projectId: string;
  title: string;
  text: string;
  discovery: DiscoveryMetadata;
  fingerprint: string;
  sourceKind: 'method';
  sourceId: string;
  sourceRevision: string;
  sources: { id: string; revision: string; confirmed: boolean }[];
  occurrences: number;
  confirmed: boolean;
  verified?: boolean;
  schemaRevision?: string;
  schemaSource?: string;
  dependencies?: { id: string; hash: string }[];
  uses?: number;
  lastUsed?: string;
}
/** Conservative title matching; ambiguous tasks remain separate instead of being guessed together. */
export function taskFingerprint(title: string, category: string, existing: Method[]) {
  const tokens = (s: string) =>
    [...new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
      .filter((t) => !['the', 'a', 'an', 'for', 'of', 'to'].includes(t))
      .sort();
  const words = tokens(title);
  for (const method of existing.filter((m) => m.discovery.category === category)) {
    const other = tokens(method.title);
    const common = words.filter((t) => other.includes(t)).length;
    const union = new Set([...words, ...other]).size;
    if (words.join(' ') === other.join(' ') || (common >= 3 && common / union >= 0.8))
      return method.fingerprint;
  }
  return fingerprint([category, words]);
}
const fail = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
export class Methods {
  constructor(readonly store: Store) {
    store.db.exec(
      `CREATE TABLE IF NOT EXISTS project_methods(id TEXT PRIMARY KEY, projectId TEXT NOT NULL, payload TEXT NOT NULL, at TEXT NOT NULL);`,
    );
  }
  list(projectId?: string): Method[] {
    return (
      this.store.db
        .prepare(
          'SELECT payload FROM project_methods' +
            (projectId ? ' WHERE projectId=?' : '') +
            ' ORDER BY at DESC',
        )
        .all(...(projectId ? [projectId] : [])) as any[]
    ).map((r) => JSON.parse(r.payload));
  }
  candidates(projectId: string): Method[] {
    return (
      this.store.db
        .prepare(
          "SELECT payload FROM maintenance_candidates WHERE projectId=? AND json_extract(payload,'$.sourceKind')='method' AND status<>'rejected' ORDER BY at DESC LIMIT 100",
        )
        .all(projectId) as any[]
    ).map((r) => JSON.parse(r.payload));
  }
  async observe(
    input: Omit<Method, 'id' | 'sources' | 'occurrences' | 'confirmed' | 'sourceKind'> & {
      confirmed: boolean;
    },
    policy: PublishPolicy,
  ) {
    const origin = this.store.conversation(input.sourceId);
    if (
      !this.store.project(input.projectId) ||
      !origin ||
      origin.incognito ||
      origin.projectId !== input.projectId
    )
      throw fail('Source project or conversation no longer available.');
    const row = this.store.db
      .prepare(
        'SELECT id,payload,status FROM maintenance_candidates WHERE projectId=? AND fingerprint=?',
      )
      .get(input.projectId, input.fingerprint) as any;
    if (row?.status === 'rejected') return;
    const prior: Method | undefined = row && JSON.parse(row.payload);
    const sources = (prior?.sources || []).filter(
      (s) =>
        s.id !== input.sourceId &&
        this.store.conversation(s.id) &&
        !this.store.conversation(s.id)?.incognito,
    );
    if (prior && prior.text !== input.text) for (const source of sources) source.confirmed = false;
    sources.push({
      id: input.sourceId,
      revision: input.sourceRevision,
      confirmed: input.confirmed,
    });
    const method: Method = {
      ...input,
      id: prior?.id || randomUUID(),
      sourceKind: 'method',
      sources,
      occurrences: sources.length,
      confirmed: sources.some((s) => s.confirmed),
    };
    const active = this.list(input.projectId).find((m) => m.id === method.id);
    const changed =
      active &&
      fingerprint([active.text, active.discovery, active.schemaRevision, active.dependencies]) !==
        fingerprint([method.text, method.discovery, method.schemaRevision, method.dependencies]);
    const eligible = method.confirmed || method.occurrences >= 3;
    let status = eligible ? 'draft' : 'observing';
    if (active && !changed) {
      this.write({ ...active, sources, occurrences: sources.length, confirmed: method.confirmed });
      status = 'published';
    }
    this.store.db
      .prepare(
        'INSERT INTO maintenance_candidates VALUES (?,?,?,?,?,?) ON CONFLICT(projectId,fingerprint) DO UPDATE SET payload=excluded.payload,status=excluded.status,at=excluded.at',
      )
      .run(
        method.id,
        method.projectId,
        method.fingerprint,
        status,
        JSON.stringify(method),
        new Date().toISOString(),
      );
    // Observations are bounded too; a long history must not create an unbounded hidden inbox.
    this.store.db
      .prepare(
        "DELETE FROM maintenance_candidates WHERE id IN (SELECT id FROM maintenance_candidates WHERE projectId=? AND json_extract(payload,'$.sourceKind')='method' AND status='observing' ORDER BY json_extract(payload,'$.occurrences') DESC,at DESC LIMIT -1 OFFSET 100)",
      )
      .run(method.projectId);
    if (
      status === 'draft' &&
      policy !== 'review' &&
      (!active || (policy === 'maintain' && !active.verified && input.confirmed))
    ) {
      // Changed rules require explicit confirmation even with automatic maintenance enabled.
      try {
        this.publish(method.id, false);
      } catch (error: any) {
        if (!error.message.startsWith('Memory is full')) throw error;
      }
    }
  }
  publish(id: string, verified: boolean) {
    const row = this.store.db
      .prepare("SELECT payload FROM maintenance_candidates WHERE id=? AND status='draft'")
      .get(id) as any;
    if (!row) throw fail('Draft no longer available.');
    const method: Method = JSON.parse(row.payload);
    if (!this.store.project(method.projectId)) throw fail('Project no longer exists.');
    const sources = method.sources.filter((s) => {
      const c = this.store.conversation(s.id);
      return (
        c &&
        !c.incognito &&
        c.projectId === method.projectId &&
        fingerprint(readSessionBranch(this.store.sessionFile(c.id)).map((e) => e.id)) === s.revision
      );
    });
    if (
      !sources.some((s) => s.id === method.sourceId) ||
      (!sources.some((s) => s.confirmed) && sources.length < 3)
    )
      throw fail(
        'Source conversation changed or was removed. Run maintenance again before publishing.',
      );
    const active = this.list(method.projectId),
      previous = active.find((m) => m.id === id);
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      if (!previous && active.length >= 30) {
        const weaker = active
          .filter((m) => !m.verified && !m.confirmed && m.occurrences < sources.length)
          .sort((a, b) => a.occurrences - b.occurrences || (a.uses || 0) - (b.uses || 0))[0];
        if (!weaker)
          throw fail('Memory is full. Forget an existing method before publishing this one.');
        this.store.db.prepare('DELETE FROM project_methods WHERE id=?').run(weaker.id);
        this.store.db
          .prepare("UPDATE maintenance_candidates SET status='retired' WHERE id=?")
          .run(weaker.id);
      }
      this.write({
        ...method,
        sources,
        occurrences: sources.length,
        confirmed: sources.some((s) => s.confirmed),
        verified,
        uses: previous?.uses || 0,
        lastUsed: previous?.lastUsed,
      });
      this.store.db
        .prepare("UPDATE maintenance_candidates SET status='published' WHERE id=?")
        .run(id);
      this.store.db.exec('COMMIT');
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
    return { id };
  }
  private write(method: Method) {
    this.store.db
      .prepare('INSERT OR REPLACE INTO project_methods VALUES (?,?,?,?)')
      .run(method.id, method.projectId, JSON.stringify(method), new Date().toISOString());
  }
  forget(id: string) {
    this.store.db.prepare('DELETE FROM project_methods WHERE id=?').run(id);
    // Tombstone prevents the same historical conversations from recreating forgotten methods.
    this.store.db.prepare("UPDATE maintenance_candidates SET status='rejected' WHERE id=?").run(id);
  }
  used(ids: string[]) {
    for (const m of this.list().filter((m) => ids.includes(m.id)))
      this.write({ ...m, uses: (m.uses || 0) + 1, lastUsed: new Date().toISOString() });
  }
  catalog(projectId: string, schemaRevision?: string, valid?: (method: Method) => boolean) {
    return this.list(projectId)
      .filter(
        (m) =>
          m.discovery.category !== 'query_recipe' ||
          (valid ? valid(m) : !!schemaRevision && m.schemaRevision === schemaRevision),
      )
      .map((m) => ({
        id: m.id,
        name: m.title,
        revision: fingerprint(m.text),
        text: m.text,
        description: m.discovery.description,
        tags: m.discovery.tags,
        aliases: m.discovery.aliases,
        verified: !!m.verified,
        method: true,
      }));
  }
}
