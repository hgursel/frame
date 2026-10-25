import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { appFixture, waitUntil } from './helpers.js';
import { smtpFixture } from './smtp-fixture.js';
import { Email } from '../server/email.js';
const settings = (port: number) => ({
  enabled: true,
  host: '127.0.0.1',
  port,
  security: 'none',
  username: '',
  fromName: 'Frame',
  fromEmail: 'no-reply@example.com',
  domains: ['example.com'],
});
const content = {
  to: ['alice@example.com'],
  subject: 'Weekly report',
  body: 'Please review the attached report.',
  attachments: [] as string[],
};
async function fixture() {
  const f = await appFixture('email');
  await f.signIn();
  const smtp = await smtpFixture();
  f.email.save(settings(smtp.port));
  const project = f.store.projects()[0]!;
  const chat = f.store.createConversation(project.id);
  return {
    ...f,
    smtp,
    project,
    chat,
    finish: async () => {
      await f.cleanup();
      await smtp.close();
    },
  };
}
test('SMTP configuration and profiles are admin-only; lookup is scoped and secrets never enter model context', async () => {
  const f = await fixture();
  try {
    const admin = f.store.user(f.project.ownerId!);
    assert.equal(
      (
        await f.auth(`/admin/users/${admin.id}`, 'PATCH', {
          displayName: 'Workspace Admin',
          email: 'admin@example.com',
        })
      ).statusCode,
      200,
    );
    assert.equal((await f.auth('/auth/me')).json().displayName, 'Workspace Admin');
    assert.equal(
      (await f.auth(`/admin/users/${admin.id}`, 'PATCH', { disabled: true })).statusCode,
      400,
    );
    assert.equal(
      (
        await f.auth('/admin/users', 'POST', {
          username: 'alice',
          password: 'alice-password-123',
          displayName: 'Alex Smith',
          email: 'alice@example.com',
        })
      ).statusCode,
      200,
    );
    const alice = (await f.auth('/admin/users')).json().find((u: any) => u.username === 'alice');
    f.store.db.prepare('UPDATE users SET mustChangePassword=0 WHERE id=?').run(alice.id);
    f.store.createUser('other', 'other-password-123', 'user', false, {
      displayName: 'Alex Smith',
      email: 'other@example.com',
    });
    const disabled = f.store.createUser('disabled', 'disabled-password-123', 'user', false, {
      displayName: 'Alex Disabled',
      email: 'disabled@example.com',
    });
    f.store.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(disabled.id);
    f.store.createUser('external', 'external-password-123', 'user', false, {
      displayName: 'Alex External',
      email: 'external@outside.com',
    });
    const login = await f.call('/auth/login', 'POST', {
      username: 'alice',
      password: 'alice-password-123',
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    for (const [url, method, body] of [
      ['/admin/email', 'GET', undefined],
      ['/admin/email', 'PUT', settings(f.smtp.port)],
      ['/admin/email/verify', 'POST', {}],
      [`/admin/users/${alice.id}`, 'PATCH', { email: 'new@example.com' }],
    ] as const)
      assert.equal((await f.call(url, method, body, cookie)).statusCode, 403);
    assert.equal(
      (await f.call(`/conversations/${f.chat.id}/emails`, 'GET', undefined, cookie)).statusCode,
      404,
    );
    const p = f.store.projects().find((p) => p.ownerId === alice.id)!;
    const chat = f.store.createConversation(p.id);
    const matches = await f.call(
      `/conversations/${chat.id}/email/recipients?query=Alex`,
      'GET',
      undefined,
      cookie,
    );
    assert.equal(matches.statusCode, 200);
    assert.equal(matches.json().recipients.length, 2);
    assert.equal(f.email.lookup(chat.id, 'me').recipients[0]?.email, 'alice@example.com');
    f.email.save({
      ...settings(f.smtp.port),
      security: 'starttls',
      password: 'smtp-private-secret',
      username: 'mailer',
    });
    const publicSettings = await f.auth('/admin/email');
    assert(!publicSettings.body.includes('smtp-private-secret'));
    assert.equal(publicSettings.json().hasPassword, true);
    assert(!JSON.stringify(f.email.modelContext(chat.id)).includes('smtp-private-secret'));
    assert(!JSON.stringify(f.email.modelContext(chat.id)).includes('mailer'));
    assert.equal(
      (await f.auth('/admin/email', 'PUT', { ...settings(f.smtp.port), username: 'mailer' }))
        .statusCode,
      400,
    );
    f.email.save({ ...settings(f.smtp.port), clearPassword: true });
    assert.equal(f.email.settings().hasPassword, false);
    assert.equal((await f.auth('/admin/email/verify', 'POST', {})).statusCode, 200);
    assert.equal(f.smtp.messages.length, 0);
    f.email.save({ ...settings(f.smtp.port), security: 'starttls' });
    assert.equal((await f.auth('/admin/email/verify', 'POST', {})).statusCode, 502);
    assert.equal(f.smtp.messages.length, 0);
    f.email.save(settings(f.smtp.port));
    const draft = await f.email.prepare(chat.id, content);
    assert.equal(
      (await f.auth(`/conversations/${f.chat.id}/emails/${draft.id}/send`, 'POST', { revision: 1 }))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await f.call(
          `/conversations/${f.chat.id}/emails/${draft.id}/send`,
          'POST',
          { revision: 1 },
          cookie,
        )
      ).statusCode,
      404,
    );
    const sent = await f.call(
      `/conversations/${chat.id}/emails/${draft.id}/send`,
      'POST',
      { revision: 1 },
      cookie,
    );
    assert.equal(sent.statusCode, 200, sent.body);
    assert.equal(sent.json().status, 'accepted');
    assert.equal(f.smtp.messages.length, 1);
  } finally {
    await f.finish();
  }
});
test('confirmed emails attach exact conversation outputs, survive reload and never resend on duplicate confirmation', async () => {
  const f = await fixture();
  try {
    const root = f.store.artifacts(f.chat);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'report.pdf'), 'generated pdf bytes');
    const draft = await f.email.prepare(f.chat.id, { ...content, attachments: ['report.pdf'] });
    assert.equal(f.smtp.connections, 0);
    assert.equal(f.runner.snapshot(f.chat.id).emails?.[0]?.id, draft.id);
    const base = `/conversations/${f.chat.id}/emails/${draft.id}`;
    assert.equal((await f.auth(base + '/send', 'POST', { revision: 99 })).statusCode, 409);
    f.smtp.state.hold = true;
    const send = f.auth(base + '/send', 'POST', { revision: draft.revision });
    await waitUntil(() => f.smtp.messages.length === 1);
    assert.equal(
      (await f.auth(base + '/send', 'POST', { revision: draft.revision })).json().status,
      'sending',
    );
    assert.equal(
      (await f.auth(`/projects/${f.project.id}`, 'DELETE', { confirm: true })).statusCode,
      409,
    );
    f.smtp.state.release();
    const result = await send;
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().status, 'accepted');
    assert.equal(
      (await f.auth(base + '/send', 'POST', { revision: draft.revision })).json().status,
      'accepted',
    );
    assert.equal(f.smtp.messages.length, 1);
    const wire = f.smtp.messages[0]!;
    assert.match(wire, /To: alice@example.com/);
    assert.match(wire, /Subject: Weekly report/);
    assert.match(wire, /Please do not reply/);
    assert.match(wire, /filename=report.pdf/);
    assert(wire.includes(Buffer.from('generated pdf bytes').toString('base64')));
    assert(!/^Reply-To:/m.test(wire));
    const reopened = new Email(f.store);
    assert.equal(reopened.list(f.chat.id)[0]?.status, 'accepted');
    assert.equal(
      (await f.auth(`/conversations/${f.chat.id}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    assert.equal(f.email.list(f.chat.id).length, 0);
  } finally {
    f.smtp.state.release();
    await f.finish();
  }
});
test('domain checks, file scope, changed attachments/settings and stale edits block sending before SMTP', async () => {
  const f = await fixture();
  try {
    for (const to of [
      ['outside@evil.com'],
      ['alice@sub.example.com'],
      ['alice@example.com.evil.com'],
      ['alice@example.com\r\nBcc: attacker@example.com'],
    ])
      await assert.rejects(f.email.prepare(f.chat.id, { ...content, to }));
    await assert.rejects(
      f.email.prepare(f.chat.id, { ...content, subject: 'Subject\r\nBcc: attacker@example.com' }),
    );
    const root = f.store.artifacts(f.chat);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'report.txt'), 'first');
    await symlink(path.join(root, 'report.txt'), path.join(root, 'link.txt'));
    for (const name of ['../report.txt', 'link.txt', 'script.js', 'https://example.com/report.pdf'])
      await assert.rejects(f.email.prepare(f.chat.id, { ...content, attachments: [name] }));
    const draft = await f.email.prepare(f.chat.id, { ...content, attachments: ['report.txt'] });
    await writeFile(path.join(root, 'report.txt'), 'second');
    await assert.rejects(f.email.send(f.chat.id, draft.id, 1), /attachment changed/i);
    const edited = await f.email.prepare(
      f.chat.id,
      { ...content, attachments: ['report.txt'] },
      { id: draft.id, revision: 1 },
    );
    assert.equal(edited.revision, 2);
    await assert.rejects(f.email.send(f.chat.id, draft.id, 1), /latest draft/);
    await assert.rejects(
      f.email.prepare(f.chat.id, content, { id: draft.id, revision: 1 }),
      /changed/,
    );
    f.email.save({ ...settings(f.smtp.port), fromName: 'New sender' });
    await assert.rejects(f.email.send(f.chat.id, draft.id, 2), /settings changed/);
    f.email.cancel(f.chat.id, draft.id, 2);
    assert.equal((await f.email.send(f.chat.id, draft.id, 2)).status, 'cancelled');
    assert.equal(f.smtp.connections, 0);
    const other = f.store.createConversation(f.project.id);
    await assert.rejects(f.email.prepare(other.id, { ...content, attachments: ['report.txt'] }));
    const incognito = f.store.createConversation(f.project.id, true);
    await assert.rejects(f.email.prepare(incognito.id, content), /incognito/);
  } finally {
    await f.finish();
  }
});
test('partial and unknown SMTP results are recorded without retry; restart makes in-flight sends uncertain', async () => {
  const f = await fixture();
  try {
    f.smtp.state.reject = 'other@example.com';
    const partial = await f.email.prepare(f.chat.id, {
      ...content,
      to: ['alice@example.com', 'other@example.com'],
    });
    const result = await f.email.send(f.chat.id, partial.id, 1);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.accepted, ['alice@example.com']);
    assert.deepEqual(result.rejected, ['other@example.com']);
    f.smtp.state.reject = '';
    f.smtp.state.dropAfterData = true;
    const draft = await f.email.prepare(f.chat.id, content);
    assert.equal((await f.email.send(f.chat.id, draft.id, 1)).status, 'uncertain');
    await f.email.send(f.chat.id, draft.id, 1);
    assert.equal(f.smtp.messages.length, 2);
    const next = await f.email.prepare(f.chat.id, content);
    f.store.db.prepare("UPDATE email_drafts SET status='sending' WHERE id=?").run(next.id);
    const reopened = new Email(f.store);
    assert.equal(reopened.get(f.chat.id, next.id).status, 'uncertain');
  } finally {
    await f.finish();
  }
});
test('real Pi SDK prepares a visible email without SMTP credentials or a model send tool', async () => {
  const f = await fixture();
  const requests: any[] = [];
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const b = JSON.parse(raw);
    requests.push(b);
    const tool = b.messages.at(-1).role !== 'tool';
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      `data: ${JSON.stringify({ id: 'email', choices: [{ index: 0, delta: tool ? { tool_calls: [{ index: 0, id: 'prepare', type: 'function', function: { name: 'email_prepare', arguments: JSON.stringify(content) } }] } : { content: 'Review the email draft and click Send.' }, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  try {
    f.store.saveSettings({
      ...f.store.settings(),
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      modelId: 'local',
    });
    const response = await f.auth(`/conversations/${f.chat.id}/messages`, 'POST', {
      requestId: randomUUID(),
      text: 'Email the weekly report to alice@example.com.',
    });
    assert.equal(response.statusCode, 202, response.body);
    await waitUntil(() => !f.runner.active.has(f.chat.id));
    const snapshot = f.runner.snapshot(f.chat.id);
    assert.equal(snapshot.error, undefined);
    assert.equal(snapshot.emails?.[0]?.status, 'draft');
    assert.equal(f.smtp.connections, 0);
    const names = requests[0].tools.map((t: any) => t.function.name);
    assert(names.includes('email_prepare'));
    assert(!names.includes('email_send'));
    assert(
      requests[0].messages.some((m: any) =>
        String(m.content).includes('ONLY the human Send button'),
      ),
    );
  } finally {
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
    await f.finish();
  }
});
