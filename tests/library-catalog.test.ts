import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { appFixture, origin } from './helpers.js';
import { downloadCatalog } from '../server/library/download-catalog.js';

test('catalog metadata matches every published download without shipping guide text', async () => {
  const catalog = JSON.parse(
    await readFile(new URL('../knowledge-packs/catalog.json', import.meta.url), 'utf8'),
  );
  assert.equal(downloadCatalog.length, 36);
  for (const entry of downloadCatalog) {
    const { pages, jurisdiction, ...metadata } = entry;
    assert.deepEqual(
      metadata,
      catalog.packs.find((p: any) => p.id === entry.id),
    );
    const data = await readFile(new URL(`../knowledge-packs/${entry.file}`, import.meta.url));
    assert.equal(data.length, entry.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
    const pack = JSON.parse(data.toString());
    assert.deepEqual(jurisdiction, pack.jurisdiction);
    assert.deepEqual(
      pages,
      pack.pages.map(({ id, title, description, tags }: any) => ({ id, title, description, tags })),
    );
    assert(pages.every((p) => !('text' in p)));
  }
});

test('catalog browsing is offline; verified downloads and installation are explicit and separate from attachment', async () => {
  const entry = downloadCatalog.find((p) => p.collection === 'Federal core')!;
  const data = await readFile(new URL(`../knowledge-packs/${entry.file}`, import.meta.url));
  let calls = 0;
  let mode = 'ok';
  const f = await appFixture('library-downloads', {
    libraryFetch: async (input, init) => {
      calls++;
      assert.equal(
        String(input),
        `https://raw.githubusercontent.com/hgursel/frame/main/knowledge-packs/${entry.file}`,
      );
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert(init?.signal instanceof AbortSignal);
      assert.deepEqual(init?.headers, { Accept: 'application/json' });
      assert.equal(init?.body, undefined);
      if (mode === 'offline') throw new TypeError('Private network error details');
      if (mode === 'http') return new Response('Missing', { status: 404 });
      if (mode === 'oversize') return new Response(Buffer.concat([data, Buffer.from('x')]));
      if (mode === 'bad-length')
        return new Response(data, { headers: { 'Content-Length': String(data.length + 1) } });
      if (mode === 'truncated') return new Response(data.subarray(0, data.length - 1));
      if (mode === 'changed')
        return new Response(Buffer.from(data.toString().replace('guide', 'Guide')));
      return new Response(data);
    },
  });
  const endpoint = `/library/downloads/${entry.id}/${entry.version}`;
  try {
    assert.equal(calls, 0);
    assert.equal((await f.call('/library/downloads')).statusCode, 401);
    assert.equal((await f.call(`${endpoint}/install`, 'POST')).statusCode, 401);
    await f.signIn();
    const project = f.store.createProject({
      name: 'References',
      instructions: '',
      toolsEnabled: false,
    });
    const catalog = await f.auth('/library/downloads');
    assert.equal(catalog.statusCode, 200);
    assert.equal(catalog.json().length, 36);
    assert(catalog.json().every((p: any) => !p.installed));
    assert.equal(
      (await f.auth('/library/downloads/unknown/1.0.0/install', 'POST')).statusCode,
      404,
    );
    assert.equal(
      (await f.auth(`/library/downloads/${entry.id}/9.0.0/install`, 'POST')).statusCode,
      404,
    );
    for (const requestOrigin of [undefined, 'https://untrusted.example']) {
      const blocked = await f.app.inject({
        method: 'POST',
        url: `/api${endpoint}/install`,
        headers: {
          host: new URL(origin).host,
          cookie: f.token,
          ...(requestOrigin ? { origin: requestOrigin } : {}),
        },
      });
      assert.equal(blocked.statusCode, 403);
    }
    assert.equal(calls, 0, 'unauthorized requests, browsing, and invalid IDs never fetch');
    const bundled = downloadCatalog.find((p) => p.type === 'bundled-brief')!;
    assert.equal(
      (await f.auth(`/library/downloads/${bundled.id}/${bundled.version}/download`, 'POST'))
        .statusCode,
      200,
    );
    assert.equal(calls, 0, 'bundled downloads work offline');
    const result = await f.auth(`${endpoint}/download`, 'POST');
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.rawPayload, data);
    assert.match(String(result.headers['content-disposition']), /attachment/);
    assert.equal(f.library.installed().length, 0, 'download does not install');
    for (mode of ['offline', 'http', 'oversize', 'bad-length', 'truncated', 'changed']) {
      const failed = await f.auth(`${endpoint}/install`, 'POST');
      assert.equal(failed.statusCode, 502, mode);
      assert(!failed.body.includes('Private network'));
      assert.equal(f.library.installed().length, 0);
    }
    mode = 'ok';
    assert.equal((await f.auth(`${endpoint}/install`, 'POST')).statusCode, 200);
    assert.equal(f.library.installed().length, 1);
    assert.equal(f.library.attachments(project.id).length, 0, 'install does not attach');
    assert(
      (await f.auth('/library/downloads')).json().find((p: any) => p.id === entry.id).installed,
    );
    assert.equal((await f.auth(`${endpoint}/install`, 'POST')).statusCode, 200);
    assert.equal(f.library.installed().length, 1, 'repeated install is idempotent');
  } finally {
    await f.cleanup();
  }
});

test('catalog installation cannot overwrite a conflicting imported version', async () => {
  const entry = downloadCatalog.find((p) => p.collection === 'Federal core')!;
  const data = await readFile(new URL(`../knowledge-packs/${entry.file}`, import.meta.url));
  const f = await appFixture('library-download-conflict', {
    libraryFetch: async () => new Response(data),
  });
  try {
    await f.signIn();
    f.library.install({ ...JSON.parse(data.toString()), title: 'Existing imported version' });
    const response = await f.auth(
      `/library/downloads/${entry.id}/${entry.version}/install`,
      'POST',
    );
    assert.equal(response.statusCode, 409);
    assert.equal(f.library.get(entry.id, entry.version).title, 'Existing imported version');
  } finally {
    await f.cleanup();
  }
});
