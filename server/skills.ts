import { statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadSkillsFromDir } from '@earendil-works/pi-coding-agent';
import type { Store } from './store.js';
import type { ProjectSkills, SkillEntry, SkillsCatalog, SkillsSettings } from '../shared/skills.js';

const settingsSchema = z
  .object({
    folders: z
      .array(
        z
          .string()
          .trim()
          .max(4096)
          .refine(
            (v) => path.isAbsolute(v) && !v.includes('\0'),
            'Skill folders must be absolute local paths.',
          )
          .transform((v) => path.resolve(v)),
      )
      .max(20)
      .refine((v) => new Set(v).size === v.length, 'Skill folders must be unique.'),
  })
  .strict();

/**
 * Agent Skills folders (SKILL.md + scripts) loaded with Pi's own loader.
 * Frame only lists skills; the model reads and runs them with trusted host tools.
 */
export class Skills {
  constructor(readonly store: Store) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS project_skills (projectId TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(projectId, name))',
    );
  }
  settings(): SkillsSettings {
    return settingsSchema.parse(JSON.parse(this.store.meta('skills:settings') || '{"folders":[]}'));
  }
  /** Saving records paths and scans skill metadata; nothing is executed or installed. */
  save(value: unknown) {
    this.store.setMeta('skills:settings', JSON.stringify(settingsSchema.parse(value)));
    return this.catalog();
  }
  /** Rescans on every call so edits to skill folders apply to the next turn. */
  catalog(): SkillsCatalog {
    const { folders } = this.settings();
    const skills: SkillEntry[] = [];
    const warnings: string[] = [];
    for (const folder of folders) {
      try {
        if (!statSync(folder).isDirectory()) throw new Error();
      } catch {
        warnings.push(`${folder}: folder not found or not readable by Frame.`);
        continue;
      }
      const found = loadSkillsFromDir({ dir: folder, source: 'frame' });
      for (const d of found.diagnostics) warnings.push(`${d.path || folder}: ${d.message}`);
      for (const s of found.skills) {
        const first = skills.find((e) => e.name === s.name);
        if (first) {
          warnings.push(
            `${s.filePath}: skill "${s.name}" is already loaded from ${first.filePath}.`,
          );
          continue;
        }
        skills.push({
          name: s.name,
          description: s.description,
          folder,
          filePath: s.filePath,
          baseDir: s.baseDir,
          modelInvocation: !s.disableModelInvocation,
        });
      }
    }
    return { folders, skills, warnings };
  }
  enabled(projectId: string) {
    return (
      this.store.db
        .prepare('SELECT name FROM project_skills WHERE projectId=? ORDER BY name')
        .all(projectId) as { name: string }[]
    ).map((r) => r.name);
  }
  setProject(projectId: string, names: string[]) {
    const unique = [...new Set(z.array(z.string().min(1).max(200)).max(200).parse(names))];
    const available = new Set(this.catalog().skills.map((s) => s.name));
    const missing = unique.filter((name) => !available.has(name));
    if (missing.length)
      throw Object.assign(
        new Error(
          `Skills no longer available: ${missing.join(', ')}. Rescan and update the selection.`,
        ),
        { statusCode: 400 },
      );
    this.store.db.exec('BEGIN');
    try {
      this.store.db.prepare('DELETE FROM project_skills WHERE projectId=?').run(projectId);
      const insert = this.store.db.prepare('INSERT INTO project_skills VALUES (?, ?)');
      for (const name of unique) insert.run(projectId, name);
      this.store.db.exec('COMMIT');
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }
  project(projectId: string): ProjectSkills {
    return {
      enabled: this.enabled(projectId),
      hostTools: !!this.store.project(projectId)?.toolsEnabled,
      skills: this.catalog().skills,
    };
  }
  /** Skills passed to the worker; renamed or removed skills silently drop out. */
  context(projectId: string) {
    const enabled = new Set(this.enabled(projectId));
    if (!enabled.size) return [];
    return this.catalog().skills.filter((s) => enabled.has(s.name));
  }
}

export function skillsApi(app: FastifyInstance, skills: Skills) {
  const project = (id: string) => {
    z.string().uuid().parse(id);
    if (!skills.store.project(id))
      throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
    return id;
  };
  app.get('/api/skills', () => skills.catalog());
  app.put('/api/skills', (req) => skills.save(req.body));
  app.get<{ Params: { id: string } }>('/api/projects/:id/skills', (req) =>
    skills.project(project(req.params.id)),
  );
  app.put<{ Params: { id: string } }>('/api/projects/:id/skills', (req) => {
    const id = project(req.params.id);
    skills.setProject(
      id,
      z
        .object({ enabled: z.array(z.string()) })
        .strict()
        .parse(req.body).enabled,
    );
    return skills.project(id);
  });
}
