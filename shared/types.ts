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
}
export type WorkerOutput =
  | { type: 'snapshot'; messages: DisplayMessage[]; status: string }
  | { type: 'done'; error?: string }
  | { type: 'error'; error: string };
