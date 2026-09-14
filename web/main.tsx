import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RichMarkdown } from './RichMarkdown.js';
import { AttachmentPicker } from './AttachmentPicker.js';
import type {
  ChatSnapshot,
  Conversation,
  Project,
  PublicSettings,
  KnowledgeDocument,
} from '../shared/types.js';
import { api } from './api.js';
import { newerSnapshot } from './snapshots.js';
import { Thinking } from './Thinking.js';
import { ContextPanel, Throughput, CopyMessage } from './ContextPanel.js';
import { KnowledgePanel, SaveKnowledge, DocumentTools } from './Knowledge.js';
import './style.css';
import './chat.css';
import './refinements.css';

function Logo() {
  return <span className="brand frame-wordmark" aria-label="Frame">Frame</span>;
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
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [theme, setTheme] = useState(() => localStorage.getItem('frame-theme') || 'light');
  const [chatSearch, setChatSearch] = useState('');
  const scrollArea = useRef<HTMLElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const compactRequest = useRef<{ chat: string; id: string } | undefined>(undefined);
  const [compacting, setCompacting] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('frame-theme', theme);
  }, [theme]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [projectId, setProjectId] = useState('');
  const currentProject = useRef(projectId);
  currentProject.current = projectId;
  const [chatId, setChatId] = useState('');
  const currentChat = useRef(chatId);
  currentChat.current = chatId;
  const [page, setPage] = useState<'chat' | 'settings' | 'project' | 'knowledge'>('chat');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saveIndex, setSaveIndex] = useState<number>();
  const refreshDocuments = async () => {
    if (projectId) {
      const docs = await api<KnowledgeDocument[]>(`/projects/${projectId}/documents`);
      if (currentProject.current !== projectId) return;
      setDocuments(docs);
      setAttached((ids) => ids.filter((id) => docs.some((doc) => doc.id === id)));
    }
  };
  useEffect(() => {
    let live = true;
    setAttached([]);
    setUploading(false);
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
  const [lastSubmitted, setLastSubmitted] = useState<{
    chatId: string;
    text: string;
    documentIds: string[];
  }>();
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [stoppingChat, setStoppingChat] = useState('');
  const applySnapshot = (id: string, value: ChatSnapshot) => {
    if (currentChat.current === id) setSnapshot((current) => newerSnapshot(current, value));
  };
  const [artifacts, setArtifacts] = useState<{ name: string }[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [pending, setPending] = useState<{
    id: string;
    chatId: string;
    text: string;
    documentIds: string[];
  }>();
  const project = projects.find((p) => p.id === projectId);
  useEffect(() => {
    pinned.current = true;
    setShowJump(false);
  }, [chatId]);
  useEffect(() => {
    if (pinned.current && scrollArea.current)
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [snapshot, page]);
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
    const selected = currentChat.current;
    if (selected) {
      const updated = await api<ChatSnapshot>(`/conversations/${selected}`);
      applySnapshot(selected, updated);
    }
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
    let live = true;
    let healthy = false;
    let running = true;
    let lastEvent = 0;
    let polling = false;
    let receivedRevision = 0;
    const receive = (value: ChatSnapshot) => {
      if (!live || currentChat.current !== chatId) return;
      if ((value.revision ?? 0) < receivedRevision) return;
      receivedRevision = value.revision ?? 0;
      running = value.running;
      applySnapshot(chatId, value);
    };
    const reconcile = async () => {
      if (polling || !live) return;
      polling = true;
      try { receive(await api<ChatSnapshot>(`/conversations/${chatId}`)); }
      catch (e) { if (live) setError((e as Error).message); }
      finally { polling = false; }
    };
    const stream = new EventSource(`/api/conversations/${chatId}/events`);
    stream.onmessage = (event) => {
      if (!live || currentChat.current !== chatId) return;
      try {
        receive(JSON.parse(event.data));
        healthy = true;
        lastEvent = Date.now();
        setConnected(true);
      } catch { healthy = false; setConnected(false); void reconcile(); }
    };
    stream.onerror = () => {
      if (!live) return;
      healthy = false;
      setConnected(false);
      void reconcile();
    };
    // A proxy can leave SSE open but buffered. Reconcile stalled active streams too.
    const poll = setInterval(() => {
      if (!healthy || (running && Date.now() - lastEvent > 3000)) void reconcile();
    }, 2000);
    void reconcile();
    return () => { live = false; clearInterval(poll); stream.close(); };
  }, [chatId]);
  useEffect(() => {
    if (!chatId || snapshot.running) return;
    let live = true;
    void api<{ name: string }[]>(`/conversations/${chatId}/artifacts`)
      .then((items) => { if (live && currentChat.current === chatId) setArtifacts(items); })
      .catch((e) => { if (live) setError(e.message); });
    void api<Conversation[]>('/conversations')
      .then(setChats)
      .catch(() => {});
    return () => { live = false; };
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
    if ((!draft.trim() && !pending) || sending || uploading || snapshot.running) return;
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
      setLastSubmitted(request);
      setPending(undefined);
      setDraft('');
      setAttached([]);
      const updated = await api<ChatSnapshot>(`/conversations/${id}`);
      applySnapshot(id, updated);
    } catch (e) {
      setError(
        `${(e as Error).message} Retry uses the same request ID to prevent duplicate execution.`,
      );
    } finally {
      setSending(false);
    }
  };
  const stop = async () => {
    if (!chatId || stoppingChat === chatId) return;
    const id = chatId;
    setStoppingChat(id);
    setError('');
    try {
      await api(`/conversations/${id}/stop`, 'POST', { runId: snapshot.runId });
      applySnapshot(id, await api<ChatSnapshot>(`/conversations/${id}`));
    } catch (e) { if (currentChat.current === id) setError((e as Error).message); }
    finally { setStoppingChat((current) => current === id ? '' : current); }
  };
  const compact = async () => {
    if (!chatId || compacting || snapshot.running) return;
    const id = chatId;
    if (compactRequest.current?.chat !== id)
      compactRequest.current = { chat: id, id: crypto.randomUUID() };
    setCompacting(true);
    setError('');
    try {
      await api(`/conversations/${id}/compact`, 'POST', { requestId: compactRequest.current.id });
      compactRequest.current = undefined;
      const updated = await api<ChatSnapshot>(`/conversations/${id}`);
      applySnapshot(id, updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCompacting(false);
    }
  };
  return (
    <div className={`workspace ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className="sidebar"
        id="workspace-navigation"
        onClick={(event) => {
          if (window.innerWidth <= 760 && (event.target as HTMLElement).closest('button'))
            setSidebarOpen(false);
        }}
      >
        <Logo />
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
        <div className="nav-heading">
          CONVERSATIONS
          <button title="New conversation" aria-label="New conversation" onClick={() => {
            setPending(undefined);
            void newChat().catch((e) => setError(e.message));
          }}>+</button>
        </div>
        <input
          className="chat-search"
          aria-label="Search conversations"
          placeholder="Search conversations"
          value={chatSearch}
          onChange={(e) => setChatSearch(e.target.value)}
        />
        <nav className="chat-list" aria-label="Conversations">
          {chats
            .filter(
              (c) =>
                c.projectId === projectId &&
                c.title.toLowerCase().includes(chatSearch.toLowerCase()),
            )
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
          <button onClick={() => setPage('settings')}>⚙ Settings</button>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? '◐ Dark appearance' : '◑ Light appearance'}
          </button>
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
          <div className="header-location">
            <button
              className="nav-toggle"
              aria-label="Toggle navigation"
              aria-expanded={sidebarOpen}
              aria-controls="workspace-navigation"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M9 4v16" />
              </svg>
            </button>
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
            {project && (
              <button
                className="project-settings-button"
                title="Project settings"
                onClick={() => setPage('project')}
              >
                Project settings
              </button>
            )}
            <span className="model-pill">{settings?.modelId || 'Model not configured'}</span>
            {page === 'chat' && (
              <ContextPanel
                metrics={snapshot.metrics}
                settings={settings}
                running={snapshot.running || compacting}
                canCompact={
                  !!chatId &&
                  snapshot.messages.some((m) => m.role === 'assistant') &&
                  !!settings?.modelId
                }
                onCompact={() => void compact()}
                onSettings={() => setPage('settings')}
              />
            )}
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
            <section
              className="conversation"
              aria-label="Conversation"
              ref={scrollArea}
              onScroll={() => {
                const el = scrollArea.current!;
                pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                setShowJump(!pinned.current);
              }}
            >
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
                      <RichMarkdown text={m.text} streaming={snapshot.running && i === snapshot.messages.length - 1} />
                      {m.role === 'assistant' && !!m.text && !snapshot.running && (
                        <div className="message-actions">
                          <CopyMessage text={m.text} />
                          <button className="save-knowledge" onClick={() => setSaveIndex(i)}>
                            ♡ Useful · Save to knowledge
                          </button>
                        </div>
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
                  <>
                    <p className="error" role="alert">
                      {snapshot.error}
                    </p>
                    {lastSubmitted?.chatId === chatId && (
                      <button
                        className="restore-draft"
                        onClick={() => {
                          setDraft(lastSubmitted.text);
                          setAttached(lastSubmitted.documentIds);
                          setPending(undefined);
                        }}
                      >
                        Restore last message to draft
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
            <div className="composer-area">
              {showJump && (
                <button
                  className="jump-latest"
                  onClick={() => {
                    pinned.current = true;
                    setShowJump(false);
                    scrollArea.current?.scrollTo({
                      top: scrollArea.current.scrollHeight,
                      behavior: 'instant',
                    });
                  }}
                >
                  ↓ Latest message
                </button>
              )}
              <div className="status-row">
                <div className="status" aria-live="polite">
                  {chatId && !connected
                    ? 'Live updates reconnecting · Checking task status…'
                    : snapshot.running
                      ? stoppingChat === chatId ? 'Stopping' : snapshot.status
                      : project?.toolsEnabled
                        ? 'Trusted tools enabled · Host-account permissions'
                        : 'Chat mode · Project knowledge available · Host tools disabled'}
                </div>
                <Throughput
                  metrics={snapshot.metrics}
                  running={snapshot.running && ['Responding', 'Thinking'].includes(snapshot.status)}
                />
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
                {!!attached.length && <div className="composer-attachments">
                  {attached.map((id) => <span key={id}>
                    <span>{documents.find((d) => d.id === id)?.name || 'Document'}</span>
                    <button type="button" aria-label={`Remove attachment ${documents.find((d) => d.id === id)?.name || 'document'}`}
                      disabled={snapshot.running || !!pending || uploading}
                      onClick={() => setAttached((ids) => ids.filter((value) => value !== id))}>×</button>
                  </span>)}
                </div>}
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
                  <AttachmentPicker key={projectId} projectId={projectId} documents={documents}
                    attached={attached} disabled={!projectId || snapshot.running || !!pending || sending}
                    onBusy={setUploading}
                    onToggle={(id) => setAttached((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id].slice(0, 5))}
                    onUploaded={(doc) => {
                      setDocuments((docs) => [doc, ...docs.filter((d) => d.id !== doc.id)]);
                      setAttached((ids) => [...new Set([...ids, doc.id])].slice(0, 5));
                    }} />
                  <span className="composer-hint">
                    {project?.name || 'Select a project'}
                    <span className="separator">·</span>Shift + Enter for a new line
                  </span>
                  {snapshot.running ? (
                    <button
                      type="button"
                      className="send"
                      aria-label="Stop generation"
                      disabled={stoppingChat === chatId || snapshot.status === 'Stopping'}
                      title="Stop generation"
                      onClick={() => void stop()}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor" /></svg>
                    </button>
                  ) : (
                    <button
                      className="send"
                      disabled={sending || uploading || !draft.trim() || !projectId || !settings?.modelId}
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
  const tabs = ['model', 'context', 'instructions', 'documents'] as const;
  const [tab, setTab] = useState<typeof tabs[number]>('model');
  const [key, setKey] = useState('');
  const [clear, setClear] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="settings-panel">
      <h1>Settings</h1>
      <p className="muted">Configure your model, context, instructions, and document tools.</p>
      <div className="settings-tabs" role="tablist" aria-label="Settings topics">
        {tabs.map((name, i) => <button key={name} type="button" id={`tab-${name}`} role="tab"
          aria-selected={tab === name} aria-controls={`settings-${name}`} tabIndex={tab === name ? 0 : -1}
          onClick={() => setTab(name)}
          onKeyDown={(e) => {
            const index = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
            if (index >= 0) { e.preventDefault(); setTab(tabs[index]!); document.getElementById(`tab-${tabs[index]}`)?.focus(); }
          }}>{name[0]!.toUpperCase() + name.slice(1)}</button>)}
      </div>
      <form hidden={tab === 'documents'}
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
        <fieldset id="settings-model" role="tabpanel" aria-labelledby="tab-model" hidden={tab !== 'model'} disabled={tab !== 'model' || busy} className="settings-topic">
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
        </fieldset>
        <fieldset id="settings-context" role="tabpanel" aria-labelledby="tab-context" hidden={tab !== 'context'} disabled={tab !== 'context' || busy} className="settings-topic">
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
        <fieldset className="context-settings">
          <legend>Context management</legend>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.autoCompaction}
              onChange={(e) => setForm({ ...form, autoCompaction: e.target.checked })}
            />
            Automatically compact older context
          </label>
          <label>
            Compact at used percentage
            <input
              type="number"
              min={50}
              max={90}
              required
              value={form.compactAtPercent}
              onChange={(e) => setForm({ ...form, compactAtPercent: Number(e.target.value) })}
            />
          </label>
          <small>
            Default: 75%. Frame may start earlier to reserve your output limit and template
            headroom. Recent exchanges stay in context; older history becomes a checkpoint.
          </small>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.pruneToolOutputs}
              onChange={(e) => setForm({ ...form, pruneToolOutputs: e.target.checked })}
            />
            Shorten older read-only tool outputs
          </label>
          <small>
            Keeps the latest two user turns, errors, and results from tools that make changes. Full
            results stay in conversation history.
          </small>
        </fieldset>
        </fieldset>
        <fieldset id="settings-instructions" role="tabpanel" aria-labelledby="tab-instructions" hidden={tab !== 'instructions'} disabled={tab !== 'instructions' || busy} className="settings-topic">
        <label>
          Organization instructions
          <textarea
            rows={4}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </label>
        </fieldset>
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
      <div id="settings-documents" role="tabpanel" aria-labelledby="tab-documents" hidden={tab !== 'documents'}>
        {tab === 'documents' && <DocumentTools />}
      </div>
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
