import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Knowledge } from './knowledge.js';
import type { Wiki } from './wiki.js';
import type { Runner } from './runner.js';
import { openArtifact } from './security.js';

export function chatFilesApi(
  app: FastifyInstance,
  knowledge: Knowledge,
  wiki: Wiki,
  runner: Runner,
) {
  const scope = (id: string) => {
    z.uuid().parse(id);
    const files = knowledge.forConversation(id);
    return { files, conversation: knowledge.store.conversation(id)! };
  };
  type Params = { id: string; fileId: string };
  app.get<{ Params: Params }>('/api/conversations/:id/files', (request) => {
    const { files, conversation } = scope(request.params.id);
    return files.list(conversation.projectId);
  });
  app.post<{ Params: Params }>('/api/conversations/:id/files', async (request) => {
    const { files, conversation } = scope(request.params.id);
    return knowledge.write(conversation.projectId, async () => {
      if (runner.projectBusy(conversation.projectId))
        throw Object.assign(new Error('Wait for the task to finish before uploading.'), {
          statusCode: 409,
        });
      const file = await request.file();
      if (!file) throw Object.assign(new Error('Choose a file to upload.'), { statusCode: 400 });
      return files.add(conversation.projectId, file.filename, await file.toBuffer());
    });
  });
  app.get<{ Params: Params }>('/api/conversations/:id/files/:fileId', async (request, reply) => {
    const { files, conversation } = scope(request.params.id);
    const doc = files.get(conversation.projectId, z.uuid().parse(request.params.fileId));
    const { file, size } = await openArtifact(
      await files.checkedDirectory(doc),
      `source${doc.extension}`,
    );
    try {
      if (size > 10 * 1024 * 1024) throw new Error('File exceeds upload limit.');
      return reply
        .type('application/octet-stream')
        .header('Cache-Control', 'no-store')
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        )
        .send(await file.readFile());
    } finally {
      await file.close();
    }
  });
  app.post<{ Params: Params }>(
    '/api/conversations/:id/files/:fileId/knowledge',
    async (request) => {
      const { files, conversation } = scope(request.params.id);
      z.object({ confirm: z.literal(true) }).parse(request.body);
      if (conversation.incognito)
        throw Object.assign(new Error('Incognito files cannot be saved to project knowledge.'), {
          statusCode: 400,
        });
      return knowledge.write(conversation.projectId, async () => {
        if (runner.projectBusy(conversation.projectId))
          throw Object.assign(new Error('Wait for the task to finish before saving.'), {
            statusCode: 409,
          });
        const doc = files.get(conversation.projectId, z.uuid().parse(request.params.fileId));
        const key = `chat-file-knowledge:${doc.id}`;
        const existing = knowledge.store.meta(key);
        if (existing && knowledge.list(conversation.projectId).some((d) => d.id === existing))
          return knowledge.get(conversation.projectId, existing);
        const { file, size } = await openArtifact(
          await files.checkedDirectory(doc),
          `source${doc.extension}`,
        );
        try {
          if (size > 10 * 1024 * 1024) throw new Error('File exceeds upload limit.');
          const saved = await knowledge.add(
            conversation.projectId,
            doc.name,
            await file.readFile(),
          );
          knowledge.store.setMeta(key, saved.id);
          await wiki.record(saved.projectId, saved.id);
          return saved;
        } finally {
          await file.close();
        }
      });
    },
  );
}
