import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { KnowledgeLibrary, libraryUrl } from '../server/library/service.js';
import { bundledPacks } from '../server/library/bundles.js';
import {
  knowledgeContext,
  rankKnowledge,
  readKnowledge,
  searchKnowledge,
} from '../server/knowledge-discovery.js';
import { knowledgeTools } from '../server/knowledge-tools.js';
const origin = 'http://127.0.0.1:3000';
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'frame-library-'));
  const ctx = await createApp({ dataDir: root, origin, setupToken: 'test' });
  const project = ctx.store.createProject({ name: 'Legal', instructions: '', toolsEnabled: false });
  let cookie = '';
  const call = (url: string, method = 'GET', payload?: unknown) =>
    ctx.app.inject({
      url: '/api' + url,
      method: method as any,
      payload: payload as any,
      headers: { host: '127.0.0.1:3000', origin, cookie },
    });
  await call('/auth/setup', 'POST', { token: 'test', password: 'test-password-123' });
  const login = await call('/auth/login', 'POST', { password: 'test-password-123' });
  cookie = String(login.headers['set-cookie']).split(';')[0]!;
  return {
    ...ctx,
    root,
    project,
    call,
    cleanup: async () => {
      await ctx.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('library installation is explicit; attachments and retrieval are scoped to each project', async () => {
  const f = await fixture();
  try {
    const pack = bundledPacks[0]!;
    assert.equal(f.library.catalog(f.project.id).length, 0);
    const endpoint = `/projects/${f.project.id}/library/${pack.id}`;
    assert.equal(
      (await f.call(endpoint, 'PUT', { version: pack.version, previousVersion: null })).statusCode,
      400,
    );
    assert.equal(
      (await f.call('/library/install', 'POST', { id: pack.id, version: pack.version })).statusCode,
      200,
    );
    assert.equal(f.library.catalog(f.project.id).length, 0);
    assert.equal(
      (await f.call(endpoint, 'PUT', { version: pack.version, previousVersion: null })).statusCode,
      200,
    );
    assert.equal(f.library.catalog(f.project.id).length, pack.pages.length);
    const other = f.store.createProject({ name: 'Other', instructions: '', toolsEnabled: false });
    assert.equal(f.library.catalog(other.id).length, 0);
    const reference = knowledgeContext(
      f.library.catalog(f.project.id),
      'California paid sick leave accrual',
      200000,
    );
    assert(reference.some((p) => p.library?.page === 'Paid Sick Leave'));
    assert(Buffer.byteLength(JSON.stringify(reference)) <= 12000);
    assert(reference.length <= 3);
    assert(reference[0]!.library?.url);
    // Documents and their revisions remain separate from shared packs.
    assert.equal(f.knowledge.list(f.project.id).length, 0);
    assert.equal(
      (await f.call(endpoint, 'PUT', { version: null, previousVersion: null })).statusCode,
      409,
    );
    assert.equal(
      (await f.call(endpoint, 'PUT', { version: null, previousVersion: pack.version })).statusCode,
      200,
    );
    assert.equal(f.library.catalog(f.project.id).length, 0);
    assert.equal(
      (await f.call(libraryUrl(pack.id, pack.version, 'sick-leave').slice(4))).statusCode,
      200,
      'historical citations still resolve after detach',
    );
  } finally {
    await f.cleanup();
  }
});
test('pack versions are immutable, pinned across updates and restarts, and imports are validated', async () => {
  const f = await fixture();
  try {
    const pack = { ...structuredClone(bundledPacks[1]!), id: 'custom-contracts' };
    f.library.install(pack);
    f.library.attach(f.project.id, pack.id, pack.version, null);
    assert.throws(
      () => f.library.install({ ...pack, title: 'Changed without new version' }),
      /different content/,
    );
    const update = { ...pack, version: '1.1.0', title: 'New version' };
    f.library.install(update);
    assert.equal(f.library.attachments(f.project.id)[0]!.version, '1.0.0');
    assert.equal(f.library.list(f.project.id).find((p) => p.attached)?.newerVersion, '1.1.0');
    const secondStore = new Store(f.root);
    try {
      const second = new KnowledgeLibrary(secondStore);
      assert.equal(second.attachments(f.project.id)[0]!.version, '1.0.0');
      assert.equal(second.get(pack.id, pack.version).title, pack.title);
    } finally {
      secondStore.close();
    }
    f.library.attach(f.project.id, pack.id, '1.1.0', '1.0.0');
    assert.equal(f.library.attachments(f.project.id)[0]!.version, '1.1.0');
    assert.equal(f.library.get(pack.id, '1.0.0').title, pack.title);
    assert.throws(() => f.library.install({ ...pack, id: '../escape' }));
    assert.throws(() => f.library.install({ ...pack, pages: [pack.pages[0], pack.pages[0]] }));
    assert.throws(
      () => f.library.install({ ...bundledPacks[0], title: 'Impersonation' }),
      /reserved/,
    );
    assert.throws(() =>
      f.library.install({
        ...pack,
        pages: [
          {
            ...pack.pages[0],
            sources: [{ title: 'Bad', locator: 'bad', url: 'javascript:alert(1)' }],
          },
        ],
      }),
    );
    const exported = await f.call(`/library/packs/${pack.id}/${pack.version}`);
    assert.equal(exported.statusCode, 200);
    assert.deepEqual(exported.json(), pack);
    assert.equal((await f.call('/library/import', 'POST', pack)).statusCode, 200);
  } finally {
    await f.cleanup();
  }
});
test('library endpoints require authentication and same-origin mutations; active runs block attachment changes', async () => {
  const f = await fixture();
  try {
    const unauth = await f.app.inject({ url: '/api/library', headers: { host: '127.0.0.1:3000' } });
    assert.equal(unauth.statusCode, 401);
    const foreign = await f.app.inject({
      url: '/api/library/install',
      method: 'POST',
      headers: { host: '127.0.0.1:3000', origin: 'https://elsewhere.test' },
      payload: { id: 'california-hr', version: '1.0.0' },
    });
    assert.equal(foreign.statusCode, 403);
    f.library.install(bundledPacks[0]);
    const original = f.runner.projectBusy;
    f.runner.projectBusy = () => true;
    try {
      assert.equal(
        (
          await f.call(`/projects/${f.project.id}/library/california-hr`, 'PUT', {
            version: '1.0.0',
            previousVersion: null,
          })
        ).statusCode,
        409,
      );
    } finally {
      f.runner.projectBusy = original;
    }
    assert.equal(f.library.attachments(f.project.id).length, 0);
    assert.equal((await f.call('/library/packs/unknown/1.0.0/pages/missing')).statusCode, 404);
  } finally {
    await f.cleanup();
  }
});
test('knowledge tools read library provenance, reject library edits, and cannot read another project’s packs', async () => {
  const f = await fixture();
  try {
    f.library.install(bundledPacks[1]);
    f.library.attach(f.project.id, 'business-contract-review', '1.0.0', null);
    const catalog = f.library.catalog(f.project.id),
      doc = catalog[0]!;
    const tools = knowledgeTools(catalog, 32768) as any[];
    const search = searchKnowledge(catalog, { query: 'contract review' });
    assert(search.pages.some((p) => p.library?.version === '1.0.0'));
    assert(!('text' in search.pages[0]!));
    assert.equal(readKnowledge(catalog, { id: doc.id }, 32768).library?.version, '1.0.0');
    await assert.rejects(
      tools[2].execute('w', {
        title: 'Edit',
        text: 'Change it',
        targetId: doc.id,
        revision: doc.revision,
      }),
      /current target page/,
    );
    assert.throws(() => readKnowledge([], { id: doc.id }, 32768), /not found/);
    assert.match(doc.text, /not official legal text/);
    const before = f.library.get('business-contract-review', '1.0.0');
    await f.maintenance.initialize();
    assert.deepEqual(f.library.get('business-contract-review', '1.0.0'), before);
  } finally {
    await f.cleanup();
  }
});
test('project deletion removes attachments and preserves shared packs and other projects', async () => {
  const f = await fixture();
  try {
    const p = bundledPacks[0]!;
    f.library.install(p);
    f.library.attach(f.project.id, p.id, p.version, null);
    const other = f.store.createProject({ name: 'Other', instructions: '', toolsEnabled: false });
    f.library.attach(other.id, p.id, p.version, null);
    const response = await f.call(`/projects/${f.project.id}`, 'DELETE', { confirm: true });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(
      f.store.db.prepare('SELECT * FROM project_library WHERE projectId=?').all(f.project.id)
        .length,
      0,
    );
    assert.equal(f.library.catalog(other.id).length, p.pages.length);
    assert.equal(f.library.installed().length, 1);
  } finally {
    await f.cleanup();
  }
});
test('starter topics retrieve on representative HR and contract requests with bounded context', async () => {
  const f = await fixture();
  try {
    for (const p of bundledPacks) {
      f.library.install(p);
      f.library.attach(
        f.project.id,
        p.id,
        p.version,
        f.library.attachments(f.project.id).find((a) => a.packId === p.id)?.version || null,
      );
    }
    const catalog = f.library.catalog(f.project.id);
    for (const [query, id] of [
      ['Review our employee handbook', 'handbook-review'],
      ['California overtime pay', 'pay-hours'],
      ['Meal rest breaks', 'meal-rest'],
      ['Paid sick leave accrual', 'sick-leave'],
      ['Pregnancy accommodation CFRA', 'protected-leave'],
      ['Resignation final pay vacation', 'departures'],
      ['Independent contractor classification', 'contractors'],
      ['Supplier pricing invoice comparison', 'supplier-pricing'],
      ['NDA confidentiality', 'nda'],
      ['Contract amendment version comparison', 'compare-versions'],
      ['Renewal notice deadline', 'renewal-obligations'],
      ['Draft job descriptions and offer letters', 'job-descriptions-offers'],
      ['Pay transparency equal pay salary range', 'pay-transparency'],
      ['Background checks fair chance hiring', 'fair-chance'],
      ['Complaint intake investigation scope', 'intake-plan'],
      ['Witness interview evidence timeline', 'evidence-interviews'],
      ['Investigation report findings evidence', 'investigation-report'],
      ['Performance review evaluation feedback', 'performance-review'],
      ['PIP coaching improvement plan checkpoints', 'improvement-plan'],
      ['Commercial lease premises tenant landlord', 'lease-review'],
      ['Rent CAM NNN operating costs reconciliation', 'rent-operating-costs'],
      ['Lease renewal option repairs surrender', 'lease-options-exit'],
      ['Statements of work SOW change orders deliverables', 'statements-of-work'],
    ])
      assert(
        rankKnowledge(catalog, query!)
          .slice(0, 3)
          .some((r) => r.doc.id.endsWith(':' + id)),
        query,
      );
    for (const window of [2048, 32768, 200000])
      assert(
        Buffer.byteLength(
          JSON.stringify(knowledgeContext(catalog, 'contract review sick leave', window)),
        ) <= Math.min(12000, Math.floor(window / 2)),
      );
  } finally {
    await f.cleanup();
  }
});

test('expanded official packs preserve v1.0 snapshots and require explicit project upgrades', async () => {
  const f = await fixture();
  try {
    // Fingerprints captured from the published PR #25 content, before expansion.
    const fingerprints: Record<string, string> = {
      'california-hr': 'fec311efbf2303b4f14fdc3a2fa3a76299fb805c8bf5be0da87ee5943464beee',
      'business-contract-review':
        'c6a66c2801f3d41100a655b1982270b0edc536eca231d7dd2db0016091a1af67',
    };
    assert.equal(
      f.library.list().length,
      5,
      'Fresh catalog shows five current packs, not every historical version',
    );
    for (const id of Object.keys(fingerprints)) {
      const old = f.library.get(id, '1.0.0'),
        updated = f.library.get(id, '1.1.0');
      assert.equal(
        createHash('sha256').update(JSON.stringify(old)).digest('hex'),
        fingerprints[id],
      );
      assert(updated.pages.length > old.pages.length);
      f.library.install(old);
      f.library.attach(f.project.id, id, old.version, null);
      f.library.install(updated);
      const entries = f.library.list(f.project.id).filter((p) => p.pack.id === id);
      assert.equal(entries.length, 2);
      assert.equal(entries.find((e) => e.attached)?.pack.version, '1.0.0');
      assert.equal(entries.find((e) => e.attached)?.newerVersion, '1.1.0');
      assert.equal(
        f.library.catalog(f.project.id).filter((d) => d.id.startsWith('library:' + id + ':'))
          .length,
        old.pages.length,
      );
      f.library.attach(f.project.id, id, updated.version, old.version);
      assert.equal(
        f.library.catalog(f.project.id).filter((d) => d.id.startsWith('library:' + id + ':'))
          .length,
        updated.pages.length,
      );
      assert.equal(
        (await f.call(libraryUrl(id, old.version, old.pages[0]!.id).slice(4))).statusCode,
        200,
      );
      assert.throws(() => f.library.install({ ...updated, version: '1.2.0' }), /reserved/);
      assert.throws(
        () => f.library.install({ ...old, description: 'Changed historical content' }),
        /reserved/,
      );
    }
    for (const id of ['workplace-investigations', 'performance-reviews', 'commercial-leases']) {
      const p = f.library.get(id, '1.0.0');
      f.library.install(p);
      f.library.attach(f.project.id, id, p.version, null);
      assert(p.pages.length >= 2);
      assert(f.library.catalog(f.project.id).some((d) => d.id.startsWith('library:' + id + ':')));
    }
    assert.equal(f.library.attachments(f.project.id).length, 5);
    assert.equal(f.library.catalog(f.project.id).length, 26);
  } finally {
    await f.cleanup();
  }
});
