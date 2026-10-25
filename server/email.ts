import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import { emailAddressSchema } from './auth.js';
import { openArtifact } from './security.js';
import {
  EMAIL_FOOTER,
  type EmailDraft,
  type SmtpSettings,
  type EmailRecipient,
} from '../shared/email.js';
const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const line = z
  .string()
  .trim()
  .regex(/^[^\x00-\x1f\x7f]*$/);
const configSchema = z
  .object({
    enabled: z.boolean(),
    host: line.max(253),
    port: z.number().int().min(1).max(65535),
    security: z.enum(['starttls', 'tls', 'none']),
    username: line.max(254),
    fromName: line.max(120),
    fromEmail: z.union([emailAddressSchema, z.literal('')]),
    domains: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/),
      )
      .max(50),
    password: z.string().max(1024).optional(),
    clearPassword: z.boolean().optional(),
  })
  .strict();
const contentSchema = z
  .object({
    to: z.array(emailAddressSchema).min(1).max(20),
    subject: line.min(1).max(250),
    body: z
      .string()
      .trim()
      .min(1)
      .max(50000)
      .refine((s) => !s.includes('\0')),
    attachments: z.array(line.min(1).max(200)).max(10).default([]),
  })
  .strict();
const allowedExtensions = new Set([
  '.pdf',
  '.docx',
  '.xlsx',
  '.csv',
  '.txt',
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
  '.pptx',
]);
const maxBytes = 20 * 1024 * 1024;
type Config = Omit<SmtpSettings, 'hasPassword'> & { password: string };
const defaults: Config = {
  enabled: false,
  host: '',
  port: 587,
  security: 'starttls',
  username: '',
  password: '',
  fromName: 'Frame',
  fromEmail: '',
  domains: [],
};
export class Email extends EventEmitter {
  private sends = new Map<string, Promise<EmailDraft>>();
  constructor(readonly store: Store) {
    super();
    store.db.exec(
      `CREATE TABLE IF NOT EXISTS email_drafts (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, configHash TEXT NOT NULL, payload TEXT NOT NULL)`,
    );
    store.db.exec(
      'CREATE INDEX IF NOT EXISTS email_drafts_conversation ON email_drafts(conversationId)',
    );
    store.db.exec("UPDATE email_drafts SET status='uncertain' WHERE status='sending'");
  }
  private config(): Config {
    return { ...defaults, ...JSON.parse(this.store.meta('email:settings') || '{}') };
  }
  settings(): SmtpSettings {
    const { password, ...rest } = this.config();
    return { ...rest, hasPassword: !!password };
  }
  save(input: unknown) {
    const { password, clearPassword, ...data } = configSchema.parse(input);
    const config = {
      ...data,
      domains: [...new Set(data.domains)],
      password: clearPassword ? '' : password || this.config().password,
    };
    if (config.enabled && (!config.host || !config.fromEmail || !config.domains.length))
      throw fail('Enter the SMTP host, sender email, and approved domains.');
    if (config.security === 'none' && config.username)
      throw fail(
        'SMTP authentication requires TLS. Use an unauthenticated relay for unencrypted SMTP.',
      );
    this.store.setMeta('email:settings', JSON.stringify(config));
    return this.settings();
  }
  private transport(c: Config) {
    return nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.security === 'tls',
      requireTLS: c.security === 'starttls',
      ignoreTLS: c.security === 'none',
      ...(c.username ? { auth: { user: c.username, pass: c.password } } : {}),
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      dnsTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  }
  async verify() {
    const c = this.config();
    if (!c.host) throw fail('Configure an SMTP host first.');
    const transport = this.transport(c);
    try {
      await transport.verify();
      return { message: 'SMTP connection verified. No email was sent.' };
    } catch {
      throw fail(
        'SMTP connection failed. Check the host, port, TLS certificate, and credentials.',
        502,
      );
    } finally {
      transport.close();
    }
  }
  private context(conversationId: string) {
    const chat = this.store.conversation(conversationId);
    const user = chat && this.store.user(this.store.project(chat.projectId)?.ownerId || '');
    if (!chat || !user || user.disabled) throw fail('Conversation unavailable.', 404);
    if (chat.incognito) throw fail('Email is unavailable in incognito chats.');
    if (!this.config().enabled) throw fail('Email is not configured by the administrator.', 409);
    return { chat, user };
  }
  modelContext(conversationId: string) {
    try {
      const { user } = this.context(conversationId);
      return {
        displayName: user.displayName || user.username,
        email: user.email || '',
        domains: this.config().domains,
        recent: this.list(conversationId)
          .slice(-5)
          .map(({ id, status, subject, message }) => ({ id, status, subject, message })),
      };
    } catch {
      return undefined;
    }
  }
  private recipients(to: string[], c: Config) {
    const addresses = [...new Set(to)];
    if (addresses.some((email) => !c.domains.includes(email.split('@')[1]!)))
      throw fail('Every recipient must use an exact admin-approved internal domain.');
    return addresses;
  }
  lookup(conversationId: string, query: string) {
    const { user } = this.context(conversationId);
    const q = z.string().trim().min(1).max(254).parse(query).toLowerCase();
    const rows = (
      q === 'me'
        ? [user]
        : this.store.db
            .prepare(
              "SELECT id,username,displayName,email FROM users WHERE disabled=0 AND email<>''",
            )
            .all()
    ) as any[];
    const matches = rows.filter(
      (u) =>
        u.email &&
        this.config().domains.includes(u.email.split('@')[1]) &&
        (q === 'me' ||
          [u.displayName || u.username, u.email].some((v) => String(v).toLowerCase().includes(q))),
    );
    return {
      recipients: matches.slice(0, 20).map((u): EmailRecipient => ({
        id: u.id,
        displayName: u.displayName || u.username,
        email: u.email,
      })),
      more: matches.length > 20,
      instruction:
        'Never guess an email address. Ask the user to choose when more than one person matches. Other recipients require an exact address from the user.',
    };
  }
  async outputs(conversationId: string) {
    const { chat } = this.context(conversationId);
    const names = await readdir(this.store.artifacts(chat)).catch(() => []);
    const result: { name: string; bytes: number }[] = [];
    for (const name of names) {
      if (!allowedExtensions.has(path.extname(name).toLowerCase())) continue;
      try {
        const { file, size } = await openArtifact(this.store.artifacts(chat), name);
        await file.close();
        if (size <= maxBytes) result.push({ name, bytes: size });
      } catch {}
    }
    return result;
  }
  private async attachmentData(conversationId: string, names: string[]) {
    const { chat } = this.context(conversationId);
    if (new Set(names).size !== names.length) throw fail('Choose each attachment only once.');
    const result: { name: string; bytes: number; hash: string; content: Buffer }[] = [];
    let total = 0;
    for (const name of names) {
      if (!allowedExtensions.has(path.extname(name).toLowerCase()))
        throw fail('Unsupported generated attachment type.');
      let opened;
      try {
        opened = await openArtifact(this.store.artifacts(chat), name);
      } catch {
        throw fail('Generated attachment unavailable in this conversation.');
      }
      try {
        total += opened.size;
        if (total > maxBytes) throw fail('Attachments must total at most 20 MiB.');
        // Read at most the validated size plus one byte, even if a worker is still writing.
        const bytes = Buffer.alloc(opened.size + 1);
        let length = 0;
        while (length < bytes.length) {
          const read = await opened.file.read(bytes, length, bytes.length - length, length);
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        if (length !== opened.size)
          throw fail('Attachment changed. Wait for generation to finish.');
        const content = bytes.subarray(0, length);
        result.push({ name, bytes: length, hash: hash(content), content });
      } finally {
        await opened.file.close();
      }
    }
    return result;
  }
  list(conversationId: string): EmailDraft[] {
    return (
      this.store.db
        .prepare('SELECT id FROM email_drafts WHERE conversationId=? ORDER BY rowid DESC LIMIT 30')
        .all(conversationId) as any[]
    )
      .reverse()
      .map((r) => this.get(conversationId, r.id));
  }
  get(conversationId: string, id: string): EmailDraft {
    const row = this.store.db
      .prepare('SELECT * FROM email_drafts WHERE id=? AND conversationId=?')
      .get(id, conversationId) as any;
    if (!row) throw fail('Email draft not found.', 404);
    const draft = {
      ...JSON.parse(row.payload),
      revision: row.revision,
      status: row.status,
    } as EmailDraft;
    if (row.status === 'uncertain')
      draft.message =
        'SMTP outcome is unknown. Check the mail server before preparing another email; it may already have been accepted.';
    if (row.status === 'cancelled') draft.message = 'Email cancelled. Nothing was sent.';
    if (row.status === 'sending') draft.message = 'Sending to SMTP…';
    return draft;
  }
  async prepare(
    conversationId: string,
    input: unknown,
    previous?: { id: string; revision: number },
  ) {
    this.context(conversationId);
    const parsed = contentSchema.parse(input);
    const c = this.config();
    const to = this.recipients(parsed.to, c);
    const attachments = (await this.attachmentData(conversationId, parsed.attachments)).map(
      ({ content: _, ...a }) => a,
    );
    this.context(conversationId); // Recheck after reading files: the account/chat may have changed.
    const draft: EmailDraft = {
      id: previous?.id || randomUUID(),
      conversationId,
      revision: (previous?.revision || 0) + 1,
      to,
      subject: parsed.subject,
      body: parsed.body,
      attachments,
      from: { name: c.fromName, address: c.fromEmail },
      status: 'draft',
      message: 'Review this email and click Send to confirm.',
      accepted: [],
      rejected: [],
      createdAt: new Date().toISOString(),
    };
    if (previous) {
      const result = this.store.db
        .prepare(
          "UPDATE email_drafts SET revision=?, configHash=?, payload=? WHERE id=? AND conversationId=? AND revision=? AND status='draft'",
        )
        .run(
          draft.revision,
          hash(JSON.stringify(c)),
          JSON.stringify(draft),
          previous.id,
          conversationId,
          previous.revision,
        );
      if (!result.changes)
        throw fail('The email changed or is no longer editable. Reload it before continuing.', 409);
    } else {
      if (this.list(conversationId).some((d) => d.status === 'draft' || d.status === 'sending'))
        throw fail('Send or cancel the existing email draft first.', 409);
      this.store.db
        .prepare('INSERT INTO email_drafts VALUES (?,?,?,?,?,?)')
        .run(
          draft.id,
          conversationId,
          draft.revision,
          'draft',
          hash(JSON.stringify(c)),
          JSON.stringify(draft),
        );
    }
    this.emit('change', conversationId);
    return draft;
  }
  cancel(conversationId: string, id: string, revision: number) {
    const result = this.store.db
      .prepare(
        "UPDATE email_drafts SET status='cancelled' WHERE id=? AND conversationId=? AND revision=? AND status='draft'",
      )
      .run(id, conversationId, revision);
    if (!result.changes) throw fail('This draft changed or has already been submitted.', 409);
    this.emit('change', conversationId);
    return this.get(conversationId, id);
  }
  async send(conversationId: string, id: string, revision: number) {
    this.context(conversationId);
    const draft = this.get(conversationId, id);
    if (draft.revision !== revision) throw fail('Review the latest draft before sending.', 409);
    if (draft.status !== 'draft') return draft; // Repeated confirmation never sends again.
    const c = this.config();
    this.recipients(draft.to, c);
    const row = this.store.db
      .prepare('SELECT configHash FROM email_drafts WHERE id=?')
      .get(id) as any;
    if (row.configHash !== hash(JSON.stringify(c)))
      throw fail('SMTP settings changed. Edit and save the draft, then review it again.', 409);
    const attachments = await this.attachmentData(
      conversationId,
      draft.attachments.map((a) => a.name),
    );
    if (attachments.some((a, i) => a.hash !== draft.attachments[i]!.hash))
      throw fail('An attachment changed. Edit and save the draft, then review it again.', 409);
    this.context(conversationId);
    if (hash(JSON.stringify(this.config())) !== row.configHash)
      throw fail('SMTP settings changed. Review a refreshed draft.', 409);
    const claim = this.store.db
      .prepare(
        "UPDATE email_drafts SET status='sending' WHERE id=? AND conversationId=? AND revision=? AND status='draft'",
      )
      .run(id, conversationId, revision);
    if (!claim.changes) return this.get(conversationId, id);
    this.emit('change', conversationId);
    const operation = (async () => {
      const transport = this.transport(c);
      const timeout = setTimeout(() => transport.close(), 60000);
      try {
        const info = await transport.sendMail({
          from: draft.from,
          to: draft.to.map((address) => ({ address, name: '' })),
          subject: draft.subject,
          text: `${draft.body}\n\n${EMAIL_FOOTER}`,
          messageId: `<${draft.id}@${c.fromEmail.split('@')[1]}>`,
          headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
          attachments: attachments.map((a) => ({ filename: a.name, content: a.content })),
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        draft.accepted = (info.accepted || []).map(String);
        draft.rejected = (info.rejected || []).map(String);
        draft.status = draft.rejected.length
          ? draft.accepted.length
            ? 'partial'
            : 'failed'
          : 'accepted';
        draft.message =
          draft.status === 'accepted'
            ? 'Accepted by SMTP. Delivery is not confirmed.'
            : 'SMTP accepted only the listed recipients, or rejected the message. Check the result before preparing another email.';
      } catch (error) {
        const code = (error as any).code;
        const command = String((error as any).command || '');
        // Only failures known to precede DATA are safe to label failed. Never automatically retry.
        draft.status =
          ['EAUTH', 'EDNS', 'ETLS', 'EENVELOPE'].includes(code) ||
          /^(EHLO|HELO|STARTTLS|AUTH|MAIL FROM|RCPT TO)/.test(command)
            ? 'failed'
            : 'uncertain';
        draft.message =
          draft.status === 'failed'
            ? 'SMTP did not accept the message. Ask an administrator to check the connection and recipient policy.'
            : 'SMTP outcome is unknown. Check the mail server before preparing another email.';
      } finally {
        clearTimeout(timeout);
        transport.close();
      }
      this.store.db
        .prepare('UPDATE email_drafts SET status=?,payload=? WHERE id=?')
        .run(draft.status, JSON.stringify(draft), id);
      this.emit('change', conversationId);
      return this.get(conversationId, id);
    })();
    this.sends.set(id, operation);
    try {
      return await operation;
    } finally {
      this.sends.delete(id);
    }
  }
  busy(projectId: string) {
    return !!this.store.db
      .prepare(
        "SELECT 1 FROM email_drafts e JOIN conversations c ON c.id=e.conversationId WHERE c.projectId=? AND e.status='sending'",
      )
      .get(projectId);
  }
  async close() {
    await Promise.allSettled(this.sends.values());
  }
}
export function emailApi(app: FastifyInstance, email: Email) {
  app.get('/api/admin/email', () => email.settings());
  app.put('/api/admin/email', (request) => email.save(request.body));
  app.post('/api/admin/email/verify', async (_request, reply) => {
    try {
      return await email.verify();
    } catch (error) {
      if ((error as any).statusCode !== 502) throw error;
      return reply.code(502).send({
        error: 'SMTP connection failed. Check the host, port, TLS certificate, and credentials.',
      });
    }
  });
  app.get<{ Params: { id: string }; Querystring: { query: string } }>(
    '/api/conversations/:id/email/recipients',
    (request) => email.lookup(request.params.id, request.query.query),
  );
  app.get<{ Params: { id: string } }>('/api/conversations/:id/email/outputs', (request) =>
    email.outputs(request.params.id),
  );
  app.get<{ Params: { id: string } }>('/api/conversations/:id/emails', (request) =>
    email.list(request.params.id),
  );
  app.patch<{ Params: { id: string; draft: string } }>(
    '/api/conversations/:id/emails/:draft',
    (request) => {
      const { revision, ...content } = z
        .object({ revision: z.number().int().positive(), ...contentSchema.shape })
        .strict()
        .parse(request.body);
      return email.prepare(request.params.id, content, { id: request.params.draft, revision });
    },
  );
  for (const action of ['send', 'cancel'] as const)
    app.post<{ Params: { id: string; draft: string } }>(
      `/api/conversations/:id/emails/:draft/${action}`,
      (request) => {
        const { revision } = z
          .object({ revision: z.number().int().positive() })
          .strict()
          .parse(request.body);
        return email[action](request.params.id, request.params.draft, revision);
      },
    );
}
