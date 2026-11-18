// Real unpacked Chrome extension + real Pi worker, with a deterministic local model and fixture website.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { createApp } from '../server/app.js';
import { waitUntil } from './helpers.js';
const root = await mkdtemp(path.join(tmpdir(), 'frame-extension-ui-'));
const modelRequests: any[] = [];
let tab = '',
  step = 0;
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const b = JSON.parse(raw);
  modelRequests.push(b);
  let planned: any;
  if (step === 0) planned = { name: 'browser_tabs', args: {} };
  if (step === 1) {
    tab = JSON.parse(b.messages.at(-1).content)[0].id;
    planned = { name: 'browser_snapshot', args: { tab } };
  }
  if (step === 2) {
    const snap = JSON.parse(b.messages.at(-1).content);
    planned = {
      name: 'browser_actions',
      args: {
        summary: 'Change record 42 department to Engineering and save.',
        actions: [
          {
            kind: 'fill',
            tab,
            ref: snap.elements.find((e: any) => e.label === 'Department').ref,
            value: 'Engineering',
          },
          {
            kind: 'click',
            tab,
            ref: snap.elements.find((e: any) => e.label === 'Save record 42').ref,
          },
        ],
      },
    };
  }
  if (step === 3) planned = { name: 'browser_screenshot', args: { tab } };
  if (step === 4) planned = { name: 'browser_snapshot', args: { tab } };
  step++;
  const delta = planned
    ? {
        tool_calls: [
          {
            index: 0,
            id: `browser-${step}`,
            type: 'function',
            function: { name: planned.name, arguments: JSON.stringify(planned.args) },
          },
        ],
      }
    : { content: 'Record 42 is now in Engineering. The page confirms Saved Engineering.' };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    `data: ${JSON.stringify({ id: 'browser', choices: [{ index: 0, delta, finish_reason: planned ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const website = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><html><body><h1>Employee record 42</h1><table><tr><th>Record</th><th>Name</th></tr><tr><td>42</td><td>Example Person</td></tr></table><form onsubmit="event.preventDefault(); window.saves=(window.saves||0)+1; document.getElementById('status').textContent='Saved '+document.getElementById('department').value"><label>Department<input id="department" value="Operations"></label><button>Save record 42</button></form><p id="status">Not saved</p><input type="password" aria-label="Password" value="never-send-this"><div id="shadow"></div><script>document.getElementById('shadow').attachShadow({mode:'open'}).innerHTML='<button>Shadow control</button>'</script></body></html>`,
  );
});
await new Promise<void>((r) => website.listen(0, '127.0.0.1', r));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-days',
    '1',
    '-keyout',
    path.join(root, 'key.pem'),
    '-out',
    path.join(root, 'cert.pem'),
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ],
  { stdio: 'ignore' },
);
let upstream = 0;
const proxy = httpsServer(
  {
    key: await readFile(path.join(root, 'key.pem')),
    cert: await readFile(path.join(root, 'cert.pem')),
  },
  (req, res) => {
    const f = request(
      {
        hostname: '127.0.0.1',
        port: upstream,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode!, response.headers);
        response.pipe(res);
      },
    );
    f.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(f);
  },
);
await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
const origin = `https://127.0.0.1:${(proxy.address() as any).port}`;
const f = await createApp({
  dataDir: path.join(root, 'data'),
  origin,
  setupToken: 'test',
  webDir: path.resolve('dist/web'),
});
await f.app.listen({ host: '127.0.0.1', port: 0 });
upstream = (f.app.server.address() as any).port;
const user = f.store.createUser('tester', 'browser-test-password', 'admin', false);
const project = f.store.createProject(
  {
    name: 'Browser acceptance',
    instructions: 'Use the browser tools to update record 42.',
    toolsEnabled: true,
  },
  user.id,
);
f.store.db.prepare("INSERT OR REPLACE INTO project_plugins VALUES (?,'browser',1)").run(project.id);
f.browser.setEnabled(true);
f.store.saveSettings({
  ...f.store.settings(),
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
  modelId: 'local',
  contextWindow: 32768,
  maxTokens: 2048,
  supportsImages: true,
});
const extension = path.resolve('dist/browser-extension');
let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
try {
  context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
    channel: process.env.FRAME_BROWSER_EXECUTABLE ? undefined : 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    ignoreHTTPSErrors: true,
    viewport: { width: 440, height: 1000 },
    args: [
      '--no-sandbox',
      '--ignore-certificate-errors',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const panel = await context.newPage();
  panel.setDefaultTimeout(30000);
  const errors: string[] = [];
  panel.on('pageerror', (e) => errors.push(e.message));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByLabel('Frame HTTPS address').fill(origin);
  await panel.getByLabel('One-time pairing code').fill(f.browser.pairCode(user.id).code);
  await panel.getByRole('button', { name: 'Connect Frame', exact: true }).click();
  await expect(panel.getByLabel('Project', { exact: true })).toBeVisible();
  await panel.getByLabel('Project', { exact: true }).selectOption(project.id);
  await panel.getByRole('button', { name: 'New chat', exact: true }).click();
  const conversationId = await panel.getByLabel('Conversation', { exact: true }).inputValue();
  assert.ok(conversationId);
  const site = await context.newPage();
  await site.goto(`http://127.0.0.1:${(website.address() as any).port}`);
  await site.bringToFront();
  const attached = await panel.evaluate(
    async (id) =>
      (globalThis as any).chrome.runtime.sendMessage({ type: 'attach', conversationId: id }),
    conversationId,
  );
  assert.equal(attached.error, undefined, attached.error);
  await expect(panel.getByText('1 attached tab', { exact: true })).toBeVisible();
  await panel
    .getByLabel('Message Frame')
    .fill(
      'Change record 42 department to Engineering, save it, and verify with a screenshot and page text.',
    );
  await panel.getByLabel('Send message', { exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Approve listed actions' })).toBeVisible({
    timeout: 45000,
  });
  assert.equal(await site.locator('#department').inputValue(), 'Operations');
  assert.equal(await site.evaluate(() => (window as any).saves || 0), 0);
  // Approve from the main Frame website, demonstrating shared conversation/review state.
  const web = await context.newPage();
  await context.request.post(`${origin}/api/auth/login`, {
    headers: { origin },
    data: { username: 'tester', password: 'browser-test-password' },
  });
  await web.goto(`${origin}/?conversation=${conversationId}`);
  await expect(web.getByRole('button', { name: 'Approve listed actions' })).toBeVisible();
  await web.getByRole('button', { name: 'Approve listed actions' }).click();
  await expect(site.locator('#status')).toHaveText('Saved Engineering', { timeout: 30000 });
  await waitUntil(() => !f.runner.active.has(conversationId), 45000);
  assert.equal(await site.evaluate(() => (window as any).saves), 1);
  await expect(panel.getByText('Record 42 is now in Engineering.', { exact: false })).toBeVisible({
    timeout: 10000,
  });
  const history = f.runner.snapshot(conversationId);
  assert.ok(history.messages.some((m) => m.name === 'browser_screenshot' && m.images?.length));
  assert.ok(
    modelRequests.some((r) => JSON.stringify(r.messages).includes('image_url')),
    'Screenshot reaches model through native tool image content',
  );
  assert.ok(!JSON.stringify(modelRequests).includes('never-send-this'));
  assert.ok(modelRequests[0].tools.some((t: any) => t.function.name === 'browser_actions'));
  assert.ok(
    !modelRequests[0].tools.some((t: any) => t.function.name === 'bash'),
    'Browser runs cannot bypass approvals through host tools',
  );
  await panel.screenshot({
    path: process.env.FRAME_BROWSER_SCREENSHOT || '/tmp/frame-browser-panel.png',
    fullPage: true,
  });
  // Real DOM stale-target protection and protected fields, using the same bundled executor.
  const snapshotPromise = f.browser.invoke(
    conversationId,
    'manual',
    'browser_snapshot',
    { tab },
    new AbortController().signal,
  );
  const snap = (await snapshotPromise) as any;
  assert.ok(snap.elements.some((e: any) => e.label === 'Shadow control'));
  const next = f.browser.invoke(
    conversationId,
    'manual',
    'browser_actions',
    {
      summary: 'Change department',
      actions: [
        {
          kind: 'fill',
          tab,
          ref: snap.elements.find((e: any) => e.label === 'Department').ref,
          value: 'Finance',
        },
      ],
    },
    new AbortController().signal,
  );
  await waitUntil(() => !!f.browser.state(conversationId).review);
  await site.locator('#department').fill('User edited');
  const review = f.browser.state(conversationId).review!;
  f.browser.decide(conversationId, review.id, 'manual', true);
  const outcome = (await next) as any;
  assert.equal(outcome.stopped, true);
  assert.match(outcome.error, /changed/);
  assert.equal(await site.locator('#department').inputValue(), 'User edited');
  assert.deepEqual(errors, []);
  console.log(
    'Frame browser extension acceptance passed: real extension, real Pi worker, shared review, screenshot, no replay, stale targets.',
  );
} finally {
  await context?.close();
  await f.app.close();
  model.closeAllConnections();
  website.closeAllConnections();
  proxy.closeAllConnections();
  await Promise.all([
    new Promise<void>((r) => model.close(() => r())),
    new Promise<void>((r) => website.close(() => r())),
    new Promise<void>((r) => proxy.close(() => r())),
  ]);
  await rm(root, { recursive: true, force: true });
}
