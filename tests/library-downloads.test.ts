import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { detailedPacks, federalPacks, sectorPacks } from '../knowledge-packs/src/index.js';
import { appFixture } from './helpers.js';
import { knowledgeContext, readKnowledge, searchKnowledge } from '../server/knowledge-discovery.js';

test('published packs match checksums, import without attachment, and keep existing versions intact', async () => {
  const f = await appFixture('pack-downloads');
  try {
    await f.signIn();
    const p = f.store.createProject({ name: 'Guides', instructions: '', toolsEnabled: false });
    const catalog = JSON.parse(
      await readFile(new URL('../knowledge-packs/catalog.json', import.meta.url), 'utf8'),
    );
    assert.equal(
      catalog.packs.filter((p: any) => p.type === 'detailed-guide').length,
      detailedPacks.length,
    );
    assert.equal(catalog.packs.filter((p: any) => p.collection === 'Federal core').length, 7);
    assert.equal(catalog.packs.filter((p: any) => p.collection === 'Industry guides').length, 9);
    for (const entry of catalog.packs) {
      assert.match(entry.file, /^[a-z0-9-]+\/\d+\.\d+\.\d+\.json$/);
      const bytes = await readFile(new URL(`../knowledge-packs/${entry.file}`, import.meta.url));
      assert.equal(bytes.length, entry.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
      const value = JSON.parse(bytes.toString());
      assert.equal(value.id, entry.id);
      assert.equal(value.version, entry.version);
      assert(bytes.length < 1_500_000);
      const result = await f.auth('/library/import', 'POST', value);
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(
        f.library.catalog(p.id).length,
        0,
        'Import alone must not affect project context',
      );
    }
    const guide = detailedPacks[0]!;
    f.library.attach(p.id, guide.id, guide.version, null);
    const update = { ...guide, version: '1.1.0', title: 'New guide revision' };
    f.library.install(update);
    assert.equal(f.library.attachments(p.id)[0]!.version, '1.0.0');
    assert.equal(f.library.list(p.id).find((e) => e.attached)?.newerVersion, '1.1.0');
    assert.throws(
      () => f.library.install({ ...guide, title: 'Silent replacement' }),
      /different content/,
    );
    const exported = await f.auth(`/library/packs/${guide.id}/${guide.version}`);
    assert.deepEqual(exported.json(), guide);
    assert.deepEqual(
      f.knowledge.list(p.id),
      [],
      'Reference imports never become company documents',
    );
  } finally {
    await f.cleanup();
  }
});

test('every federal and industry section remains available through scoped paged knowledge reads', async () => {
  const f = await appFixture('industry-guides');
  try {
    const p = f.store.createProject({
      name: 'Industry review',
      instructions: '',
      toolsEnabled: false,
    });
    const other = f.store.createProject({
      name: 'Unattached',
      instructions: '',
      toolsEnabled: false,
    });
    for (const guide of [...federalPacks, ...sectorPacks]) {
      assert(guide.jurisdiction[0]!.includes('federal'));
      assert(!guide.jurisdiction.includes('California'));
      f.library.install(guide);
      f.library.attach(p.id, guide.id, guide.version, null);
      const pages = f.library.catalog(p.id);
      assert.equal(pages.length, guide.pages.length);
      for (const section of guide.pages) {
        const result = searchKnowledge(pages, { query: section.title });
        const selected = result.pages.find((item) => item.id.endsWith(`:${section.id}`));
        assert(selected, `${guide.id}/${section.id} must be discoverable`);
        let offset = 0;
        let restored = '';
        while (true) {
          const part = readKnowledge(pages, { id: selected.id, offset, length: 500 }, 200000);
          restored += part.text;
          if (part.nextOffset === null) break;
          assert(part.nextOffset > offset);
          offset = part.nextOffset;
        }
        assert.equal(restored, pages.find((item) => item.id === selected.id)!.text);
        assert(restored.includes(section.text), 'Full authored analysis survives retrieval');
        assert.throws(
          () => readKnowledge(f.library.catalog(other.id), { id: selected.id }, 200000),
          /not found/,
        );
      }
      const context = knowledgeContext(pages, guide.pages[0]!.title, 200000);
      assert(Buffer.byteLength(JSON.stringify(context)) <= 12000);
      f.library.attach(p.id, guide.id, null, guide.version);
    }
  } finally {
    await f.cleanup();
  }
});

test('detailed legal guides have substantive topic content, official references, and bounded paged retrieval', async () => {
  const f = await appFixture('guide-retrieval');
  try {
    const project = f.store.createProject({
      name: 'Counsel',
      instructions: '',
      toolsEnabled: false,
    });
    const other = f.store.createProject({ name: 'Other', instructions: '', toolsEnabled: false });
    for (const guide of detailedPacks) {
      assert(guide.pages.length >= 2);
      assert(guide.rights.includes('No collective bargaining agreement content'));
      assert(guide.rights.includes('no attorney review'));
      for (const section of guide.pages) {
        assert(section.text.split(/\s+/).length >= 300, section.title);
        assert(section.sources.length >= 2, section.title);
        assert(
          section.text.includes('## Example') ||
            section.text.includes('## Discussion example') ||
            section.text.includes('## Worked discussion'),
          section.title,
        );
        for (const s of section.sources) {
          const url = new URL(s.url);
          assert.equal(url.protocol, 'https:');
          assert(url.hostname.endsWith('.gov'), s.url);
          assert(s.locator.length > 30);
        }
      }
    }
    const guide = detailedPacks.find((p) => p.id === 'guild-governance-guide')!;
    f.library.install(guide);
    f.library.attach(project.id, guide.id, guide.version, null);
    assert.equal(f.library.catalog(other.id).length, 0);
    const pages = f.library.catalog(project.id);
    const result = searchKnowledge(pages, { query: 'union elections member rights' });
    assert(result.pages.some((p) => p.id.endsWith(':member-rights-elections')));
    const reference = knowledgeContext(pages, 'union elections member rights', 200000);
    assert(Buffer.byteLength(JSON.stringify(reference)) <= 12000);
    assert(reference.length <= 3);
    const id = result.pages.find((p) => p.id.endsWith(':member-rights-elections'))!.id;
    let offset = 0,
      restored = '';
    do {
      const part = readKnowledge(pages, { id, offset, length: 500 }, 200000);
      restored += part.text;
      if (part.nextOffset === null) break;
      offset = part.nextOffset;
    } while (true);
    assert.equal(restored, pages.find((p) => p.id === id)!.text);
    assert(restored.includes('https://www.dol.gov/'));
    assert.throws(() => readKnowledge(f.library.catalog(other.id), { id }, 200000), /not found/);
  } finally {
    await f.cleanup();
  }
});
