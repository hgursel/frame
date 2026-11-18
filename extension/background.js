import { pageCommand } from './page.js';
let busy = false;
let initialized = false;
let sessions = [];
let generation = 0;
// Bindings are deliberately memory-only. Worker/browser restart requires explicit reattachment.
const attached = new Map();
const prepared = new Map();
const groups = new Map();
const popups = new Map();
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.alarms.create('frame-browser-poll', { periodInMinutes: 0.5 });
const config = async () => (await chrome.storage.local.get('connection')).connection;
const safeUrl = (value) => {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Only HTTP(S) websites are supported.');
  return u.href;
};
async function request(path, method = 'GET', body, connection) {
  const c = connection || (await config());
  if (!c) throw new Error('Pair this extension with Frame first.');
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error('Invalid API path.');
  const r = await fetch(c.origin + path, {
    method,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(65000),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || `Frame returned HTTP ${r.status}.`);
  return data;
}
async function tabInfo(id) {
  const t = await chrome.tabs.get(Number(id));
  return { id: String(t.id), url: safeUrl(t.url), title: (t.title || '').slice(0, 500) };
}
async function assertTab(conversationId, id) {
  if (attached.get(String(id)) !== conversationId)
    throw new Error('Tab is not attached locally. Attach it again in the side panel.');
  const t = await tabInfo(id);
  const c = await config();
  if (new URL(t.url).origin === c.origin) throw new Error('Frame cannot automate its own website.');
  return t;
}
async function page(tab, kind, payload, frameId) {
  const results = await chrome.scripting.executeScript({
    target:
      frameId === undefined
        ? { tabId: Number(tab), allFrames: true }
        : { tabId: Number(tab), frameIds: [frameId] },
    world: 'ISOLATED',
    func: pageCommand,
    args: [kind, payload],
  });
  if (results.some((r) => r.error))
    throw new Error(results.find((r) => r.error).error.message || 'Page action failed.');
  return results;
}
function splitRef(ref) {
  const m = /^(\d+)\/(.+)$/.exec(ref || '');
  if (!m) throw new Error('Use a current snapshot ref.');
  return { frameId: Number(m[1]), ref: m[2] };
}
async function prepare(conversationId, actions) {
  const results = [];
  for (const a of actions) {
    if (a.kind === 'navigate') {
      safeUrl(a.url);
      const c = await config();
      if (new URL(a.url).origin === c.origin) throw new Error('Cannot automate Frame itself.');
      const t = a.tab ? await assertTab(conversationId, a.tab) : undefined;
      const p = {
        action: a,
        url: t?.url || a.url,
        title: t?.title || 'New task tab',
        label: `Open ${a.url}`,
        fingerprint: JSON.stringify({ url: t?.url, generation }),
        review: false,
        reason: 'Requested website navigation.',
      };
      results.push(p);
      continue;
    }
    await assertTab(conversationId, a.tab);
    const { frameId, ref } = a.ref ? splitRef(a.ref) : { frameId: 0, ref: undefined };
    const r = (await page(a.tab, 'prepare', { ...a, ref }, frameId))[0]?.result;
    if (!r) throw new Error('Page did not return an action target.');
    results.push({ ...r, action: a });
  }
  prepared.set(
    conversationId,
    results.map((p) => JSON.stringify(p)),
  );
  return results;
}
async function execute(conversationId, p, check) {
  const plans = prepared.get(conversationId) || [];
  const key = JSON.stringify(p),
    index = plans.indexOf(key);
  if (index < 0) throw new Error('This action was not prepared by this browser.');
  plans.splice(index, 1); // Consume before any action, including failures.
  const a = p.action;
  if (a.kind === 'navigate') {
    const c = await config();
    safeUrl(a.url);
    if (new URL(a.url).origin === c.origin) throw new Error('Cannot automate Frame itself.');
    const old = a.tab ? await assertTab(conversationId, a.tab) : undefined;
    if (p.fingerprint !== JSON.stringify({ url: old?.url, generation }))
      throw new Error('Navigation target changed.');
    await check();
    let t;
    if (a.tab) t = await chrome.tabs.update(Number(a.tab), { url: a.url });
    else {
      if (attached.size >= 30) throw new Error('Detach a tab before opening more task tabs.');
      t = await chrome.tabs.create({ url: a.url, active: false });
      attached.set(String(t.id), conversationId);
      try {
        let group = groups.get(conversationId);
        if (group !== undefined) {
          try {
            await chrome.tabGroups.get(group);
          } catch {
            group = undefined;
          }
        }
        group = await chrome.tabs.group({
          tabIds: [t.id],
          ...(group === undefined ? {} : { groupId: group }),
        });
        groups.set(conversationId, group);
        await chrome.tabGroups.update(group, { title: 'Frame task', color: 'yellow' });
      } catch {
        /* Grouping can be unavailable across windows. The tab is still scoped. */
      }
    }
    return {
      ok: true,
      tab: { id: String(t.id), url: a.url, title: (t.title || '').slice(0, 500) },
      notice: 'Navigation started. Read a fresh snapshot after the page loads.',
    };
  }
  const info = await assertTab(conversationId, a.tab);
  const { frameId, ref } = a.ref ? splitRef(a.ref) : { frameId: 0, ref: undefined };
  await check();
  await page(a.tab, 'execute', { ...p, action: { ...a, ref } }, frameId);
  return {
    ok: true,
    tab: info,
    notice: 'Action dispatched. Verify the resulting page; this is not a receipt from the website.',
  };
}
async function run(command) {
  const g = generation;
  const check = async () => {
    if (g !== generation || Date.now() > command.expiresAt)
      throw new Error('Browser task stopped or expired.');
    await request(`/api/browser/device/commands/${command.id}`);
    if (g !== generation) throw new Error('Browser task stopped.');
  };
  await check();
  if (command.kind === 'prepare') return prepare(command.conversationId, command.payload);
  if (command.kind === 'execute') return execute(command.conversationId, command.payload, check);
  const tab = command.payload.tab;
  await assertTab(command.conversationId, tab);
  const until = Date.now() + 10000;
  while ((await chrome.tabs.get(Number(tab))).status === 'loading') {
    if (Date.now() >= until) throw new Error('Page is still loading. Try a fresh read shortly.');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await check();
  const info = await assertTab(command.conversationId, tab);
  if (command.kind === 'snapshot') {
    const frames = await page(tab, 'snapshot', {});
    const main = frames.find((r) => r.frameId === 0)?.result;
    if (!main) throw new Error('Page is loading or unavailable. Try reading again.');
    const text = frames
      .map((r) => `Frame ${r.frameId}: ${r.result?.url}\n${r.result?.text || ''}`)
      .join('\n\n');
    const elements = frames.flatMap((r) =>
      (r.result?.elements || []).map((e) => ({ ...e, ref: `${r.frameId}/${e.ref}` })),
    );
    return {
      url: main.url,
      title: main.title,
      text: text.slice(0, 40000),
      elements: elements.slice(0, 300),
      truncated:
        text.length > 40000 || elements.length > 300 || frames.some((r) => r.result?.truncated),
    };
  }
  if (command.kind === 'screenshot') {
    await chrome.debugger.attach({ tabId: Number(tab) }, '1.3');
    try {
      await check();
      const result = await chrome.debugger.sendCommand(
        { tabId: Number(tab) },
        'Page.captureScreenshot',
        { format: 'jpeg', quality: 65, captureBeyondViewport: false },
      );
      if (result.data.length > 4_000_000)
        throw new Error('Screenshot is too large. Reduce browser window size.');
      return { data: result.data, mimeType: 'image/jpeg', url: info.url };
    } finally {
      await chrome.debugger.detach({ tabId: Number(tab) }).catch(() => {});
    }
  }
  throw new Error('Unknown browser command.');
}
async function poll() {
  if (busy || !(await config())) return;
  busy = true;
  try {
    const reply = await request('/api/browser/device/poll');
    sessions = reply.sessions;
    if (!initialized) {
      initialized = true;
      // A restarted service worker has no local tab grants. Cancel server bindings before polling again.
      if (sessions.length && !attached.size) {
        for (const s of sessions)
          await request(`/api/conversations/${s.conversationId}/browser`, 'DELETE');
        sessions = [];
        return;
      }
    }
    const permitted = new Set(
      sessions.flatMap((s) => s.tabs.map((t) => `${s.conversationId}:${t.id}`)),
    );
    for (const [tab, chat] of attached) if (!permitted.has(`${chat}:${tab}`)) attached.delete(tab);
    if (reply.command) {
      const c = reply.command;
      let body;
      try {
        body = { result: await run(c) };
      } catch (e) {
        body = { error: String(e.message || e).slice(0, 2000) };
      }
      await request(`/api/browser/device/commands/${c.id}`, 'POST', body);
    }
  } catch (e) {
    await chrome.storage.session.set({ lastError: String(e.message || e) });
  } finally {
    busy = false;
  }
}
chrome.alarms.onAlarm.addListener(() => void poll());
setInterval(() => void poll(), 1000);
chrome.tabs.onRemoved.addListener((tab) => {
  attached.delete(String(tab));
  popups.delete(tab);
});
chrome.tabs.onCreated.addListener((t) => {
  if (attached.has(String(t.openerTabId))) popups.set(t.id, String(t.openerTabId));
});
chrome.tabs.onUpdated.addListener((id, change) => {
  const opener = popups.get(id);
  if (!opener || !change.url || !/^https?:/.test(change.url)) return;
  popups.delete(id);
  void (async () => {
    const tab = await tabInfo(id);
    const c = await config();
    if (!c || new URL(tab.url).origin === c.origin) return;
    const r = await request('/api/browser/device/child-tab', 'POST', { opener, tab });
    attached.set(tab.id, r.conversationId);
    const groupId = groups.get(r.conversationId);
    const group = await chrome.tabs.group({
      tabIds: [id],
      ...(groupId === undefined ? {} : { groupId }),
    });
    groups.set(r.conversationId, group);
    await chrome.tabGroups.update(group, { title: 'Frame task', color: 'yellow' });
  })().catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only extension-owned UI pages, never web pages or content scripts, may call this bridge.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  (async () => {
    if (message.type === 'status') {
      const c = await config();
      return {
        paired: !!c,
        origin: c?.origin,
        deviceId: c?.id,
        ...(await chrome.storage.session.get('lastError')),
      };
    }
    if (message.type === 'pair') {
      const u = new URL(message.origin);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.pathname !== '/' ||
        u.search ||
        u.hash
      )
        throw new Error('Enter the HTTPS Frame origin without a path.');
      const c = { origin: u.origin };
      const d = await request(
        '/api/browser/device/pair',
        'POST',
        { code: message.code.trim(), name: message.name || 'Chrome on Windows' },
        c,
      );
      generation++;
      attached.clear();
      prepared.clear();
      await chrome.storage.local.set({ connection: { ...c, ...d } });
      return { ok: true };
    }
    if (message.type === 'disconnect') {
      generation++;
      const chats = [...new Set(attached.values())];
      attached.clear();
      prepared.clear();
      for (const id of chats)
        await request(`/api/conversations/${id}/browser`, 'DELETE').catch(() => {});
      await chrome.storage.local.remove('connection');
      return { ok: true };
    }
    if (message.type === 'attach') {
      const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const c = await config();
      if (!t?.id || new URL(safeUrl(t.url)).origin === c.origin)
        throw new Error('Open the website tab you want Frame to use.');
      const existing = attached.get(String(t.id));
      if (existing && existing !== message.conversationId)
        throw new Error('Detach this tab from its other Frame conversation first.');
      const state = await request(`/api/conversations/${message.conversationId}/browser`);
      if (state.device && state.device.id !== c.id)
        throw new Error('Disconnect the other browser from this conversation first.');
      const tabs = state.tabs.filter((t) => attached.get(t.id) === message.conversationId);
      const item = await tabInfo(t.id);
      if (!tabs.some((t) => t.id === item.id)) tabs.push(item);
      const result = await request(`/api/conversations/${message.conversationId}/browser`, 'POST', {
        tabs,
      });
      attached.set(item.id, message.conversationId);
      await poll();
      return result;
    }
    if (message.type === 'api') {
      if (message.method === 'DELETE' && /\/browser$/.test(message.path)) {
        generation++;
        const chat = message.path.split('/')[3];
        for (const [t, c] of attached) if (c === chat) attached.delete(t);
        prepared.delete(chat);
      }
      if (/\/stop$/.test(message.path)) {
        generation++;
        prepared.clear();
      }
      return request(message.path, message.method, message.body);
    }
    if (message.type === 'tick') {
      await poll();
      return { ok: true };
    }
    throw new Error('Unsupported extension request.');
  })().then(
    (result) => respond({ result }),
    (e) => respond({ error: String(e.message || e) }),
  );
  return true;
});
