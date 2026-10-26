import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nextOccurrence } from '../shared/scheduled.js';
import { Scheduled } from '../server/scheduled.js';
import { appFixture, waitUntil } from './helpers.js';
import { smtpFixture } from './smtp-fixture.js';
import { FakeSql, config } from './sql-fixture.js';
const taskInput = {
  title: 'Weekly summary',
  instructions: 'Summarize current project knowledge.',
  timing: { kind: 'daily', time: '07:00' },
  recipients: [] as string[],
  attachments: 'none',
};
const smtpSettings = (port: number) => ({
  enabled: true,
  host: '127.0.0.1',
  port,
  security: 'none',
  username: '',
  fromName: 'Frame',
  fromEmail: 'no-reply@example.com',
  domains: ['example.com'],
});
async function fixture(handler?: (body: any, step: number) => any) {
  const requests: any[] = [];
  let step = 0;
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    const next = handler?.(body, step++);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      `data: ${JSON.stringify({ id: 'schedule', choices: [{ index: 0, delta: next ? { tool_calls: [{ index: 0, id: 'call-' + step, type: 'function', function: { name: next.name, arguments: JSON.stringify(next.args) } }] } : { content: 'Scheduled analysis completed.' }, finish_reason: next ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
  const sql = new FakeSql();
  const f = await appFixture('scheduled', { sqlDriver: sql });
  await f.signIn();
  f.store.saveSettings({
    ...f.store.settings(),
    modelId: 'local',
    baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  });
  const project = f.store.projects()[0]!;
  const chat = f.store.createConversation(project.id);
  const task = () => f.scheduled.prepare(chat.id, taskInput);
  const activate = (id: string, revision = 1) =>
    f.scheduled.action(id, project.ownerId!, 'activate', { revision });
  return {
    ...f,
    project,
    chat,
    task,
    activate,
    requests,
    sql,
    finish: async () => {
      await f.cleanup();
      await new Promise<void>((r) => model.close(() => r()));
    },
  };
}
test('calendar schedules use admin timezone, skip DST gaps and monthly missing days, and do not repeat folded times', () => {
  const next = (timing: any, after: string) => {
    const at = nextOccurrence(timing, 'America/Los_Angeles', Date.parse(after));
    return at === null ? null : new Date(at).toISOString();
  };
  assert.equal(
    next({ kind: 'daily', time: '07:00' }, '2026-03-07T16:00:00Z'),
    '2026-03-08T14:00:00.000Z',
  );
  assert.equal(
    next({ kind: 'daily', time: '02:30' }, '2026-03-08T00:00:00Z'),
    '2026-03-09T09:30:00.000Z',
  );
  assert.equal(
    next({ kind: 'daily', time: '01:30' }, '2026-11-01T08:45:00Z'),
    '2026-11-02T09:30:00.000Z',
  );
  assert.equal(
    next({ kind: 'once', date: '2026-03-08', time: '02:30' }, '2026-03-01T00:00:00Z'),
    null,
  );
  assert.equal(
    next({ kind: 'monthly', day: 31, time: '07:00' }, '2026-04-01T00:00:00Z'),
    '2026-05-31T14:00:00.000Z',
  );
  assert.equal(
    next({ kind: 'weekdays', time: '07:00' }, '2026-10-24T00:00:00Z'),
    '2026-10-26T14:00:00.000Z',
  );
});
test('chat creates a persistent review card without activating or sending', async () => {
  const f = await fixture((_body, step) =>
    step === 0 ? { name: 'schedule_task', args: taskInput } : undefined,
  );
  try {
    const response = await f.auth(`/conversations/${f.chat.id}/messages`, 'POST', {
      requestId: randomUUID(),
      text: 'Every day at 7 AM summarize our project.',
    });
    assert.equal(response.statusCode, 202);
    await waitUntil(() => !f.runner.active.has(f.chat.id));
    const tasks = f.scheduled.list(f.project.ownerId!);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]!.state, 'draft');
    assert.equal(f.runner.snapshot(f.chat.id).scheduled?.[0]?.id, tasks[0]!.id);
    assert.equal(f.scheduled.runs(tasks[0]!.id, f.project.ownerId!).length, 0);
    assert.ok(JSON.stringify(f.requests[0]).includes('administrator timezone UTC'));
    assert.throws(
      () => f.scheduled.prepare(f.store.createConversation(f.project.id, true).id, taskInput),
      /regular project/,
    );
    assert.throws(() =>
      f.scheduled.prepare(f.chat.id, {
        ...taskInput,
        timing: { kind: 'once', date: '2026-02-30', time: '07:00' },
      }),
    );
  } finally {
    await f.finish();
  }
});
test('schedules are private, revision checked, and timezone changes require new activation', async () => {
  const f = await fixture();
  try {
    const task = f.task();
    assert.equal(
      (await f.auth(`/scheduled/${task.id}/run`, 'POST', { revision: 1 })).statusCode,
      400,
    );
    const active = f.activate(task.id);
    assert.equal(active.state, 'active');
    assert.equal(
      (await f.auth(`/scheduled/${task.id}/pause`, 'POST', { revision: 1 })).statusCode,
      409,
    );
    const other = f.store.createUser('other', 'other-password-123', 'user', false);
    const login = await f.call('/auth/login', 'POST', {
      username: 'other',
      password: 'other-password-123',
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.deepEqual((await f.call('/scheduled', 'GET', undefined, cookie)).json().tasks, []);
    for (const [url, method, body] of [
      [`/scheduled/${task.id}`, 'GET', undefined],
      [`/scheduled/${task.id}/runs`, 'GET', undefined],
      [`/scheduled/${task.id}`, 'PATCH', { ...taskInput, revision: active.revision }],
      [`/scheduled/${task.id}/activate`, 'POST', { revision: active.revision }],
      [`/scheduled/${task.id}`, 'DELETE', { revision: active.revision }],
    ] as const)
      assert.equal((await f.call(url, method, body, cookie)).statusCode, 404);
    assert.equal(
      (await f.call('/admin/scheduled', 'PUT', { timezone: 'America/Los_Angeles' }, cookie))
        .statusCode,
      403,
    );
    assert.equal(
      (await f.auth('/admin/scheduled', 'PUT', { timezone: 'invalid' })).statusCode,
      400,
    );
    await f.auth('/admin/scheduled', 'PUT', { timezone: 'America/Los_Angeles' });
    const draft = f.scheduled.get(task.id);
    assert.equal(draft.state, 'draft');
    assert.equal(draft.nextRunAt, null);
    assert.equal(draft.timezone, 'America/Los_Angeles');
    assert.equal(
      (await f.auth(`/scheduled/${task.id}/activate`, 'POST', { revision: active.revision }))
        .statusCode,
      409,
    );
    f.activate(task.id, draft.revision);
    const updated = f.scheduled.update(task.id, f.project.ownerId!, {
      ...taskInput,
      instructions: 'Updated instructions',
      revision: f.scheduled.get(task.id).revision,
    });
    assert.equal(updated.state, 'draft');
    assert.equal(updated.nextRunAt, null);
    assert.ok(other.id);
  } finally {
    await f.finish();
  }
});
test('missed schedules catch up once, hidden results persist, and overlapping run-now is refused', async () => {
  const f = await fixture();
  try {
    const active = f.activate(f.task().id);
    const now = Date.parse('2030-06-20T12:00:00Z');
    f.store.db
      .prepare('UPDATE scheduled_tasks SET nextRunAt=? WHERE id=?')
      .run(Date.parse('2027-01-01T07:00:00Z'), active.id);
    await f.scheduled.tick(now);
    await f.scheduled.tick(now);
    assert.equal(
      (await f.auth(`/scheduled/${active.id}/run`, 'POST', { revision: active.revision }))
        .statusCode,
      409,
    );
    await waitUntil(() => !f.scheduled.jobs.size);
    const runs = f.scheduled.runs(active.id, f.project.ownerId!);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.status, 'completed');
    assert.equal(new Date(runs[0]!.scheduledAt).toISOString(), '2030-06-20T07:00:00.000Z');
    assert.equal(
      new Date(f.scheduled.get(active.id).nextRunAt!).toISOString(),
      '2030-06-21T07:00:00.000Z',
    );
    const visible = (await f.auth('/conversations')).json();
    assert.ok(!visible.some((c: any) => c.id === runs[0]!.conversationId));
    assert.match(
      f.runner.snapshot(runs[0]!.conversationId).messages.at(-1)!.text,
      /analysis completed/,
    );
    assert.equal(
      (
        await f.auth(`/conversations/${runs[0]!.conversationId}/messages`, 'POST', {
          requestId: randomUUID(),
          text: 'Edit this',
        })
      ).statusCode,
      409,
    );
    f.scheduled.remove(active.id, f.project.ownerId!, { revision: active.revision });
    assert.equal(f.store.conversation(runs[0]!.conversationId), undefined);
    assert.throws(() => f.scheduled.get(active.id), /not found/);
  } finally {
    await f.finish();
  }
});
test('scheduled emails send automatically to fixed recipients with generated attachments, after success only', async () => {
  const smtp = await smtpFixture();
  const f = await fixture((_body, step) =>
    step === 0
      ? {
          name: 'scheduled_email',
          args: {
            subject: 'Daily report',
            body: 'Completed analysis.',
            attachments: ['report.pdf'],
          },
        }
      : undefined,
  );
  try {
    f.email.save(smtpSettings(smtp.port));
    const task = f.scheduled.prepare(f.chat.id, {
      ...taskInput,
      recipients: ['alice@example.com'],
      attachments: 'generated',
    });
    assert.equal(smtp.messages.length, 0);
    const active = f.activate(task.id);
    f.scheduled.action(task.id, f.project.ownerId!, 'run', { revision: active.revision });
    const run = f.scheduled.runs(task.id, f.project.ownerId!)[0]!;
    const chat = f.store.conversation(run.conversationId)!;
    await mkdir(f.store.artifacts(chat), { recursive: true });
    await writeFile(path.join(f.store.artifacts(chat), 'report.pdf'), '%PDF-1.4 fixture');
    await waitUntil(() => !f.scheduled.jobs.size);
    assert.equal(f.scheduled.runs(task.id, f.project.ownerId!)[0]!.status, 'completed');
    assert.equal(smtp.messages.length, 1);
    assert.match(smtp.messages[0]!, /alice@example.com/);
    assert.match(smtp.messages[0]!, /report.pdf/);
    const tools = f.requests[0].tools.map((t: any) => t.function.name);
    for (const name of [
      'bash',
      'write',
      'edit',
      'email_prepare',
      'email_recipients',
      'ask_user_question',
      'schedule_task',
      'mssql_procedure',
    ])
      assert.ok(!tools.includes(name), name);
    assert.ok(tools.includes('scheduled_email'));
    assert.equal(
      (
        await f.auth(`/conversations/${run.conversationId}/emails/any/send`, 'POST', {
          revision: 1,
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.finish();
    await smtp.close();
  }
});
test('read-only enforcement rejects SQL writes, and failure emails reach owner', async () => {
  const smtp = await smtpFixture();
  const f = await fixture(
    (_body, step) =>
      [
        {
          name: 'mssql_query',
          args: { database: 'Dev', sql: 'DELETE FROM dbo.Table1', parameters: [] },
        },
        {
          name: 'scheduled_fail',
          args: { reason: 'Database changes are not supported in scheduled tasks.' },
        },
      ][step],
  );
  try {
    f.email.save(smtpSettings(smtp.port));
    f.store.db
      .prepare('UPDATE users SET email=? WHERE id=?')
      .run('owner@example.com', f.project.ownerId!);
    f.mssql.save(config);
    f.mssql.setProject(f.project.id, true);
    const active = f.activate(f.task().id);
    f.scheduled.action(active.id, f.project.ownerId!, 'run', { revision: active.revision });
    await waitUntil(() => !f.scheduled.jobs.size);
    const run = f.scheduled.runs(active.id, f.project.ownerId!)[0]!;
    assert.equal(run.status, 'failed');
    assert.equal(run.notification, 'accepted');
    assert.equal(f.sql.calls.filter((c) => c.login === 'write').length, 0);
    assert.equal(smtp.messages.length, 1);
    assert.match(smtp.messages[0]!, /owner@example.com/);
    assert.ok(
      f.runner.snapshot(run.conversationId).messages.some((m) => m.role === 'tool' && m.failed),
    );
  } finally {
    await f.finish();
    await smtp.close();
  }
});
test('disabled owners and changed email policy fail before model or delivery; interrupted runs are not replayed', async () => {
  const f = await fixture();
  try {
    const active = f.activate(f.task().id);
    f.store.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(f.project.ownerId!);
    f.store.db
      .prepare('UPDATE scheduled_tasks SET nextRunAt=? WHERE id=?')
      .run(Date.now() - 1, active.id);
    await f.scheduled.tick();
    await waitUntil(() => !f.scheduled.jobs.size);
    assert.equal(f.scheduled.runs(active.id, f.project.ownerId!)[0]!.status, 'failed');
    assert.equal(f.requests.length, 0);
    f.store.db.prepare('UPDATE users SET disabled=0 WHERE id=?').run(f.project.ownerId!);
    const run = f.scheduled.runs(active.id, f.project.ownerId!)[0]!;
    f.store.db.prepare("UPDATE scheduled_runs SET status='running' WHERE id=?").run(run.id);
    const recovered = new Scheduled(f.store, f.runner, f.email, async () => {
      throw new Error('Must not replay');
    });
    assert.equal(recovered.runs(active.id, f.project.ownerId!)[0]!.status, 'interrupted');
    await recovered.tick();
    assert.equal(f.requests.length, 0);
  } finally {
    await f.finish();
  }
});

test('fixed recipients and attachment policy cannot be overridden; reported failure prevents a prepared email from sending', async () => {
  const smtp = await smtpFixture();
  const f = await fixture(
    (_body, step) =>
      [
        {
          name: 'scheduled_email',
          args: {
            to: ['other@example.com'],
            subject: 'Changed audience',
            body: 'Wrong recipient',
            attachments: [],
          },
        },
        {
          name: 'scheduled_email',
          args: { subject: 'Unauthorized attachment', body: 'Body', attachments: ['report.pdf'] },
        },
        {
          name: 'scheduled_email',
          args: { subject: 'Prepared', body: 'Do not send on failure', attachments: [] },
        },
        { name: 'scheduled_fail', args: { reason: 'Required source data is unavailable.' } },
      ][step],
  );
  try {
    f.email.save(smtpSettings(smtp.port));
    const active = f.activate(
      f.scheduled.prepare(f.chat.id, { ...taskInput, recipients: ['alice@example.com'] }).id,
    );
    f.scheduled.action(active.id, f.project.ownerId!, 'run', { revision: active.revision });
    await waitUntil(() => !f.scheduled.jobs.size);
    const run = f.scheduled.runs(active.id, f.project.ownerId!)[0]!;
    assert.equal(run.status, 'failed');
    assert.match(run.error!, /Required source/);
    assert.equal(smtp.messages.length, 0);
    const drafts = f.email.list(run.conversationId);
    assert.equal(drafts.length, 1);
    assert.deepEqual(drafts[0]!.to, ['alice@example.com']);
    assert.ok(
      f.runner.snapshot(run.conversationId).messages.filter((m) => m.role === 'tool' && m.failed)
        .length >= 2,
    );
  } finally {
    await f.finish();
    await smtp.close();
  }
});

test('uncertain SMTP outcomes are recorded without automatic retries', async () => {
  const smtp = await smtpFixture();
  smtp.state.dropAfterData = true;
  const f = await fixture((_body, step) =>
    step === 0
      ? {
          name: 'scheduled_email',
          args: { subject: 'Uncertain', body: 'Only send once.', attachments: [] },
        }
      : undefined,
  );
  try {
    f.email.save(smtpSettings(smtp.port));
    const active = f.activate(
      f.scheduled.prepare(f.chat.id, { ...taskInput, recipients: ['alice@example.com'] }).id,
    );
    f.scheduled.action(active.id, f.project.ownerId!, 'run', { revision: active.revision });
    await waitUntil(() => !f.scheduled.jobs.size);
    const run = f.scheduled.runs(active.id, f.project.ownerId!)[0]!;
    assert.equal(run.status, 'failed');
    assert.match(run.error!, /unknown/);
    assert.equal(f.email.list(run.conversationId)[0]!.status, 'uncertain');
    assert.equal(smtp.messages.length, 1);
    await f.scheduled.tick();
    await f.scheduled.tick();
    assert.equal(smtp.messages.length, 1);
    assert.equal(
      (await f.auth(`/scheduled/${active.id}/run`, 'POST', { revision: active.revision }))
        .statusCode,
      409,
    );
  } finally {
    await f.finish();
    await smtp.close();
  }
});

test('deleting the source chat preserves the task; deleting its project cascades schedules and run outputs', async () => {
  const f = await fixture();
  try {
    const active = f.activate(f.task().id);
    assert.equal(
      (await f.auth(`/conversations/${f.chat.id}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    assert.equal(f.scheduled.get(active.id).sourceConversationId, null);
    f.store.updateProject(f.project.id, {
      ...f.project,
      instructions: 'CURRENT_PROJECT_INSTRUCTIONS',
    });
    f.scheduled.action(active.id, f.project.ownerId!, 'run', { revision: active.revision });
    await waitUntil(() => !f.scheduled.jobs.size);
    assert.ok(JSON.stringify(f.requests[0]).includes('CURRENT_PROJECT_INSTRUCTIONS'));
    const run = f.scheduled.runs(active.id, f.project.ownerId!)[0]!;
    f.store.createUser('outsider', 'outsider-password-123', 'user', false);
    const login = await f.call('/auth/login', 'POST', {
      username: 'outsider',
      password: 'outsider-password-123',
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    for (const suffix of ['', '/artifacts', '/artifacts/report.pdf'])
      assert.equal(
        (await f.call(`/conversations/${run.conversationId}${suffix}`, 'GET', undefined, cookie))
          .statusCode,
        404,
      );
    assert.equal(
      (await f.auth(`/projects/${f.project.id}`, 'DELETE', { confirm: true })).statusCode,
      200,
    );
    assert.throws(() => f.scheduled.get(active.id), /not found/);
    assert.equal(
      f.store.db.prepare('SELECT 1 FROM scheduled_runs WHERE id=?').get(run.id),
      undefined,
    );
    assert.equal(f.store.conversation(run.conversationId), undefined);
  } finally {
    await f.finish();
  }
});

test(
  'scheduled execution generates a real branded PDF and sends that output without review',
  { skip: !process.env.FRAME_PYTHON },
  async () => {
    const smtp = await smtpFixture();
    let filename = '';
    const f = await fixture((body, step) => {
      if (step === 0)
        return {
          name: 'reports_create',
          args: {
            title: 'Scheduled Report',
            blocks: [
              {
                type: 'markdown',
                text: '## Summary\n\nScheduled report generated from the authorized task.',
              },
            ],
          },
        };
      if (step === 1) {
        const result = body.messages.findLast((m: any) => m.role === 'tool');
        const output = JSON.parse(
          typeof result.content === 'string' ? result.content : result.content[0].text,
        );
        filename = output.name;
        return {
          name: 'scheduled_email',
          args: {
            subject: 'Scheduled Report',
            body: 'The requested PDF is attached.',
            attachments: [filename],
          },
        };
      }
    });
    try {
      f.email.save(smtpSettings(smtp.port));
      f.reports.update({
        enabled: true,
        profile: { ...f.reports.profile(), organization: 'Scheduled Test Organization' },
      });
      f.reports.setProject(f.project.id, true);
      const active = f.activate(
        f.scheduled.prepare(f.chat.id, {
          ...taskInput,
          instructions: 'Create a PDF report and email it to the saved recipients.',
          recipients: ['alice@example.com'],
          attachments: 'generated',
        }).id,
      );
      f.scheduled.action(active.id, f.project.ownerId!, 'run', { revision: active.revision });
      await waitUntil(() => !f.scheduled.jobs.size, 45000);
      const run = f.scheduled.runs(active.id, f.project.ownerId!)[0]!;
      assert.equal(run.status, 'completed', run.error || '');
      assert.ok(filename.endsWith('.pdf'));
      const download = await f.auth(
        `/conversations/${run.conversationId}/artifacts/${encodeURIComponent(filename)}`,
      );
      assert.equal(download.statusCode, 200);
      assert.equal(download.rawPayload.subarray(0, 5).toString(), '%PDF-');
      assert.equal(smtp.messages.length, 1);
      assert.match(smtp.messages[0]!, /application\/pdf/);
    } finally {
      await f.finish();
      await smtp.close();
    }
  },
);
