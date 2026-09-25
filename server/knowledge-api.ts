import { queryTemplate } from './maintenance/extraction.js';
import { discoverySchema } from './knowledge-discovery.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Knowledge } from './knowledge.js';
import { Wiki } from './wiki.js';
import { Runner } from './runner.js';
import { openArtifact } from './security.js';

const uuid = z.string().uuid();
const textSchema = z.string().trim().min(1).max(120000);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function knowledgeApi(
  app: FastifyInstance,
  knowledge: Knowledge,
  wiki: Wiki,
  runner: Runner,
) {
  const projectId = (id: string) => {
    uuid.parse(id);
    if (!knowledge.store.project(id))
      throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    return id;
  };
  const change = <T>(id: string, action: () => Promise<T>) =>
    knowledge.write(projectId(id), async () => {
      if (runner.projectBusy(id))
        throw Object.assign(
          new Error('Wait for this project’s task to finish before changing knowledge.'),
          { statusCode: 409 },
        );
      return action();
    });
  app.get('/api/document-tools', () => knowledge.python.status());
  app.post('/api/document-tools/install', async (request, reply) => {
    z.object({ confirm: z.literal(true) }).parse(request.body);
    if (runner.active.size || knowledge.locks.size)
      return reply
        .code(409)
        .send({ error: 'Wait for active tasks and uploads before installing.' });
    if (process.env.FRAME_PYTHON)
      return reply.code(409).send({
        error:
          'FRAME_PYTHON is externally managed. Install python/requirements.txt in that environment.',
      });
    void knowledge.python.install().catch(() => {});
    return reply.code(202).send({ ok: true });
  });
  type Params = { id: string; documentId: string };
  app.get<{ Params: Params }>('/api/projects/:id/documents', async (request) =>
    knowledge.list(projectId(request.params.id)),
  );
  app.post<{ Params: Params }>('/api/projects/:id/documents', async (request) =>
    change(request.params.id, async () => {
      const file = await request.file();
      if (!file)
        throw Object.assign(new Error('Choose a document to upload.'), { statusCode: 400 });
      const doc = await knowledge.add(request.params.id, file.filename, await file.toBuffer());
      await wiki.record(doc.projectId, doc.id);
      return doc;
    }),
  );
  app.post<{ Params: Params }>('/api/projects/:id/wiki', { bodyLimit: 500000 }, async (request) =>
    change(request.params.id, async () => {
      const { name, text } = z
        .object({ name: z.string().trim().min(1).max(160), text: textSchema })
        .parse(request.body);
      const doc = await knowledge.add(
        request.params.id,
        name.endsWith('.md') ? name : `${name}.md`,
        Buffer.from(text),
        'wiki',
      );
      await wiki.record(doc.projectId, doc.id);
      return doc;
    }),
  );
  app.get<{ Params: Params }>('/api/projects/:id/documents/:documentId', async (request) => {
    const doc = await knowledge.read(
      projectId(request.params.id),
      uuid.parse(request.params.documentId),
    );
    return { ...doc, metadata: wiki.metadata(doc.id) };
  });
  app.put<{ Params: Params }>('/api/projects/:id/documents/:documentId/metadata', async (request) =>
    change(request.params.id, async () => {
      const { revision, discovery } = z
        .object({ revision: z.string().length(64), discovery: discoverySchema })
        .parse(request.body);
      const doc = await knowledge.read(request.params.id, uuid.parse(request.params.documentId));
      if (doc.revision !== revision)
        throw Object.assign(new Error('Page changed. Reopen it first.'), { statusCode: 409 });
      await wiki.record(doc.projectId, doc.id, { discovery });
      return { ok: true };
    }),
  );
  app.delete<{ Params: Params }>('/api/projects/:id/documents/:documentId', async (request) =>
    change(request.params.id, async () => {
      const { revision } = z.object({ revision: z.string().length(64) }).parse(request.body);
      return wiki.remove(request.params.id, uuid.parse(request.params.documentId), revision);
    }),
  );
  app.put<{ Params: Params }>(
    '/api/projects/:id/documents/:documentId',
    { bodyLimit: 500000 },
    async (request) =>
      change(request.params.id, async () => {
        const { revision, text, verified } = z
          .object({
            revision: z.string().length(64),
            text: textSchema,
            verified: z.boolean().default(false),
          })
          .parse(request.body);
        const doc = await knowledge.edit(
          request.params.id,
          uuid.parse(request.params.documentId),
          revision,
          text,
        );
        await wiki.record(doc.projectId, doc.id, { verified });
        return doc;
      }),
  );
  app.get<{ Params: Params }>(
    '/api/projects/:id/documents/:documentId/revisions',
    async (request) =>
      wiki.revisions(projectId(request.params.id), uuid.parse(request.params.documentId)),
  );
  app.get<{ Params: Params }>(
    '/api/projects/:id/documents/:documentId/download',
    async (request, reply) => {
      const doc = knowledge.get(
        projectId(request.params.id),
        uuid.parse(request.params.documentId),
      );
      const { file, size } = await openArtifact(
        await knowledge.checkedDirectory(doc),
        doc.kind === 'wiki' ? 'content.md' : `source${doc.extension}`,
      );
      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Length', size)
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g, '%27')}`,
        )
        .header('Content-Security-Policy', "sandbox; default-src 'none'");
      return reply.send(file.createReadStream({ autoClose: true }));
    },
  );
  app.get<{ Params: Params }>('/api/projects/:id/knowledge/export', async (request, reply) =>
    change(request.params.id, async () => {
      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', 'attachment; filename="frame-knowledge.zip"');
      return wiki.export(request.params.id);
    }),
  );
  const evidence = (id: string, index: number) => {
    const conversation = knowledge.store.conversation(uuid.parse(id));
    if (!conversation)
      throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
    if (conversation.incognito)
      throw Object.assign(new Error('Incognito chats cannot be saved to knowledge.'), {
        statusCode: 403,
      });
    const snapshot = runner.snapshot(id);
    if (snapshot.running)
      throw Object.assign(new Error('Wait for the response to finish before saving knowledge.'), {
        statusCode: 409,
      });
    let message = snapshot.messages[index];
    const structuralOnly =
      snapshot.messages.some((m) => m.name?.startsWith('mssql_')) ||
      !!knowledge.store.db
        .prepare('SELECT 1 FROM mssql_operations WHERE conversationId=? LIMIT 1')
        .get(id);
    if (structuralOnly) {
      const operation = message?.sqlResult?.operationId;
      const row = operation
        ? (knowledge.store.db
            .prepare(
              "SELECT sql FROM mssql_operations WHERE id=? AND conversationId=? AND kind='read' AND status='completed'",
            )
            .get(operation, id) as { sql: string } | undefined)
        : undefined;
      const template = row?.sql ? queryTemplate(row.sql) : undefined;
      if (!template)
        throw Object.assign(
          new Error(
            'SQL conversations can save only parameterized query templates. Use Save useful result on a successful SELECT query; results and example values are excluded.',
          ),
          { statusCode: 400 },
        );
      message = {
        ...message!,
        text:
          'Parameterized query template. Review parameters and current schema before use. No results or example values are retained.\n\n```sql\n' +
          template +
          '\n```',
        proposal: undefined,
      };
    }
    if (
      !message ||
      !['assistant', 'tool'].includes(message.role) ||
      (!message.text && !message.proposal)
    )
      throw Object.assign(new Error('Response not found'), { statusCode: 404 });
    const source = {
      conversationId: id,
      messageIndex: index,
      role: message.role,
      tool: message.name,
      text: message.text,
      failed: message.failed,
      proposal: message.proposal,
    };
    const sourceIds = [
      ...new Set(
        snapshot.messages
          .slice(0, index + 1)
          .flatMap((m) => [
            ...(m.attachments?.map((a) => a.id) || []),
            ...(m.knowledgeSourceId ? [m.knowledgeSourceId] : []),
          ]),
      ),
    ];
    const available = new Set(knowledge.list(conversation.projectId).map((doc) => doc.id));
    return {
      structuralOnly,
      conversation,
      message,
      source,
      sourceRevision: hash(source),
      sourceIds: sourceIds.filter((id) => available.has(id)),
    };
  };
  app.get<{ Params: { id: string; index: string } }>(
    '/api/conversations/:id/knowledge/:index',
    async (request) => {
      const value = evidence(
        request.params.id,
        z.coerce.number().int().min(0).parse(request.params.index),
      );
      return {
        structuralOnly: value.structuralOnly,
        sourceRevision: value.sourceRevision,
        text: value.message.proposal?.text || value.message.text,
        title: value.structuralOnly
          ? 'SQL Query Template'
          : value.message.proposal?.title || 'Conversation note',
        targetId: value.message.proposal?.targetId,
        revision: value.message.proposal?.revision,
        sourceIds: value.sourceIds,
      };
    },
  );
  app.post<{ Params: { id: string; index: string } }>(
    '/api/conversations/:id/knowledge/:index',
    { bodyLimit: 500000 },
    async (request) => {
      const body = z
        .object({
          sourceRevision: z.string().length(64),
          title: z.string().trim().min(1).max(160),
          text: textSchema,
          targetId: uuid.optional(),
          revision: z.string().length(64).optional(),
          verified: z.boolean().default(false),
          sourceIds: z.array(uuid).max(100).default([]),
        })
        .parse(request.body);
      const value = evidence(
        request.params.id,
        z.coerce.number().int().min(0).parse(request.params.index),
      );
      if (value.structuralOnly && body.text !== value.message.text)
        throw Object.assign(
          new Error(
            'SQL knowledge must use the sanitized query template without added values or examples.',
          ),
          { statusCode: 400 },
        );
      return change(value.conversation.projectId, async () => {
        if (body.sourceRevision !== value.sourceRevision)
          throw Object.assign(new Error('Conversation changed. Reopen the knowledge draft.'), {
            statusCode: 409,
          });
        for (const id of body.sourceIds) knowledge.get(value.conversation.projectId, id);
        const doc = body.targetId
          ? await knowledge.edit(
              value.conversation.projectId,
              body.targetId,
              body.revision || '',
              body.text,
            )
          : await knowledge.add(
              value.conversation.projectId,
              body.title.endsWith('.md') ? body.title : `${body.title}.md`,
              Buffer.from(body.text),
              'wiki',
            );
        await wiki.record(doc.projectId, doc.id, {
          generatedBy: 'frame-conversation/0.2.0',
          verified: body.verified,
          evidence: value.source,
          sourceIds: [...new Set([...value.sourceIds, ...body.sourceIds])],
        });
        return doc;
      });
    },
  );
}
