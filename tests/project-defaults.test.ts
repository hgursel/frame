import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appFixture } from './helpers.js';
import { Store } from '../server/store.js';

test('new accounts receive one private Arena; tools cannot be disabled and new projects opt out of Excel', async () => {
  const f = await appFixture('defaults');
  await f.signIn();
  try {
    const admin = f.store.projects()[0]!;
    assert.equal(admin.name, 'Arena');
    assert.equal(admin.toolsEnabled, true);
    assert.equal(f.excel.projectEnabled(admin.id), false);
    const user = f.store.createUser('alice', 'alice-password-12345', 'user', false);
    const arena = f.store.projects().find((p) => p.ownerId === user.id)!;
    assert.equal(arena.name, 'Arena');
    assert.notEqual(arena.id, admin.id);
    assert.equal(f.store.ownsProject(user.id, admin.id), false);
    const project = (
      await f.auth('/projects', 'POST', { name: 'New', toolsEnabled: false })
    ).json();
    assert.equal(project.toolsEnabled, true);
    assert.equal(f.excel.projectEnabled(project.id), false);
    const changed = await f.auth(`/projects/${project.id}`, 'PUT', {
      name: 'New',
      toolsEnabled: false,
    });
    assert.equal(changed.json().toolsEnabled, true);
    assert.throws(() => f.excel.create(project.id), /disabled/);
    await f.auth(`/projects/${project.id}/plugins`, 'PUT', { excel: true });
    assert(f.excel.create(project.id).conversationId);
    // Existing enabled, disabled, and implicit-enabled settings all survive the upgrade.
    f.store.db
      .prepare("DELETE FROM project_plugins WHERE projectId=? AND plugin='excel'")
      .run(admin.id);
    f.store.db.prepare('UPDATE projects SET toolsEnabled=0 WHERE id=?').run(admin.id);
    const before = f.store
      .projects()
      .map((p) => p.id)
      .sort();
    const reopened = new Store(f.root);
    assert.deepEqual(
      reopened
        .projects()
        .map((p) => p.id)
        .sort(),
      before,
    );
    assert.equal(reopened.project(admin.id)?.toolsEnabled, true);
    reopened.close();
    assert.equal(f.excel.projectEnabled(admin.id), true);
    assert.equal(f.excel.projectEnabled(project.id), true);
    assert.equal(f.excel.projectEnabled(arena.id), false);
    assert.throws(() => f.store.createUser('alice', 'alice-password-12345'));
    assert.deepEqual(
      f.store
        .projects()
        .map((p) => p.id)
        .sort(),
      before,
    );
  } finally {
    await f.cleanup();
  }
});

test('regular users cannot list or configure skills, receive skill context, or invoke skill commands', async () => {
  const f = await appFixture('skills-admin-only');
  await f.signIn();
  try {
    const user = f.store.createUser('alice', 'alice-password-12345', 'user', false);
    const p = f.store.projects().find((p) => p.ownerId === user.id)!;
    const login = await f.call('/auth/login', 'POST', {
      username: 'alice',
      password: 'alice-password-12345',
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    for (const url of ['/skills', `/projects/${p.id}/skills`])
      for (const method of ['GET', 'PUT']) {
        const response = await f.call(
          url,
          method,
          method === 'PUT' ? { enabled: [] } : undefined,
          cookie,
        );
        assert.equal(response.statusCode, 403, response.body);
      }
    // Previously enabled selections cannot leak through to a new worker or its mounts.
    f.store.db.prepare('INSERT INTO project_skills VALUES (?, ?)').run(p.id, 'legacy-skill');
    f.skills.catalog = () => ({
      folders: ['/opt/skills'],
      warnings: [],
      skills: [
        {
          name: 'legacy-skill',
          description: 'Private',
          folder: '/opt/skills',
          baseDir: '/opt/skills/private',
          filePath: '/opt/skills/private/SKILL.md',
          modelInvocation: true,
        },
      ],
    });
    assert.deepEqual(f.skills.context(p.id), []);
    const chat = f.store.createConversation(p.id);
    const response = await f.call(
      `/conversations/${chat.id}/messages`,
      'POST',
      { requestId: randomUUID(), text: '/skill:legacy-skill run' },
      cookie,
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(f.runner.active.size, 0);
    const admin = f.store.projects().find((p) => p.ownerId !== user.id)!;
    f.store.db.prepare('INSERT INTO project_skills VALUES (?, ?)').run(admin.id, 'legacy-skill');
    assert.equal(f.skills.context(admin.id).length, 1);
  } finally {
    await f.cleanup();
  }
});
