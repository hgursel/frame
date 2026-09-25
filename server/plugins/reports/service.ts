import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Store } from '../../store.js';
import { PythonRuntime, reportCommand } from '../../python.js';
import type { ChartsPlugin } from '../charts/service.js';
import { dataset, fail } from '../charts/data.js';
import { importQuery } from '../charts/sources.js';
import type { ReportProfile } from '../../../shared/reports.js';
import { reportMarkdown } from './markdown.js';
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const profileSchema = z
  .object({
    organization: z.string().max(120).default(''),
    label: z.string().max(80).default('REPORT'),
    primary: color.default('#173e48'),
    secondary: color.default('#3a716f'),
    accent: color.default('#bc8849'),
    template: z.enum(['executive', 'analytical', 'technical']).default('executive'),
    paper: z.enum(['letter', 'a4']).default('letter'),
    landscape: z.boolean().default(false),
    cover: z.boolean().default(true),
    footer: z.string().max(160).default(''),
    instructions: z.string().max(12000).default(''),
  })
  .strict();
const requestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().max(500).default(''),
    template: z.enum(['executive', 'analytical', 'technical']).optional(),
    blocks: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('markdown'), text: z.string().max(20000) }).strict(),
          z
            .object({
              type: z.literal('chart'),
              chartId: z.string().uuid(),
              caption: z.string().max(500).optional(),
            })
            .strict(),
          z
            .object({
              type: z.literal('table'),
              datasetId: z.string().uuid().optional(),
              source: importQuery.optional(),
              columns: z.array(z.string()).max(20).optional(),
              caption: z.string().max(500).optional(),
            })
            .strict(),
          z.object({ type: z.literal('page_break') }).strict(),
        ]),
      )
      .min(1)
      .max(40),
  })
  .strict();
type Stored = { enabled?: boolean; profile?: Partial<ReportProfile>; logo?: string | null };
export class ReportsPlugin {
  readonly jobs = new Map<string, AbortController>();
  private completions = new Map<string, Promise<void>>();
  private startJob(key: string) {
    if (this.jobs.has(key)) throw fail('A report operation is already running.', 409);
    const controller = new AbortController();
    let resolve!: () => void;
    this.completions.set(
      key,
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    this.jobs.set(key, controller);
    return {
      controller,
      finish: () => {
        this.jobs.delete(key);
        this.completions.delete(key);
        resolve();
      },
    };
  }
  constructor(
    readonly store: Store,
    readonly python: PythonRuntime,
    readonly charts: ChartsPlugin,
  ) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS report_settings (projectId TEXT PRIMARY KEY, data TEXT NOT NULL)',
    );
  }
  private stored(projectId?: string): Stored {
    const row = projectId
      ? (
          this.store.db
            .prepare('SELECT data FROM report_settings WHERE projectId=?')
            .get(projectId) as { data: string } | undefined
        )?.data
      : this.store.meta('reports:settings');
    return row ? JSON.parse(row) : {};
  }
  private save(value: Stored, projectId?: string) {
    if (projectId)
      this.store.db
        .prepare('INSERT OR REPLACE INTO report_settings VALUES (?,?)')
        .run(projectId, JSON.stringify(value));
    else this.store.setMeta('reports:settings', JSON.stringify(value));
  }
  enabled() {
    return this.stored().enabled === true;
  }
  projectEnabled(id: string) {
    return !!(
      this.store.db
        .prepare("SELECT enabled FROM project_plugins WHERE projectId=? AND plugin='reports'")
        .get(id) as any
    )?.enabled;
  }
  setProject(id: string, enabled: boolean) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO project_plugins VALUES (?,'reports',?)")
      .run(id, Number(enabled));
  }
  profile(projectId?: string) {
    return profileSchema.parse({
      ...this.stored().profile,
      ...(projectId ? this.stored(projectId).profile : {}),
    });
  }
  logo(projectId?: string) {
    const local = projectId ? this.stored(projectId).logo : undefined;
    return local !== undefined ? local : this.stored().logo || null;
  }
  async settings(projectId?: string) {
    return {
      enabled: this.enabled(),
      profile: this.profile(projectId),
      defaults: this.profile(),
      overrides: projectId ? this.stored(projectId).profile || {} : {},
      logo: this.logo(projectId),
      logoInherited: !!projectId && this.stored(projectId).logo === undefined,
      runtime: await this.python.status(),
    };
  }
  update(input: unknown, projectId?: string) {
    if (projectId) {
      const { overrides } = z
        .object({ overrides: z.record(z.string(), z.unknown()) })
        .strict()
        .parse(input);
      const validated = profileSchema.partial().parse(overrides);
      const selected = Object.fromEntries(
        Object.keys(overrides).map((key) => [key, validated[key as keyof ReportProfile]]),
      );
      this.save({ ...this.stored(projectId), profile: selected }, projectId);
    } else {
      const value = z
        .object({ enabled: z.boolean(), profile: profileSchema })
        .strict()
        .parse(input);
      this.save({ ...this.stored(), ...value });
    }
  }
  async uploadLogo(buffer: Buffer, projectId?: string) {
    if (buffer.length > 2 * 1024 * 1024) throw fail('Logo must be a PNG or JPEG up to 2 MiB.');
    const job = this.startJob(projectId || 'system');
    try {
      const result = await reportCommand(
        this.python.executable,
        { command: 'logo', image: buffer.toString('base64') },
        job.controller.signal,
      );
      job.controller.signal.throwIfAborted();
      this.save({ ...this.stored(projectId), logo: result.logo }, projectId);
    } finally {
      job.finish();
    }
  }
  clearLogo(projectId?: string, inherit = false) {
    const value = this.stored(projectId);
    if (inherit && projectId) delete value.logo;
    else value.logo = null;
    this.save(value, projectId);
  }
  requireConversation(id: string) {
    const c = this.store.conversation(id);
    if (!c) throw fail('Conversation not found.', 404);
    if (!this.enabled() || !this.projectEnabled(c.projectId))
      throw fail('Reports is disabled for this project.', 403);
    return c;
  }
  context(projectId: string) {
    const p = this.profile(projectId);
    return { organization: p.organization, template: p.template, instructions: p.instructions };
  }
  async sources(id: string, args: unknown) {
    this.requireConversation(id);
    const { kind, offset } = z
      .object({
        kind: z.enum(['chart', 'dataset', 'document', 'message', 'file']).default('chart'),
        offset: z.number().int().min(0).default(0),
      })
      .strict()
      .parse(args);
    if (kind === 'chart' || kind === 'dataset') {
      const table = kind === 'chart' ? 'charts' : 'chart_datasets';
      const rows = this.store.db
        .prepare(
          `SELECT id,data FROM ${table} WHERE conversationId=? ORDER BY rowid DESC LIMIT 21 OFFSET ?`,
        )
        .all(id, offset) as { id: string; data: string }[];
      return {
        sources: rows.slice(0, 20).map((r) => {
          const d = JSON.parse(r.data);
          return {
            kind,
            id: r.id,
            title: d.title,
            columns: (d.columns || [d.x, ...d.y]).slice(0, 40),
            rows: d.rows.length,
            truncated: d.truncated,
          };
        }),
        nextOffset: rows.length > 20 ? offset + 20 : null,
      };
    }
    return this.charts.sources.list(id, { kind, offset });
  }
  async create(id: string, args: unknown, signal?: AbortSignal) {
    const conversation = this.requireConversation(id);
    const spec = requestSchema.parse(args);
    const job = this.startJob(id);
    const controller = job.controller;
    const abort = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
    try {
      const blocks: any[] = [];
      for (const block of spec.blocks) {
        abort.throwIfAborted();
        if (block.type === 'markdown') blocks.push(...reportMarkdown(block.text));
        else if (block.type === 'chart')
          blocks.push({
            type: 'chart',
            chart: this.charts.get(id, block.chartId),
            caption: block.caption,
          });
        else if (block.type === 'table') {
          if (Number(!!block.datasetId) + Number(!!block.source) !== 1)
            throw fail('Choose exactly one table dataset or source.');
          let data;
          if (block.datasetId) {
            const row = this.store.db
              .prepare('SELECT data FROM chart_datasets WHERE id=? AND conversationId=?')
              .get(block.datasetId, id) as { data: string } | undefined;
            if (!row) throw fail('Table dataset not found in this conversation.', 404);
            data = dataset.parse(JSON.parse(row.data));
          } else data = await this.charts.sources.read(id, block.source);
          const columns = block.columns || data.columns;
          if (!columns.length || new Set(columns).size !== columns.length || columns.length > 20)
            throw fail('Select 1-20 distinct table columns.');
          const indices = columns.map((c) => {
            if (data.columns.filter((v) => v === c).length !== 1)
              throw fail('Table columns must exist exactly once.');
            return data.columns.indexOf(c);
          });
          if (data.rows.length > 1000)
            throw fail(
              'Report tables support up to 1,000 rows. Filter or summarize the source first.',
            );
          blocks.push({
            type: 'table',
            columns,
            rows: data.rows.map((r) => indices.map((i) => r[i])),
            caption: block.caption,
            notices: [
              ...(data.notices || []),
              ...(data.truncated ? ['Partial source: only returned rows are included.'] : []),
            ],
          });
        } else blocks.push(block);
      }
      if (blocks.length > 500 || blocks.reduce((n, b) => n + (b.rows?.length || 0), 0) > 3000)
        throw fail('Report exceeds 500 blocks or 3,000 total table rows.');
      const payload = {
        command: 'render',
        title: spec.title,
        subtitle: spec.subtitle,
        profile: {
          ...this.profile(conversation.projectId),
          ...(spec.template ? { template: spec.template } : {}),
        },
        logo: this.logo(conversation.projectId),
        blocks,
      };
      if (Buffer.byteLength(JSON.stringify(payload)) > 3_000_000)
        throw fail('Report content exceeds 3 MB. Shorten or summarize it.');
      const result = await reportCommand(this.python.executable, payload, abort);
      abort.throwIfAborted();
      this.requireConversation(id);
      const buffer = Buffer.from(result.pdf, 'base64');
      const root = this.store.artifacts(conversation);
      await mkdir(root, { recursive: true, mode: 0o700 });
      if ((await realpath(root)) !== root) throw fail('Artifact directory has been replaced.', 409);
      const name = `report-${randomUUID()}.pdf`,
        temporary = path.join(root, `.report-${randomUUID()}`);
      try {
        await writeFile(temporary, buffer, { mode: 0o600, flag: 'wx' });
        abort.throwIfAborted();
        await link(temporary, path.join(root, name));
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return {
        name,
        bytes: buffer.length,
        pages: result.pages,
        message: 'PDF ready in conversation downloads.',
      };
    } finally {
      job.finish();
    }
  }
  async sample(projectId?: string, template?: string) {
    const key = projectId || 'system';
    const job = this.startJob(key);
    const controller = job.controller;
    try {
      return await reportCommand(
        this.python.executable,
        {
          command: 'render',
          title: 'Quarterly operations review',
          subtitle: 'A sample of your saved report design',
          profile: { ...this.profile(projectId), ...(template ? { template } : {}) },
          logo: this.logo(projectId),
          blocks: [
            ...reportMarkdown(
              '## Executive summary\n\nOperations improved this quarter. **This sample contains fictional data.** Your report instructions guide the model when creating real reports.\n\n> Focus: sustain service quality while reducing response time.\n\n## Findings\n\n- Service availability exceeded the target.\n- Response times improved across both regions.\n- Review capacity before the next planning cycle.',
            ),
            {
              type: 'chart',
              chart: {
                title: 'Completed requests',
                kind: 'bar',
                x: 'Region',
                y: ['Requests'],
                rows: [
                  ['North', 180],
                  ['South', 140],
                  ['West', 210],
                ],
                notices: [],
              },
            },
            {
              type: 'table',
              columns: ['Region', 'Requests', 'Status'],
              rows: [
                ['North', 180, 'On target'],
                ['South', 140, 'Review capacity'],
                ['West', 210, 'On target'],
              ],
            },
            ...reportMarkdown(
              '## Recommendations\n\n1. Validate the findings with service owners.\n2. Prioritize the two highest-impact improvements.\n3. Review progress at the next monthly meeting.\n\n### Implementation notes\n\nRecord the baseline, owner, and review date for each action.\n\n```text\nreview_status: planned\nowner: operations\n```',
            ),
          ],
        },
        controller.signal,
      );
    } finally {
      job.finish();
    }
  }
  busy(projectId?: string) {
    return (
      this.jobs.size > 0 &&
      (!projectId ||
        this.jobs.has('system') ||
        this.jobs.has(projectId) ||
        [...this.jobs.keys()].some((id) => this.store.conversation(id)?.projectId === projectId))
    );
  }
  async close() {
    for (const job of this.jobs.values()) job.abort();
    await Promise.all(this.completions.values());
  }
}
