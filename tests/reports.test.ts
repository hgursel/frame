import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir, readdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { reportMarkdown } from '../server/plugins/reports/markdown.js';
import { reportCommand } from '../server/python.js';
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-reports-'));
  const ctx = await createApp({
    dataDir: root,
    origin: 'http://127.0.0.1:3000',
    setupToken: 'test',
  });
  const req = (url: string, method = 'GET', payload?: unknown, cookie = '') =>
    ctx.app.inject({
      url: '/api' + url,
      method: method as any,
      payload: payload as any,
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', cookie },
    });
  await req('/auth/setup', 'POST', { token: 'test', password: 'test-password-12345' });
  const login = await req('/auth/login', 'POST', { password: 'test-password-12345' });
  const cookie = String(login.headers['set-cookie']).split(';')[0]!;
  const auth = (url: string, method = 'GET', payload?: unknown) =>
    req(url, method, payload, cookie);
  const project = ctx.store.createProject({
    name: 'Reports',
    instructions: '',
    toolsEnabled: false,
  });
  const conversation = ctx.store.createConversation(project.id);
  return {
    ...ctx,
    root,
    project,
    conversation,
    req,
    auth,
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { force: true, recursive: true });
    },
  };
}
const info = (python: string, file: string) =>
  JSON.parse(
    execFileSync(
      python,
      [
        '-c',
        'import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({"pages":len(r.pages),"text":"\\n".join(p.extract_text() for p in r.pages)}))',
        file,
      ],
      { encoding: 'utf8' },
    ),
  );

test(
  'Reports settings are authenticated, inherit per field, preserve plugin switches, and normalize logos',
  { skip: !process.env.FRAME_PYTHON },
  async () => {
    const f = await fixture();
    try {
      assert.equal((await f.req('/plugins/reports')).statusCode, 401);
      assert.equal((await f.req('/plugins/reports/sample', 'POST', {})).statusCode, 401);
      const base = f.reports.profile();
      assert.equal(f.reports.enabled(), false);
      assert.equal(
        (
          await f.auth('/plugins/reports', 'PUT', {
            enabled: true,
            profile: { ...base, organization: 'Frame Labs', footer: 'Internal' },
          })
        ).statusCode,
        200,
      );
      const url = `/projects/${f.project.id}/reports`;
      assert.equal(
        (await f.auth(url, 'PUT', { overrides: { accent: '#884422' } })).statusCode,
        200,
      );
      assert.equal(f.reports.profile(f.project.id).organization, 'Frame Labs');
      assert.deepEqual((await f.auth(url)).json().overrides, { accent: '#884422' });
      f.reports.update({
        enabled: true,
        profile: { ...f.reports.profile(), organization: 'Updated Labs' },
      });
      assert.equal(f.reports.profile(f.project.id).organization, 'Updated Labs');
      await f.auth(url, 'PUT', { overrides: {} });
      assert.equal(f.reports.profile(f.project.id).accent, base.accent);
      assert.equal(
        (await f.auth(url, 'PUT', { overrides: { primary: 'red', script: 'run' } })).statusCode,
        400,
      );
      f.charts.setProject(f.project.id, true);
      await f.auth(`/projects/${f.project.id}/plugins`, 'PUT', { reports: true });
      assert(f.reports.projectEnabled(f.project.id));
      assert(f.charts.projectEnabled(f.project.id));
      const png = execFileSync(f.python.executable, [
        '-c',
        'from PIL import Image; import sys; im=Image.new("RGB",(600,180),(23,62,72)); im.save(sys.stdout.buffer,"PNG")',
      ]);
      await f.reports.uploadLogo(png);
      assert(f.reports.logo(f.project.id));
      await assert.rejects(f.reports.uploadLogo(Buffer.from('<svg onload="alert(1)"></svg>')));
      f.reports.clearLogo(f.project.id);
      assert.equal(f.reports.logo(f.project.id), null);
      f.reports.clearLogo(f.project.id, true);
      assert.equal(f.reports.logo(f.project.id), f.reports.logo());
      await f.auth(`/projects/${f.project.id}`, 'DELETE', { confirm: true });
      assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM report_settings').get()!.n, 0);
    } finally {
      await f.cleanup();
    }
  },
);

test(
  'all Reports layouts render branded PDFs with tables/charts and no markup leakage',
  { timeout: 60000, skip: !process.env.FRAME_PYTHON },
  async () => {
    const f = await fixture();
    try {
      f.reports.update({
        enabled: true,
        profile: {
          ...f.reports.profile(),
          organization: 'FRAME LABS',
          footer: 'Operations / Internal',
        },
      });
      const qa = process.env.FRAME_REPORT_QA;
      if (qa) await mkdir(qa, { recursive: true });
      for (const template of ['executive', 'analytical', 'technical']) {
        const result = await f.reports.sample(undefined, template);
        const file = path.join(qa || f.root, `${template}.pdf`);
        await writeFile(file, Buffer.from(result.pdf, 'base64'));
        const pdf = info(f.python.executable, file);
        assert(pdf.pages >= 2 && pdf.pages <= 5);
        assert.match(pdf.text, /FRAME LABS/);
        assert.match(pdf.text, /Recommendations/);
        assert.match(pdf.text, /Completed requests/);
        assert.match(pdf.text, /210/);
        assert(!pdf.text.includes('**'));
        assert(!pdf.text.includes('<b>'));
      }
      assert.equal(
        (await f.auth('/plugins/reports/sample', 'POST', {})).headers['content-type'],
        'application/pdf',
      );
      const logo = execFileSync(f.python.executable, [
        '-c',
        'from PIL import Image,ImageDraw; import sys; im=Image.new("RGB",(360,100),"white"); d=ImageDraw.Draw(im); d.rectangle((0,0,80,99),fill="#173e48"); d.text((110,40),"FRAME LABS",fill="#173e48"); im.save(sys.stdout.buffer,"PNG")',
      ]);
      await f.reports.uploadLogo(logo);
      f.reports.update({
        enabled: true,
        profile: { ...f.reports.profile(), paper: 'a4', landscape: true },
      });
      const landscape = await f.reports.sample();
      const landscapePath = path.join(qa || f.root, 'landscape-logo.pdf');
      await writeFile(landscapePath, Buffer.from(landscape.pdf, 'base64'));
      const dimensions = JSON.parse(
        execFileSync(
          f.python.executable,
          [
            '-c',
            'import json,sys; from pypdf import PdfReader; p=PdfReader(sys.argv[1]).pages[0]; print(json.dumps([float(p.mediabox.width),float(p.mediabox.height),len(p.images)]))',
            landscapePath,
          ],
          { encoding: 'utf8' },
        ),
      );
      assert(dimensions[0] > dimensions[1]);
      assert.equal(dimensions[2], 1);
      const escaped = reportMarkdown(
        '**Bold** and <img src="http://127.0.0.1/private">\n\n```text\n<unsafe>\n```',
      );
      assert(JSON.stringify(escaped).includes('&lt;img'));
      assert(!JSON.stringify(escaped).includes('<img'));
    } finally {
      await f.cleanup();
    }
  },
);

test('stopping an active report kills the renderer and publishes no artifact', async () => {
  const f = await fixture();
  try {
    // A controlled renderer keeps this race test deterministic and avoids relying on PDF size.
    const executable = path.join(f.root, 'slow-renderer');
    await writeFile(executable, '#!/bin/sh\nexec sleep 60\n');
    await chmod(executable, 0o700);
    const { ReportsPlugin } = await import('../server/plugins/reports/service.js');
    const runtime = Object.create(f.python);
    Object.defineProperty(runtime, 'executable', { value: executable });
    const slow = new ReportsPlugin(f.store, runtime, f.charts);
    slow.update({ enabled: true, profile: slow.profile() });
    slow.setProject(f.project.id, true);
    const controller = new AbortController();
    const pending = slow.create(
      f.conversation.id,
      {
        title: 'Canceled report',
        blocks: [{ type: 'markdown', text: 'Do not publish.' }],
      },
      controller.signal,
    );
    const rejected = assert.rejects(pending);
    assert(slow.busy(f.project.id));
    controller.abort();
    await rejected;
    await slow.close();
    assert.equal(slow.jobs.size, 0);
    const files = await readdir(f.store.artifacts(f.conversation)).catch(() => []);
    assert.equal(files.filter((name) => name.endsWith('.pdf')).length, 0);
  } finally {
    await f.cleanup();
  }
});

test(
  'Reports reference scoped data without MSSQL or host tools, paginate wide tables, and keep revisions',
  { timeout: 60000, skip: !process.env.FRAME_PYTHON },
  async () => {
    const f = await fixture();
    try {
      const id = f.conversation.id;
      f.reports.update({
        enabled: true,
        profile: { ...f.reports.profile(), cover: false, template: 'analytical' },
      });
      f.reports.setProject(f.project.id, true);
      const doc = await f.knowledge.add(
        f.project.id,
        'source.csv',
        Buffer.from('Region,Total\nNorth,12\nSouth,8'),
      );
      const first = await f.reports.create(id, {
        title: 'Regional analysis',
        blocks: [
          { type: 'markdown', text: '## Findings\n\n**North** is larger.' },
          { type: 'table', source: { kind: 'document', id: doc.id } },
        ],
      });
      const second = await f.reports.create(id, {
        title: 'Regional analysis revised',
        blocks: [{ type: 'table', source: { kind: 'document', id: doc.id } }],
      });
      assert.notEqual(first.name, second.name);
      const file = path.join(f.store.artifacts(f.conversation), first.name);
      assert.match(info(f.python.executable, file).text, /North/);
      assert.equal((await f.req(`/conversations/${id}/artifacts/${first.name}`)).statusCode, 401);
      assert.equal((await f.auth(`/conversations/${id}/artifacts/${first.name}`)).statusCode, 200);
      // A saved chart can be included even after Charts has been disabled.
      f.store.setMeta('charts:enabled', 'true');
      f.charts.setProject(f.project.id, true);
      const datasetId = f.charts.capture(id, randomUUID(), 'Dev', {
        columns: ['x', 'y'],
        rows: [
          [1, 3],
          [2, 5],
          [3, 2],
        ],
        truncated: true,
        affected: 0,
      })!;
      const refs = ['bar', 'line', 'pie', 'scatter'].map((kind) =>
        f.charts.create(id, {
          datasetId,
          title: kind + ' results',
          kind,
          x: 'x',
          y: ['y'],
          donut: kind === 'pie',
        }),
      );
      f.charts.setProject(f.project.id, false);
      const charts = await f.reports.create(id, {
        title: 'Charts',
        blocks: refs.map((ref) => ({ type: 'chart', chartId: ref.id })),
      });
      const chartPdf = info(
        f.python.executable,
        path.join(f.store.artifacts(f.conversation), charts.name),
      );
      assert.match(chartPdf.text, /Partial|partial|limit/);
      assert.match(chartPdf.text, /scatter results/);
      const other = f.store.createConversation(f.project.id);
      await assert.rejects(
        f.reports.create(other.id, {
          title: 'Wrong source',
          blocks: [{ type: 'chart', chartId: refs[0].id }],
        }),
        /not found/,
      );
      await assert.rejects(
        f.reports.create(other.id, {
          title: 'Wrong dataset',
          blocks: [{ type: 'table', datasetId }],
        }),
        /not found/,
      );
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        f.reports.create(
          id,
          { title: 'Stopped', blocks: [{ type: 'markdown', text: 'never publish' }] },
          controller.signal,
        ),
      );
      assert.equal(f.reports.jobs.size, 0);
      const names = await readdir(f.store.artifacts(f.conversation));
      assert.equal(names.filter((n) => n.endsWith('.pdf')).length, 3);
      const wide = await reportCommand(f.python.executable, {
        command: 'render',
        title: 'Wide table',
        profile: f.reports.profile(),
        blocks: [
          {
            type: 'table',
            columns: Array.from({ length: 12 }, (_, i) => `Column ${i}`),
            rows: Array.from({ length: 80 }, (_, r) =>
              Array.from({ length: 12 }, (_, c) => `R${r}C${c}`),
            ),
          },
        ],
      });
      const widePath = path.join(process.env.FRAME_REPORT_QA || f.root, 'wide.pdf');
      await writeFile(widePath, Buffer.from(wide.pdf, 'base64'));
      const widePdf = info(f.python.executable, widePath);
      assert(widePdf.pages > 3);
      assert.match(widePdf.text, /R79C11/);
      assert.match(widePdf.text, /part 3 of 3/);
      if (process.env.FRAME_REPORT_QA)
        await writeFile(
          path.join(process.env.FRAME_REPORT_QA, 'charts.pdf'),
          Buffer.from(await readFile(path.join(f.store.artifacts(f.conversation), charts.name))),
        );
      f.reports.setProject(f.project.id, false);
      await assert.rejects(
        f.reports.create(id, { title: 'Disabled', blocks: [{ type: 'markdown', text: 'No' }] }),
        /disabled/,
      );
    } finally {
      await f.cleanup();
    }
  },
);
