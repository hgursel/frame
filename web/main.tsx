import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import type {
  ChatSnapshot,
  Conversation,
  Project,
  PublicSettings,
  KnowledgeDocument,
} from '../shared/types.js';
import { api } from './api.js';
import { Thinking } from './Thinking.js';
import { KnowledgePanel, SaveKnowledge, DocumentTools } from './Knowledge.js';
import './style.css';

function Logo() {
  return (
    <span className="brand">
      <span className="mark" aria-hidden="true">
        F
      </span>
      Frame<span className="edition">LOCAL</span>
    </span>
  );
}
function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    const out = () => setAuthenticated(false);
    window.addEventListener('frame-signed-out', out);
    void api<{ setupRequired: boolean }>('/auth/status')
      .then((status) => {
        setSetup(status.setupRequired);
        return api('/projects')
          .then(() => setAuthenticated(true))
          .catch(() => {});
      })
      .finally(() => setChecking(false));
    return () => window.removeEventListener('frame-signed-out', out);
  }, []);
  if (checking)
    return (
      <main className="auth">
        <Logo />
        <p>Opening your workspace…</p>
      </main>
    );
  return authenticated ? (
    <Workspace />
  ) : (
    <Login
      setup={setup}
      onDone={() => {
        setSetup(false);
        setAuthenticated(true);
      }}
    />
  );
}
function Login({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth">
      <Logo />
      <div className="auth-card">
        <span className="eyebrow">YOUR INFRASTRUCTURE. YOUR INTELLIGENCE.</span>
        <h1>{setup ? 'Make room for better work.' : 'Welcome back.'}</h1>
        <p>
          {setup
            ? 'Create the administrator account for this Frame installation.'
            : 'Sign in to your organization’s local AI workspace.'}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setBusy(true);
            try {
              if (setup) await api('/auth/setup', 'POST', { password, token });
              await api('/auth/login', 'POST', { password });
              onDone();
            } catch (e) {
              setError(String((e as Error).message));
            } finally {
              setBusy(false);
            }
          }}
        >
          {setup && (
            <label>
              Setup token
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <small>Shown once per startup in the server console, until setup is complete.</small>
            </label>
          )}
          <label>
            Administrator password
            <input
              required
              minLength={12}
              maxLength={256}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={setup ? 'new-password' : 'current-password'}
            />
            <small>At least 12 characters.</small>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : setup ? 'Create workspace' : 'Sign in'} <span>→</span>
          </button>
        </form>
      </div>
      <p className="footnote">Self-hosted · Local models · No cloud fallback</p>
    </main>
  );
}

function Workspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [projectId, setProjectId] = useState('');
  const [chatId, setChatId] = useState('');
  const currentChat = useRef(chatId);
  currentChat.current = chatId;
  const [page, setPage] = useState<'chat' | 'settings' | 'project' | 'knowledge'>('chat');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [saveIndex, setSaveIndex] = useState<number>();
  const refreshDocuments = async () => {
    if (projectId) setDocuments(await api<KnowledgeDocument[]>(`/projects/${projectId}/documents`));
  };
  useEffect(() => {
    let live = true;
    setAttached([]);
    setDocuments([]);
    setSaveIndex(undefined);
    if (projectId)
      void api<KnowledgeDocument[]>(`/projects/${projectId}/documents`)
        .then((d) => {
          if (live) setDocuments(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [projectId]);
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({
    messages: [],
    running: false,
    status: 'Ready',
  });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [artifacts, setArtifacts] = useState<{ name: string }[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [pending, setPending] = useState<{
    id: string;
    chatId: string;
    text: string;
    documentIds: string[];
  }>();
  const project = projects.find((p) => p.id === projectId);
  const refresh = async () => {
    const [p, c, s] = await Promise.all([
      api<Project[]>('/projects'),
      api<Conversation[]>('/conversations'),
      api<PublicSettings>('/settings'),
    ]);
    setProjects(p);
    setChats(c);
    setSettings(s);
    setProjectId((prev) => prev || p[0]?.id || '');
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setSnapshot({ messages: [], running: false, status: 'Ready' });
    setArtifacts([]);
    setConnected(false);
    setError('');
    if (!chatId) return;
    const stream = new EventSource(`/api/conversations/${chatId}/events`);
    stream.onopen = () => setConnected(true);
    stream.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data));
      setConnected(true);
    };
    stream.onerror = () => {
      setConnected(false);
      void api(`/conversations/${chatId}`).catch(() => {});
    };
    return () => stream.close();
  }, [chatId]);
  useEffect(() => {
    if (!chatId || snapshot.running) return;
    void api<{ name: string }[]>(`/conversations/${chatId}/artifacts`)
      .then(setArtifacts)
      .catch((e) => setError(e.message));
    void api<Conversation[]>('/conversations')
      .then(setChats)
      .catch(() => {});
  }, [chatId, snapshot.running]);
  const newChat = async () => {
    if (!projectId) {
      setPage('project');
      return;
    }
    const chat = await api<Conversation>('/conversations', 'POST', { projectId });
    setChats((prev) => [chat, ...prev]);
    setChatId(chat.id);
    currentChat.current = chat.id;
    setPage('chat');
    return chat.id;
  };
  const submit = async () => {
    if ((!draft.trim() && !pending) || sending) return;
    setSending(true);
    setError('');
    try {
      const id = pending?.chatId || chatId || (await newChat());
      if (!id) return;
      const request = pending || {
        id: crypto.randomUUID(),
        chatId: id,
        text: draft.trim(),
        documentIds: attached,
      };
      setPending(request);
      await api(`/conversations/${id}/messages`, 'POST', {
        requestId: request.id,
        text: request.text,
        documentIds: request.documentIds,
      });
      setPending(undefined);
      setDraft('');
      setAttached([]);
      const updated = await api<ChatSnapshot>(`/conversations/${id}`);
      if (currentChat.current === id) setSnapshot(updated);
    } catch (e) {
      setError(
        `${(e as Error).message} Retry uses the same request ID to prevent duplicate execution.`,
      );
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Logo />
        <button
          className="new-chat"
          onClick={() => {
            setPending(undefined);
            void newChat().catch((e) => setError(e.message));
          }}
        >
          + New conversation
        </button>
        <div className="nav-heading">
          PROJECTS
          <button
            title="Create project"
            aria-label="Create project"
            onClick={() => {
              setProjectId('');
              setPage('project');
            }}
          >
            +
          </button>
        </div>
        <nav aria-label="Projects">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`project-link ${projectId === p.id ? 'selected' : ''}`}
              onClick={() => {
                setProjectId(p.id);
                setChatId('');
                setPage('chat');
                setPending(undefined);
              }}
            >
              <span className="folder">▱</span>
              {p.name}
            </button>
          ))}
        </nav>
        <div className="nav-heading">CONVERSATIONS</div>
        <nav className="chat-list" aria-label="Conversations">
          {chats
            .filter((c) => c.projectId === projectId)
            .map((c) => (
              <button
                key={c.id}
                className={chatId === c.id ? 'selected' : ''}
                onClick={() => {
                  setChatId(c.id);
                  setPage('chat');
                  setPending(undefined);
                }}
              >
                {c.title}
              </button>
            ))}
          {!chats.some((c) => c.projectId === projectId) && (
            <p className="muted small">Your conversations will appear here.</p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span className="dot" />
            Local endpoint only
          </div>
          <button onClick={() => setPage('settings')}>⚙ Settings</button>
          <button
            onClick={() =>
              void api('/auth/logout', 'POST', {}).then(() =>
                window.dispatchEvent(new Event('frame-signed-out')),
              )
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header>
          <div>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>
            {page === 'settings' ? 'Settings' : project?.name || 'Getting started'}
          </div>
          <div className="header-actions">
            {project && (
              <>
                <button
                  className={page === 'chat' ? 'active-tab' : ''}
                  onClick={() => setPage('chat')}
                >
                  Chat
                </button>
                <button
                  className={page === 'knowledge' ? 'active-tab' : ''}
                  onClick={() => {
                    setPage('knowledge');
                    void refreshDocuments().catch((e) => setError(e.message));
                  }}
                >
                  Knowledge
                </button>
              </>
            )}
            {project && <button onClick={() => setPage('project')}>Project settings</button>}
            <span className="model-pill">{settings?.modelId || 'Model not configured'}</span>
          </div>
        </header>
        {page === 'settings' && settings ? (
          <Settings initial={settings} onSaved={refresh} />
        ) : page === 'knowledge' && project ? (
          <KnowledgePanel
            key={projectId}
            projectId={projectId}
            documents={documents}
            refresh={refreshDocuments}
            onAttach={(id) => {
              setAttached((prev) => [...new Set([...prev, id])].slice(0, 5));
              setPage('chat');
            }}
          />
        ) : page === 'project' ? (
          <ProjectForm
            key={project?.id || 'new'}
            project={project}
            onSaved={async (p) => {
              await refresh();
              setProjectId(p.id);
              setChatId('');
              setPage('chat');
            }}
          />
        ) : (
          <>
            <section className="conversation" aria-label="Conversation">
              <div className="conversation-inner">
                {!snapshot.messages.length && (
                  <div className="welcome">
                    <span className="eyebrow">A CLEAR SPACE TO THINK</span>
                    <h1>
                      Your knowledge.
                      <br />
                      <em>Your next move.</em>
                    </h1>
                    <p>
                      Bring questions, documents, and ideas together.
                      <br />
                      Work with intelligence running on your infrastructure.
                    </p>
                    <div className="suggestions">
                      {[
                        'Explain a complex idea',
                        'Draft a project brief',
                        'Plan the next steps',
                      ].map((text, i) => (
                        <button key={text} onClick={() => setDraft(text)}>
                          <span className="suggestion-number">0{i + 1}</span>
                          {text}
                          <span>↗</span>
                        </button>
                      ))}
                    </div>
                    {!settings?.modelId && (
                      <button className="setup-link" onClick={() => setPage('settings')}>
                        Connect your llama.cpp endpoint →
                      </button>
                    )}
                    {!projectId && (
                      <button className="setup-link" onClick={() => setPage('project')}>
                        Create your first project →
                      </button>
                    )}
                  </div>
                )}
                {snapshot.messages.map((m, i) =>
                  m.role === 'tool' ? (
                    <details className="tool" key={i}>
                      <summary>
                        {m.failed ? '×' : '✓'} {m.name || 'Tool result'}
                      </summary>
                      <pre>{m.text}</pre>
                      {!snapshot.running && (
                        <button className="save-knowledge" onClick={() => setSaveIndex(i)}>
                          {m.proposal ? 'Review knowledge draft' : 'Save useful result'}
                        </button>
                      )}
                    </details>
                  ) : (
                    <article key={i} className={`message ${m.role}`}>
                      <div className="message-author">{m.role === 'user' ? 'YOU' : 'FRAME'}</div>
                      <Thinking text={m.thinking} active={m.thinkingActive && snapshot.running} />
                      {!!m.attachments?.length && (
                        <div className="attachment-chips">
                          {m.attachments.map((a) => (
                            <span key={a.id}>▤ {a.name}</span>
                          ))}
                        </div>
                      )}
                      <Markdown
                        components={{
                          img: () => <span>[Image omitted; use artifact downloads]</span>,
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noreferrer noopener">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {m.text}
                      </Markdown>
                      {m.role === 'assistant' && !!m.text && !snapshot.running && (
                        <button className="save-knowledge" onClick={() => setSaveIndex(i)}>
                          ♡ Useful · Save to knowledge
                        </button>
                      )}
                    </article>
                  ),
                )}
                {!!artifacts.length && (
                  <div className="artifacts">
                    {artifacts.map((a) => (
                      <a
                        key={a.name}
                        href={`/api/conversations/${chatId}/artifacts/${encodeURIComponent(a.name)}`}
                      >
                        ↓ {a.name}
                      </a>
                    ))}
                  </div>
                )}
                {snapshot.error && (
                  <p className="error" role="alert">
                    {snapshot.error}
                  </p>
                )}
              </div>
            </section>
            <div className="composer-area">
              <div className="status" aria-live="polite">
                {snapshot.running
                  ? snapshot.status
                  : chatId && !connected
                    ? 'Reconnecting… Your task continues on the server.'
                    : project?.toolsEnabled
                      ? 'Trusted tools enabled · Host-account permissions'
                      : 'Chat mode · Project knowledge available · Host tools disabled'}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {!!documents.length && (
                  <details className="attachment-picker">
                    <summary>
                      ▤ Attach documents {attached.length ? `(${attached.length}/5)` : ''}
                    </summary>
                    <div>
                      {documents.map((d) => (
                        <label key={d.id}>
                          <input
                            type="checkbox"
                            checked={attached.includes(d.id)}
                            disabled={
                              (!attached.includes(d.id) && attached.length >= 5) ||
                              !!pending ||
                              snapshot.running
                            }
                            onChange={(e) =>
                              setAttached((prev) =>
                                e.target.checked
                                  ? [...prev, d.id]
                                  : prev.filter((id) => id !== d.id),
                              )
                            }
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </details>
                )}
                <textarea
                  aria-label="Message Frame"
                  placeholder="Ask Frame anything about your work…"
                  value={draft}
                  maxLength={32000}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (pending) setPending(undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (!snapshot.running) void submit();
                    }
                  }}
                />
                <div className="composer-footer">
                  <span>
                    {project?.name || 'Select a project'}
                    <span className="separator">·</span>Shift + Enter for a new line
                  </span>
                  {snapshot.running ? (
                    <button
                      type="button"
                      className="send"
                      aria-label="Stop generation"
                      onClick={() =>
                        void api(`/conversations/${chatId}/stop`, 'POST', {}).catch((e) =>
                          setError(e.message),
                        )
                      }
                    >
                      ■
                    </button>
                  ) : (
                    <button
                      className="send"
                      disabled={sending || !draft.trim() || !projectId || !settings?.modelId}
                      aria-label="Send message"
                    >
                      {sending ? '…' : '↑'}
                    </button>
                  )}
                </div>
              </form>
              <p className="footnote">
                Frame can make mistakes. Review important answers and tool actions.
              </p>
            </div>
          </>
        )}
      </main>
      {saveIndex !== undefined && chatId && (
        <SaveKnowledge
          key={`${chatId}-${saveIndex}`}
          projectId={projectId}
          chatId={chatId}
          index={saveIndex}
          documents={documents}
          onClose={() => setSaveIndex(undefined)}
          onSaved={refreshDocuments}
        />
      )}
    </div>
  );
}

function Settings({ initial, onSaved }: { initial: PublicSettings; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const [key, setKey] = useState('');
  const [clear, setClear] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="settings-panel">
      <span className="eyebrow">LOCAL BY DESIGN</span>
      <h1>Model connection</h1>
      <p className="muted">
        Connect Frame to a llama.cpp server on this machine or your private network.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setNotice('');
          try {
            const { hasApiKey: _, ...values } = form;
            await api('/settings', 'PUT', {
              ...values,
              ...(key || clear ? { apiKey: clear ? '' : key } : {}),
            });
            await onSaved();
            setKey('');
            setClear(false);
            setNotice('Settings saved. New tasks use this configuration.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Endpoint URL
          <input
            required
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />
          <small>
            Example: http://127.0.0.1:8080/v1 · localhost refers to the Frame server, not your
            browser.
          </small>
        </label>
        <label>
          Model ID
          <input
            required
            placeholder="The model alias served by llama.cpp"
            value={form.modelId}
            onChange={(e) => setForm({ ...form, modelId: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            Context window
            <input
              required
              type="number"
              min={2048}
              max={2000000}
              value={form.contextWindow}
              onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) })}
            />
          </label>
          <label>
            Maximum output tokens
            <input
              required
              type="number"
              min={128}
              max={131072}
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) })}
            />
          </label>
        </div>
        <small>
          Match the context allocated per llama.cpp slot. Model size is not context size.
        </small>
        <label>
          Endpoint token (optional)
          <input
            type="password"
            autoComplete="new-password"
            placeholder={
              initial.hasApiKey
                ? 'Saved token — leave blank to keep'
                : 'No authentication token required by default'
            }
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
          Remove saved endpoint token
        </label>
        <label>
          Organization instructions
          <textarea
            rows={4}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </label>
        <div className="button-row">
          <button className="primary" disabled={busy}>
            Save settings
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setError('');
              setNotice('');
              setBusy(true);
              try {
                const result = await api<{ models: string[]; selectedModelFound: boolean }>(
                  '/settings/test',
                  'POST',
                  {},
                );
                setNotice(
                  `Saved endpoint connected. Models: ${result.models.join(', ')}.${result.selectedModelFound ? '' : ' The configured model ID was not found.'} Test chat and tools separately.`,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Test saved connection
          </button>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <DocumentTools />
      <div className="scope-note">
        <strong>V1 · Single administrator</strong>
        <p>
          Multi-user access is planned for V2. MCP management and general skill installation are
          upcoming. Local models must already be running in llama.cpp.
        </p>
      </div>
    </section>
  );
}
function ProjectForm({
  project,
  onSaved,
}: {
  project?: Project;
  onSaved: (p: Project) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name || '');
  const [instructions, setInstructions] = useState(project?.instructions || '');
  const [tools, setTools] = useState(project?.toolsEnabled || false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="settings-panel">
      <span className="eyebrow">GIVE YOUR WORK A HOME</span>
      <h1>{project ? 'Project settings' : 'New project'}</h1>
      <p className="muted">
        Each project has its own workspace folder, instructions, and conversations.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setBusy(true);
          try {
            const p = await api<Project>(
              project ? `/projects/${project.id}` : '/projects',
              project ? 'PUT' : 'POST',
              { name, instructions, toolsEnabled: tools },
            );
            await onSaved(p);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Project name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Project instructions
          <textarea
            rows={8}
            maxLength={16000}
            placeholder="What should Frame know about this project?"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <div className="warning">
          <label className="checkbox">
            <input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} />
            Enable trusted agent tools
          </label>
          <p>
            Allows reading, writing, editing, and shell/Python execution without per-command
            approval. The agent can access anything the Frame Linux account can access, including
            outside this project. This is not a sandbox. Enable only for trusted, supervised work.
          </p>
        </div>
        <button className="primary" disabled={busy}>
          {project ? 'Save project' : 'Create project'}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
