import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { appFixture } from './helpers.js';
import { OkfImport } from '../server/okf-import.js';

const generic = (pages: Record<string, string>) =>
  Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries({
          'index.md': '---\nokf_version: "0.2"\n---\n# Knowledge\n',
          ...pages,
        }).map(([name, text]) => [name, strToU8(text)]),
      ),
    ),
  );

test('OKF round trip restores pages, sources, discovery metadata and history; updates retain old revisions', async () => {
  const f = await appFixture('okf-roundtrip');
  await f.signIn();
  try {
    const source = f.store.createProject({ name: 'Source', instructions: '', toolsEnabled: true });
    const target = f.store.createProject({ name: 'Target', instructions: '', toolsEnabled: true });
    const note = await f.knowledge.add(
      source.id,
      'Note.md',
      Buffer.from('# First version'),
      'wiki',
    );
    await f.wiki.record(source.id, note.id, {
      discovery: {
        description: 'Operating guide',
        tags: ['ops'],
        aliases: ['guide'],
        category: 'procedure',
      },
    });
    await f.knowledge.edit(source.id, note.id, note.revision, '# Second version');
    await f.wiki.record(source.id, note.id);
    const csv = await f.knowledge.add(source.id, 'Rows.csv', Buffer.from('name,value\na,1\n'));
    await f.wiki.record(source.id, csv.id);
    const bundle = await f.wiki.export(source.id);
    const importer = new OkfImport(f.wiki);
    const preview = await importer.preview(target.id, bundle);
    assert.deepEqual(preview.counts, { add: 2, update: 0, skip: 0 });
    assert.equal(f.knowledge.list(target.id).length, 0, 'preview is read-only');
    await importer.apply(target.id, bundle, preview.fingerprint);
    const docs = f.knowledge.list(target.id);
    const imported = docs.find((d) => d.name === 'Note.md')!;
    assert.notEqual(imported.id, note.id, 'project identities cannot collide');
    assert.equal((await f.knowledge.read(target.id, imported.id)).text, '# Second version');
    assert.deepEqual(f.wiki.metadata(imported.id).frame.tags, ['ops']);
    assert(f.wiki.revisions(target.id, imported.id).some((r) => r.content === '# First version'));
    const rows = docs.find((d) => d.name === 'Rows.csv')!;
    assert.equal(rows.kind, 'upload');
    assert.equal(
      await readFile(path.join(f.knowledge.directory(rows), 'source.csv'), 'utf8'),
      'name,value\na,1\n',
    );
    assert.equal((await importer.preview(target.id, bundle)).counts.skip, 2);
    assert.equal((await importer.preview(source.id, bundle)).counts.skip, 2);
    const current = await f.knowledge.read(source.id, note.id);
    await f.knowledge.edit(source.id, note.id, current.revision, '# Third version');
    await f.wiki.record(source.id, note.id);
    const updated = await f.wiki.export(source.id);
    const changes = await importer.preview(target.id, updated);
    assert.deepEqual(changes.counts, { add: 0, update: 1, skip: 1 });
    await importer.apply(target.id, updated, changes.fingerprint);
    assert.equal((await f.knowledge.read(target.id, imported.id)).text, '# Third version');
    assert(f.wiki.revisions(target.id, imported.id).some((r) => r.content === '# Second version'));
    assert.equal((await importer.preview(target.id, updated)).counts.skip, 2);
  } finally {
    await f.cleanup();
  }
});

test('OKF rejects unsafe archives and stale previews; failures roll back documents and history', async () => {
  const f = await appFixture('okf-validation');
  await f.signIn();
  try {
    const p = f.store.projects()[0]!;
    const importer = new OkfImport(f.wiki);
    const bundle = generic({ 'guide.md': '---\ntitle: Guide\n---\n\nOriginal guide' });
    let preview = await importer.preview(p.id, bundle);
    await importer.apply(p.id, bundle, preview.fingerprint);
    const doc = f.knowledge.list(p.id)[0]!;
    const update = generic({
      'guide.md': '---\ntitle: Guide\n---\n\nUpdated guide',
      'new.md': 'New page',
    });
    preview = await importer.preview(p.id, update);
    await f.knowledge.edit(p.id, doc.id, doc.revision, 'Local edit');
    await f.wiki.record(p.id, doc.id);
    await assert.rejects(
      importer.apply(p.id, update, preview.fingerprint),
      /Preview the import again/,
    );
    preview = await importer.preview(p.id, update);
    const revisions = f.wiki.revisions(p.id, doc.id);
    const sync = f.wiki.sync.bind(f.wiki);
    let calls = 0;
    f.wiki.sync = async (id) => {
      if (!calls++) throw new Error('simulated index write failure');
      return sync(id);
    };
    await assert.rejects(importer.apply(p.id, update, preview.fingerprint), /simulated/);
    assert.equal(f.knowledge.list(p.id).length, 1);
    assert.equal((await f.knowledge.read(p.id, doc.id)).text, 'Local edit');
    assert.deepEqual(f.wiki.revisions(p.id, doc.id), revisions);
    for (const [filename, value] of [
      ['../escape.md', 'bad'],
      ['/absolute.md', 'bad'],
      ['x\\y.md', 'bad'],
      ['page.md', '---\ntitle: [broken\n---\nbody'],
    ])
      await assert.rejects(importer.preview(p.id, generic({ [filename!]: value! })));
    await assert.rejects(importer.preview(p.id, Buffer.from('invalid archive')), /readable OKF/);
    const bytes = unzipSync(bundle);
    bytes['huge.md'] = new Uint8Array(11 * 1024 * 1024);
    await assert.rejects(importer.preview(p.id, Buffer.from(zipSync(bytes))), /size limits/);
    assert.equal(f.knowledge.list(p.id).length, 1);
  } finally {
    await f.cleanup();
  }
});

test('OKF import API requires authentication and ownership and confirms the exact preview', async () => {
  const f = await appFixture('okf-api');
  await f.signIn();
  try {
    const project = f.store.projects()[0]!;
    const buffer = generic({ 'hello.md': '# Hello' });
    const boundary = 'frame-okf-boundary';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="knowledge.zip"\r\nContent-Type: application/zip\r\n\r\n`,
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const send = (cookie: string, query = '') =>
      f.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/knowledge/import${query}`,
        headers: {
          host: '127.0.0.1:3000',
          cookie,
          origin: 'http://127.0.0.1:3000',
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
    assert.equal((await send('')).statusCode, 401);
    const preview = await send(f.token);
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(f.knowledge.list(project.id).length, 0);
    const applied = await send(f.token, `?fingerprint=${preview.json().fingerprint}`);
    assert.equal(applied.statusCode, 200, applied.body);
    assert.equal(f.knowledge.list(project.id).length, 1);
    f.store.createUser('other', 'other-password-12345', 'user', false);
    const login = await f.call('/auth/login', 'POST', {
      username: 'other',
      password: 'other-password-12345',
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.equal((await send(cookie)).statusCode, 404);
  } finally {
    await f.cleanup();
  }
});

test('external OKF links and source references remap and operational metadata stays inert', async () => {
  const f = await appFixture('okf-links');
  await f.signIn();
  try {
    const project = f.store.projects()[0]!;
    const importer = new OkfImport(f.wiki);
    const buffer = generic({
      'guide.md':
        '---\ntitle: Guide\nsources:\n  - resource: other.md\nframe:\n  tags: [guide]\n  maintenance:\n    sourceConversation: foreign-session\n---\n\n[Other](other.md#details)',
      'other.md': '---\ntitle: Other\n---\n\n## Details\nReference',
    });
    const preview = await importer.preview(project.id, buffer);
    await importer.apply(project.id, buffer, preview.fingerprint);
    const docs = f.knowledge.list(project.id);
    const guide = docs.find((d) => d.name === 'Guide.md')!;
    const other = docs.find((d) => d.name === 'Other.md')!;
    assert.equal(
      (await f.knowledge.read(project.id, guide.id)).text,
      `[Other](${other.id}.md#details)`,
    );
    const metadata = f.wiki.metadata(guide.id);
    assert.equal(metadata.sources[0].resource, `/${other.id}.md`);
    assert.equal(metadata.frame.maintenance, undefined);
    assert.equal(metadata.frame.imported_maintenance.sourceConversation, 'foreign-session');
    assert.equal((await importer.preview(project.id, buffer)).counts.skip, 2);
  } finally {
    await f.cleanup();
  }
});
