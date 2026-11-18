import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import type { BrowserState } from '../shared/browser.js';
import './browser.css';
export function BrowserControls({
  chatId,
  running = false,
  attach,
}: {
  chatId: string;
  running?: boolean;
  attach?: () => Promise<unknown>;
}) {
  const [state, setState] = useState<BrowserState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!chatId) return;
    let live = true,
      fetching = false;
    setState(undefined);
    setError('');
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const s = await api<BrowserState>(`/conversations/${chatId}/browser`);
        if (live) setState(s);
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 1500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [chatId]);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setState(await api(`/conversations/${chatId}/browser`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!state?.enabled && !state?.device) return error ? <p role="alert">{error}</p> : null;
  const review = state.review;
  return (
    <section className="browser-controls" aria-label="Browser connection">
      <div className="browser-toolbar">
        <strong>Browser</strong>
        <span>
          {state.device
            ? `${state.device.name} · ${state.connected ? 'Connected' : 'Offline'}`
            : 'No browser attached'}
        </span>
        {attach && (
          <button disabled={busy || running} onClick={() => void act(attach)}>
            Attach current tab
          </button>
        )}
        {state.device && (
          <button
            disabled={busy}
            onClick={() => void act(() => api(`/conversations/${chatId}/browser`, 'DELETE'))}
          >
            Disconnect tabs
          </button>
        )}
      </div>
      {!state.device && !attach && (
        <small>
          Attach a website tab from the Frame Chrome extension. Pair it under Settings → Frame for
          Browser.
        </small>
      )}
      {!!state.tabs.length && (
        <details>
          <summary>
            {state.tabs.length} attached {state.tabs.length === 1 ? 'tab' : 'tabs'}
          </summary>
          <ul>
            {state.tabs.map((t) => (
              <li key={t.id}>
                <strong>{t.title || t.url}</strong>
                <small>{t.url}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      {review && (
        <section
          className="browser-review"
          aria-label={review.handoff ? 'Browser handoff' : 'Review browser changes'}
        >
          <h3>{review.handoff ? 'Your browser needs you' : 'Review browser changes'}</h3>
          <p>{review.summary}</p>
          {!review.handoff && (
            <>
              <p>
                Approve only the listed actions. A batch can finish partially; completed changes may
                not be reversible.
              </p>
              <ol>
                {review.actions.map((p, i) => (
                  <li key={i}>
                    <strong>
                      {p.action.kind} · {p.label}
                    </strong>
                    <small>{p.url}</small>
                    {p.action.value !== undefined && <pre>{p.action.value}</pre>}
                    {p.action.key && <span>Key: {p.action.key}</span>}
                    <small>{p.reason}</small>
                  </li>
                ))}
              </ol>
            </>
          )}
          <div className="browser-toolbar">
            <button
              className="primary"
              disabled={busy || !state.connected}
              onClick={() =>
                void act(() =>
                  api(`/conversations/${chatId}/browser/reviews/${review.id}`, 'POST', {
                    runId: review.runId,
                    approve: true,
                  }),
                )
              }
            >
              {review.handoff ? 'Continue' : 'Approve listed actions'}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api(`/conversations/${chatId}/browser/reviews/${review.id}`, 'POST', {
                    runId: review.runId,
                    approve: false,
                  }),
                )
              }
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function BrowserSettings({ admin = false }: { admin?: boolean }) {
  const [config, setConfig] = useState<{ enabled: boolean; https: boolean; origin: string }>();
  const [devices, setDevices] = useState<{ id: string; name: string; seen: number }[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [c, d] = await Promise.all([api<any>('/browser/config'), api<any>('/browser/devices')]);
    setConfig(c);
    setDevices(d);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="browser-settings">
      <h2>Frame for Browser</h2>
      <p>
        Use Frame in Chrome on Windows. Connect your own browser and attach only the tabs you want
        Frame to use.
      </p>
      {admin && config && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={busy || !config.https}
            onChange={(e) => {
              const enabled = e.target.checked;
              void act(async () => {
                await api('/admin/browser', 'PUT', { enabled });
              });
            }}
          />
          Enable Frame for Browser for all users
        </label>
      )}
      {config && !config.https && <p>Trusted HTTPS is required.</p>}
      {config?.enabled ? (
        <>
          <ol>
            <li>
              <a href="/api/browser/extension" download>
                Download the Chrome extension
              </a>
              , unzip it, then open Chrome → Extensions → Manage Extensions → Developer mode → Load
              unpacked.
            </li>
            <li>
              Open the Frame extension from the Chrome toolbar. Enter <code>{config.origin}</code>{' '}
              and a pairing code below.
            </li>
            <li>
              Enable Browser under your project’s Plugins. Select a conversation in the extension,
              then attach the website tab.
            </li>
          </ol>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const r = await api<{ code: string }>('/browser/pair-code', 'POST', {});
                setCode(r.code);
              })
            }
          >
            Create pairing code
          </button>
          {code && (
            <label>
              One-time pairing code · expires in 10 minutes
              <input readOnly value={code} onFocus={(e) => e.target.select()} />
              <small>Keep this code private. It connects a browser to your account.</small>
            </label>
          )}
        </>
      ) : (
        <p>An administrator must enable browser capability first.</p>
      )}
      {!!devices.length && (
        <>
          <h3>Your paired browsers</h3>
          <ul>
            {devices.map((d) => (
              <li key={d.id}>
                {d.name}{' '}
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api(`/browser/devices/${d.id}`, 'DELETE');
                    })
                  }
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">
        Uses your existing website sessions. Page captures stay in the conversation and are excluded
        from automatic learning. Chrome must be running and reachable. Device pairing expires after
        30 days.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function BrowserCapture({ chatId, imageId }: { chatId: string; imageId: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void api<{ data: string; mimeType: string }>(
      `/conversations/${chatId}/browser/images/${imageId}`,
    )
      .then((r) => {
        if (live) setSrc(`data:${r.mimeType};base64,${r.data}`);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [chatId, imageId]);
  return src ? (
    <img
      className="browser-capture"
      src={src}
      alt="Browser screenshot captured during this task"
      loading="lazy"
    />
  ) : (
    <small>Screenshot unavailable</small>
  );
}
