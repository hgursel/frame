import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { api, setApiTransport } from '../web/api.js';
import { BrowserControls } from '../web/Browser.js';
import { ConversationMessages } from '../web/ConversationMessages.js';
import { QuestionCard } from '../web/QuestionCard.js';
import { Throughput } from '../web/ContextPanel.js';
import type { ChatSnapshot, Conversation, Project, PublicSettings } from '../shared/types.js';
import '../web/style.css';
import '../web/chat.css';
import '../web/activity.css';
import './sidepanel.css';
declare const chrome: any;
async function bridge(message: unknown) {
  const r = await chrome.runtime.sendMessage(message);
  if (r.error) throw new Error(r.error);
  return r.result;
}
setApiTransport((url, method, body) => bridge({ type: 'api', path: `/api${url}`, method, body }));
function Panel() {
  const [status, setStatus] = useState<{ paired: boolean; origin?: string }>();
  const [origin, setOrigin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [project, setProject] = useState('');
  const [chat, setChat] = useState('');
  const [draft, setDraft] = useState('');
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({
    messages: [],
    running: false,
    status: 'Ready',
  });
  const [settings, setSettings] = useState<PublicSettings>();
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState<{ requestId: string; text: string }>();
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void bridge({ type: 'status' })
      .then(setStatus)
      .catch((e) => setError(e.message));
    const t = setInterval(() => void bridge({ type: 'tick' }).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!status?.paired) return;
    void Promise.all([
      api<Project[]>('/projects'),
      api<Conversation[]>('/conversations'),
      api<PublicSettings>('/settings'),
    ])
      .then(([p, c, s]) => {
        setProjects(p);
        setChats(c);
        setSettings(s);
        setProject(p[0]?.id || '');
      })
      .catch((e) => setError(e.message));
  }, [status?.paired]);
  useEffect(() => {
    setChat('');
    setPending(undefined);
    if (project)
      void api<{ browser: boolean }>(`/projects/${project}/plugins`)
        .then((r) => setEnabled(r.browser))
        .catch((e) => setError(e.message));
  }, [project]);
  useEffect(() => {
    setSnapshot({ messages: [], running: false, status: 'Ready' });
    setPending(undefined);
    setDraft('');
    setError('');
    pinned.current = true;
    if (!chat) return;
    let live = true,
      fetching = false;
    const read = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const s = await api<ChatSnapshot>(`/conversations/${chat}`);
        if (live && chatRef.current === chat) setSnapshot(s);
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    };
    void read();
    const t = setInterval(() => void read(), 1200);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [chat]);
  useEffect(() => {
    if (content.current && pinned.current) content.current.scrollTop = content.current.scrollHeight;
  }, [snapshot]);
  const newChat = async () => {
    const c = await api<Conversation>('/conversations', 'POST', { projectId: project });
    setChats((prev) => [c, ...prev]);
    setChat(c.id);
    return c.id;
  };
  if (!status)
    return (
      <main className="frame-panel">
        <h1>Frame</h1>
        <p>Connecting…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  if (!status.paired)
    return (
      <main className="frame-panel pair">
        <h1>Frame</h1>
        <p>Your knowledge. Your infrastructure.</p>
        <h2>Connect your browser</h2>
        <p>In Frame, open Settings → Frame for Browser and create a pairing code.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void attempt(async () => {
              await bridge({
                type: 'pair',
                origin: origin.trim(),
                code,
                name: 'Chrome on Windows',
              });
              setCode('');
              setStatus(await bridge({ type: 'status' }));
            });
          }}
        >
          <label>
            Frame HTTPS address
            <input
              required
              type="url"
              placeholder="https://frame.company.example"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </label>
          <label>
            One-time pairing code
            <input
              required
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            Connect Frame
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  return (
    <main className="frame-panel">
      <header>
        <h1>Frame</h1>
        <button
          disabled={busy}
          onClick={() =>
            void attempt(async () => {
              await bridge({ type: 'disconnect' });
              setStatus({ paired: false });
              setProjects([]);
              setChats([]);
              setChat('');
            })
          }
        >
          Sign out extension
        </button>
      </header>
      <div className="panel-selectors">
        <label htmlFor="panel-project">Project</label>
        <select
          id="panel-project"
          value={project}
          disabled={busy || snapshot.running}
          onChange={(e) => setProject(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label htmlFor="panel-conversation">Conversation</label>
        <select
          id="panel-conversation"
          value={chat}
          disabled={busy}
          onChange={(e) => setChat(e.target.value)}
        >
          <option value="">Choose a conversation</option>
          {chats
            .filter((c) => c.projectId === project)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
        </select>
        <button
          disabled={busy || !enabled}
          onClick={() =>
            void attempt(async () => {
              await newChat();
            })
          }
        >
          New chat
        </button>
      </div>
      {!enabled && (
        <p>Enable Frame for Browser in this project’s Plugins settings on the Frame website.</p>
      )}
      {chat && (
        <a
          href={`${status.origin}/?conversation=${encodeURIComponent(chat)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open this conversation in Frame ↗
        </a>
      )}
      <div
        className="panel-messages"
        ref={content}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        <ConversationMessages
          snapshot={snapshot}
          chatId={chat}
          connected={true}
          stopping={snapshot.status === 'Stopping'}
          canSave={false}
          onSave={() => {}}
        />
        {snapshot.question && (
          <QuestionCard key={snapshot.question.id} chatId={chat} request={snapshot.question} />
        )}
        {snapshot.error && <p className="error">{snapshot.error}</p>}
      </div>
      {chat && (
        <BrowserControls
          key={chat}
          chatId={chat}
          running={snapshot.running}
          attach={() => bridge({ type: 'attach', conversationId: chat })}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form
        className="panel-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void attempt(async () => {
            const id = chat || (await newChat());
            const p = pending || { requestId: crypto.randomUUID(), text: draft.trim() };
            setPending(p);
            await api(`/conversations/${id}/messages`, 'POST', p);
            setPending(undefined);
            setDraft('');
            setSnapshot(await api(`/conversations/${id}`));
            pinned.current = true;
          });
        }}
      >
        <textarea
          aria-label="Message Frame"
          placeholder="Ask Frame to work with your attached tabs…"
          value={draft}
          disabled={!enabled}
          maxLength={32000}
          onChange={(e) => {
            setDraft(e.target.value);
            setPending(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy && !snapshot.running && (draft.trim() || pending))
                e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {snapshot.running ? (
          <button
            type="button"
            aria-label="Stop task"
            onClick={() =>
              void attempt(async () => {
                await api(`/conversations/${chat}/stop`, 'POST', {});
              })
            }
          >
            ■
          </button>
        ) : (
          <button
            aria-label="Send message"
            disabled={busy || !enabled || (!draft.trim() && !pending)}
          >
            ↑
          </button>
        )}
      </form>
      <Throughput metrics={snapshot.metrics} running={snapshot.running} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Panel />);
