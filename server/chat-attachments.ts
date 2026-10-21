import type { Knowledge } from './knowledge.js';

/** Resolve selected files within this conversation/project, using the same excerpt budget in both UIs. */
export async function chatAttachments(
  knowledge: Knowledge,
  id: string,
  projectId: string,
  documentIds: string[],
) {
  const chatFiles = knowledge.forConversation(id);
  const localIds = new Set(chatFiles.list(projectId).map((d) => d.id));
  if (new Set(documentIds).size !== documentIds.length)
    throw Object.assign(new Error('Attach distinct files.'), { statusCode: 400 });
  const documents = [];
  let documentBudget = Math.min(24000, Math.floor(knowledge.store.settings().contextWindow / 2));
  for (const documentId of documentIds) {
    const source = localIds.has(documentId) ? chatFiles : knowledge;
    const doc = await source.read(projectId, documentId);
    const limit = Math.floor(documentBudget / (documentIds.length - documents.length));
    const text = doc.text.slice(0, limit);
    documentBudget -= text.length;
    documents.push({
      id: doc.id,
      name: doc.name,
      source: localIds.has(documentId) ? ('chat_upload' as const) : ('project_knowledge' as const),
      text:
        text +
        (text.length < doc.text.length || doc.truncated
          ? `\n[Excerpt truncated. Use ${localIds.has(documentId) ? 'read_chat_file' : 'read_knowledge'} with this ID for later sections.]`
          : ''),
    });
  }
  return documents;
}
