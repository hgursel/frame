import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { WorkerInput, WorkerOutput } from '../shared/types.js';
import { displayMessages } from './history.js';
import { localEndpoint } from './security.js';

const send = (value: WorkerOutput) => {
  if (process.connected) process.send?.(value);
};
let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
let stopping = false;
process.on('message', (message: WorkerInput | { type: 'abort' }) => {
  if ('type' in message) {
    stopping = true;
    void session?.abort();
    return;
  }
  void run(message).catch(() => {
    send({
      type: 'error',
      error:
        'Pi could not start or complete the request. Check the endpoint, model ID, and server diagnostics.',
    });
    process.exitCode = 1;
    process.disconnect();
  });
});
process.on('disconnect', () => {
  void session?.abort();
  setTimeout(() => process.exit(1), 500).unref();
});

async function run(input: WorkerInput) {
  const { settings, project } = input;
  const endpoint = localEndpoint(settings.baseUrl);
  const transport = globalThis.fetch;
  globalThis.fetch = (request, init) => {
    const url = new URL(request instanceof Request ? request.url : String(request));
    if (url.origin !== new URL(endpoint).origin || !url.pathname.startsWith('/v1/'))
      return Promise.reject(new Error('Only the configured local model endpoint is allowed'));
    return transport(request, { ...init, redirect: 'error' });
  };
  mkdirSync(input.agentDir, { recursive: true, mode: 0o700 });
  mkdirSync(input.artifactDir, { recursive: true, mode: 0o700 });
  const runtime = await ModelRuntime.create({
    authPath: path.join(input.agentDir, 'auth.json'),
    modelsPath: null,
    modelsStorePath: path.join(input.agentDir, 'models-store.json'),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  runtime.registerProvider('frame-local', {
    baseUrl: endpoint,
    api: 'openai-completions',
    models: [
      {
        id: settings.modelId,
        name: settings.modelId,
        reasoning: false,
        input: ['text'],
        contextWindow: settings.contextWindow,
        maxTokens: settings.maxTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
        },
      },
    ],
  });
  // Runtime override is literal: never treat a user-entered token as a shell command.
  await runtime.setRuntimeApiKey('frame-local', settings.apiKey || 'frame-local-no-key');
  const model = runtime.getModel('frame-local', settings.modelId);
  if (!model) throw new Error('Configured local model unavailable');
  const resources: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () =>
      `You are Frame, a local organizational assistant.\n${settings.instructions}\n\nProject instructions:\n${project.instructions}\n\n${project.toolsEnabled ? `Work in ${input.cwd}. Save user-facing deliverables to ${input.artifactDir}. Tools have host-account permissions; do not imply they are sandboxed.` : 'Tools are disabled. Do not claim to read, modify, or generate files.'}`,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  const created = await createAgentSession({
    cwd: input.cwd,
    agentDir: input.agentDir,
    modelRuntime: runtime,
    model,
    thinkingLevel: 'off',
    tools: project.toolsEnabled ? ['read', 'write', 'edit', 'bash', 'ls', 'find', 'grep'] : [],
    noTools: project.toolsEnabled ? undefined : 'all',
    resourceLoader: resources,
    settingsManager: SettingsManager.inMemory({
      enableInstallTelemetry: false,
      compaction: { enabled: true },
      retry: { enabled: false },
    }),
    sessionManager: SessionManager.open(
      input.sessionFile,
      path.dirname(input.sessionFile),
      input.cwd,
    ),
  });
  session = created.session;
  if (stopping) {
    session.dispose();
    send({ type: 'done' });
    process.disconnect();
    return;
  }
  let partial: unknown;
  let status = 'Thinking';
  let lastEmit = 0;
  const publish = (force = false) => {
    if (!force && Date.now() - lastEmit < 80) return;
    lastEmit = Date.now();
    const messages: unknown[] = [...session!.messages];
    if (partial) messages.push(partial);
    send({ type: 'snapshot', messages: displayMessages(messages), status });
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_start' && event.message.role === 'assistant')
      partial = event.message;
    if (event.type === 'message_update') {
      // SDK events include the cumulative message; RPC intentionally has a different wire format.
      partial = event.message;
    }
    if (event.type === 'message_end') partial = undefined;
    if (event.type === 'tool_execution_start') status = `Running ${event.toolName}`;
    if (event.type === 'tool_execution_end') status = 'Thinking';
    if (event.type === 'compaction_start') status = 'Compacting context';
    publish(event.type === 'message_end');
  });
  try {
    await session.prompt(input.prompt);
    partial = undefined;
    publish(true);
    const last = [...session.messages].reverse().find((m) => m.role === 'assistant');
    const error =
      last?.role === 'assistant' && last.stopReason === 'error'
        ? 'The local model returned an error. Check llama.cpp logs, context size, and chat-template/tool support.'
        : undefined;
    send({ type: 'done', error });
  } finally {
    unsubscribe();
    session.dispose();
    process.disconnect();
  }
}
