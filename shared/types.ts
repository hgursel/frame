import type { SqlApproval, SqlResult } from './plugins.js';
export interface ModelSettings {
  baseUrl: string;
  modelId: string;
  contextWindow: number;
  maxTokens: number;
  instructions: string;
  autoCompaction: boolean;
  compactAtPercent: number;
  pruneToolOutputs: boolean;
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
  sqlResult?: SqlResult;
}
export interface ChatSnapshot {
  /** Monotonic server observation order; HTTP and SSE share this sequence. */
  revision?: number;
  runId?: string;
  sqlApproval?: SqlApproval;
  messages: DisplayMessage[];
  running: boolean;
  status: string;
  error?: string;
  metrics?: ChatMetrics;
}
export interface ChatMetrics {
  context: {
    tokens: number | null;
    window: number;
    estimated: boolean;
    threshold: number;
    auto: boolean;
    prunedTokens: number;
    compactions: number;
    lastCompaction?: { before: number; after: number; summary: string; at: string };
  };
  generation?: {
    tokens: number;
    seconds: number;
    tokensPerSecond: number | null;
    estimated: boolean;
  };
}
export interface WorkerInput {
  operation?: 'prompt' | 'compact';
  mssql?: { databases: string[]; map?: string };
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
  | { type: 'plugin_call'; id: string; action: string; args: unknown }
  | { type: 'snapshot'; messages: DisplayMessage[]; status: string; metrics: ChatMetrics }
  | { type: 'done'; error?: string }
  | { type: 'error'; error: string };
