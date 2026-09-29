import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { appFixture, origin, waitUntil } from './helpers.js';
import { createApp } from '../server/app.js';
import { collapseSkillInvocation } from '../shared/skills.js';

async function skill(dir: string, frontmatter: string, body = 'Skill body.') {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`);
}

async function fixture() {
  const f = await appFixture('skills');
  await f.signIn();
  const folder = path.join(f.root, 'skills');
  const other = path.join(f.root, 'more-skills');
  await skill(
    path.join(folder, 'lookup'),
    'name: lookup\ndescription: Look up a customer record with the private lookup script.',
    'Run `./scripts/lookup.sh <id>` and summarize the JSON it prints.',
  );
  await skill(
    path.join(folder, 'manual'),
    'name: manual-only\ndescription: Weekly checklist.\ndisable-model-invocation: true',
    'MANUAL-SKILL-BODY: review the weekly checklist.',
  );
  await skill(path.join(folder, 'broken'), 'name: broken');
  await skill(path.join(other, 'lookup'), 'name: lookup\ndescription: Duplicate.');
  const project = f.store.createProject({ name: 'Skills', instructions: '', toolsEnabled: true });
  return { ...f, folder, other, project };
}

test('skill folders are validated, scanned with warnings, and enabled per project', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/skills')).statusCode, 401);
    assert.equal((await f.auth('/skills', 'PUT', { folders: ['relative/path'] })).statusCode, 400);
    assert.equal(
      (await f.auth('/skills', 'PUT', { folders: [f.folder, f.folder] })).statusCode,
      400,
    );
    const missing = path.join(f.root, 'missing');
    const saved = await f.auth('/skills', 'PUT', { folders: [f.folder, f.other, missing] });
    assert.equal(saved.statusCode, 200);
    const catalog = saved.json();
    assert.deepEqual(
      catalog.skills.map((s: any) => [s.name, s.modelInvocation, s.folder]),
      [
        ['lookup', true, f.folder],
        ['manual-only', false, f.folder],
      ],
    );
    const warnings = catalog.warnings.join('\n');
    assert.match(warnings, /description is required/);
    assert.match(warnings, /already loaded/);
    assert.match(warnings, /missing: folder not found/);
    assert.deepEqual((await f.auth('/skills')).json(), catalog);

    const url = `/projects/${f.project.id}/skills`;
    assert.equal((await f.auth(url, 'PUT', { enabled: 'lookup' })).statusCode, 400);
    assert.equal((await f.auth(`/projects/${randomUUID()}/skills`)).statusCode, 404);
    const enabled = (await f.auth(url, 'PUT', { enabled: ['lookup', 'lookup'] })).json();
    assert.deepEqual(enabled.enabled, ['lookup']);
    assert.equal(enabled.hostTools, true);
    const unknown = await f.auth(url, 'PUT', { enabled: ['not-installed'] });
    assert.equal(unknown.statusCode, 400);
    assert.match(unknown.json().error, /no longer available/);
    assert.deepEqual(f.skills.enabled(f.project.id), ['lookup']);
    assert.deepEqual(
      f.skills.context(f.project.id).map((s) => s.name),
      ['lookup'],
    );

    // Every turn rescans: a removed skill disappears and a later folder's same-name skill takes over.
    await rm(path.join(f.folder, 'lookup'), { recursive: true });
    assert.deepEqual(
      f.skills.context(f.project.id).map((s) => s.folder),
      [f.other],
    );
    await rm(path.join(f.other, 'lookup'), { recursive: true });
    assert.deepEqual(f.skills.context(f.project.id), []);
    assert.equal((await f.auth(url, 'PUT', { enabled: [] })).statusCode, 200);
    assert.deepEqual(f.skills.enabled(f.project.id), []);

    assert.equal(
      (await f.auth(`/projects/${f.project.id}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    await waitUntil(() => !f.store.project(f.project.id));
    assert.equal(
      (f.store.db.prepare('SELECT COUNT(*) AS n FROM project_skills').get() as any).n,
      0,
    );
  } finally {
    await f.cleanup();
  }
});

test('skill invocations collapse to the typed command', () => {
  const block =
    '<skill name="lookup" location="/opt/skills/lookup/SKILL.md">\nReferences are relative to /opt/skills/lookup.\n\nBody\n</skill>';
  assert.equal(collapseSkillInvocation(block), '/skill:lookup');
  assert.equal(collapseSkillInvocation(`${block}\n\nfind 42`), '/skill:lookup find 42');
  assert.equal(collapseSkillInvocation('Plain text'), 'Plain text');
});

test(
  'real SDK lists enabled skills only with host tools and expands /skill commands',
  { timeout: 40000 },
  async () => {
    const f = await fixture();
    const requests: any[] = [];
    const model = createServer(async (req, res) => {
      let raw = '';
      for await (const b of req) raw += b;
      requests.push(JSON.parse(raw));
      const delta = { content: 'Done.' };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        `data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
      );
    });
    const send = async (conversation: string, text: string) => {
      const response = await f.auth(`/conversations/${conversation}/messages`, 'POST', {
        requestId: randomUUID(),
        text,
      });
      assert.equal(response.statusCode, 202);
      await waitUntil(() => !f.runner.active.has(conversation));
      assert.equal(f.runner.snapshot(conversation).status, 'completed');
    };
    const system = () => {
      const last = requests.at(-1);
      return String(last.messages.find((m: any) => m.role === 'system')?.content || '');
    };
    try {
      await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
      f.store.saveSettings({
        ...f.store.settings(),
        modelId: 'test',
        baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      });
      f.skills.save({ folders: [f.folder] });
      f.skills.setProject(f.project.id, ['lookup', 'manual-only']);
      const chat = f.store.createConversation(f.project.id);

      await send(chat.id, 'Hello');
      assert.match(system(), /<available_skills>/);
      assert.match(system(), /<name>lookup<\/name>/);
      assert(system().includes(path.join(f.folder, 'lookup', 'SKILL.md')));
      assert.match(system(), /Skills load their own credentials/);
      // disable-model-invocation hides the skill from the prompt; /skill:name still works.
      assert.doesNotMatch(system(), /manual-only/);

      await send(chat.id, '/skill:manual-only check week 42');
      const user = JSON.stringify(requests.at(-1).messages.at(-1));
      assert.match(user, /MANUAL-SKILL-BODY/);
      assert.match(user, /check week 42/);
      const messages = f.runner.snapshot(chat.id).messages.filter((m) => m.role === 'user');
      assert.equal(messages.at(-1)!.text, '/skill:manual-only check week 42');

      // Without host tools the model cannot read or run skills, so none are offered.
      f.store.updateProject(f.project.id, { ...f.project, toolsEnabled: false });
      await send(f.store.createConversation(f.project.id).id, 'Hello');
      assert.doesNotMatch(system(), /available_skills|<name>lookup/);
    } finally {
      await f.cleanup();
      model.closeAllConnections();
      await new Promise<void>((r) => model.close(() => r()));
    }
  },
);

test('stored Private Tools registrations are removed on startup', async () => {
  const f = await appFixture('private-tools-cleanup');
  const project = f.store.createProject({ name: 'Old', instructions: '', toolsEnabled: false });
  f.store.setMeta('private-tools:settings', '{"enabled":true,"instructions":"","tools":[]}');
  f.store.db
    .prepare("INSERT INTO project_plugins VALUES (?, 'private-tools', 1), (?, 'charts', 1)")
    .run(project.id, project.id);
  await f.app.close();
  const restarted = await createApp({ dataDir: f.root, origin, setupToken: 'test' });
  try {
    assert.equal(restarted.store.meta('private-tools:settings'), undefined);
    assert.deepEqual(
      restarted.store.db
        .prepare('SELECT plugin FROM project_plugins')
        .all()
        .map((r: any) => r.plugin),
      ['charts'],
    );
  } finally {
    await restarted.app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
