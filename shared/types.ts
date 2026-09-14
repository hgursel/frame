export interface ModelSettings {
  baseUrl: string;
  modelId: string;
  contextWindow: number;
  maxTokens: number;
  instructions: string;
}
export interface StoredSettings extends ModelSettings {
  apiKey: string;
}
export interface PublicSettings extends ModelSettings {
  hasApiKey: boolean;
}
export interface Project {
  id: string;
  name: string;
  instructions: string;
  toolsEnabled: boolean;
}
export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
}
export interface DisplayMessage {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  name?: string;
  failed?: boolean;
  thinking?: string;
  thinkingActive?: boolean;
  attachments?: { id: string; name: string }[];
  proposal?: { title: string; text: string; targetId?: string; revision?: string };
  knowledgeSourceId?: string;
}
export interface ChatSnapshot {
  messages: DisplayMessage[];
  running: boolean;
  status: string;
  error?: string;
}
export interface WorkerInput {
  cwd: string;
  agentDir: string;
  sessionFile: string;
  artifactDir: string;
  settings: StoredSettings;
  project: Project;
  prompt: string;
  documents?: { id: string; name: string; text: string }[];
  pythonPath?: string;
  knowledge?: { id: string; name: string; revision: string; text: string; description?: string }[];
}
export interface KnowledgeDocument {
  id: string;
  projectId: string;
  name: string;
  kind: 'upload' | 'wiki';
  extension: string;
  bytes: number;
  revision: string;
  truncated: boolean;
  updatedAt: string;
}
export interface DocumentRuntimeStatus {
  state: 'ready' | 'missing' | 'installing' | 'error';
  message: string;
}
export type WorkerOutput =
  | { type: 'snapshot'; messages: DisplayMessage[]; status: string }
  | { type: 'done'; error?: string }
  | { type: 'error'; error: string };
