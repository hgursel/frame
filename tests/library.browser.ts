import { openAccountPage } from './navigation.js';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
const { createApp } = await import(new URL('../dist/server/app.js', import.meta.url).href);
let received: any;
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  received = JSON.parse(raw);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const answer =
    'Review the leave policy using [Paid Sick Leave](/api/library/packs/california-hr/1.1.0/pages/sick-leave). Confirm schedule and location first.';
  res.end(
    'data: ' +
      JSON.stringify({
        id: 'test',
        choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: null }],
      }) +
      '\n\ndata: ' +
      JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
const root = await mkdtemp(path.join(tmpdir(), 'frame-library-browser-'));
const origin = 'http://127.0.0.1:31880';
let packDownloads = 0;
let downloadFailure = false;
const federalPack = JSON.parse(await readFile('knowledge-packs/catalog.json', 'utf8')).packs.find(
  (p: any) => p.collection === 'Federal core',
);
const federalData = await readFile(`knowledge-packs/${federalPack.file}`);
const scrollSettingsToTop = (element: Element) => {
  for (let parent: Element | null = element; parent; parent = parent.parentElement)
    parent.scrollTop = 0;
};
const ctx = await createApp({
  dataDir: root,
  origin,
  setupToken: 'library-test',
  webDir: path.resolve('dist/web'),
  libraryFetch: async (url: string) => {
    packDownloads++;
    assert.equal(url, federalPack.downloadUrl);
    if (downloadFailure) throw new Error('offline');
    return new Response(federalData);
  },
});
const project = ctx.store.createProject({
  name: 'People and Contracts',
  instructions: '',
  toolsEnabled: false,
});
ctx.store.saveSettings({
  ...ctx.store.settings(),
  modelId: 'local-test',
  baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
});
// Exercise upgrading a project that already uses the released HR v1.0 pack.
ctx.library.install(ctx.library.get('california-hr', '1.0.0'));
ctx.library.attach(project.id, 'california-hr', '1.0.0', null);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await ctx.app.listen({ host: '127.0.0.1', port: 31880 });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FRAME_BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Setup token').fill('library-test');
  await page.getByLabel('Password').fill('library-test-password');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await openAccountPage(page, 'Admin');
  await page.getByRole('tab', { name: 'Knowledge Library', exact: true }).click();
  const hr = page.locator('.library-card').filter({
    has: page.getByRole('heading', { name: 'California HR Essentials' }),
    hasText: 'v1.1.0',
  });
  const contracts = page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: 'Business Contract Review' }) });
  for (const title of [
    'Workplace Investigations',
    'Performance Reviews & Improvement Plans',
    'Commercial Leases',
    'Cybersecurity Essentials',
    'IT Security Operations',
    'Responsible AI at Work',
  ])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse packs', exact: true })).toBeVisible();
  assert((await contracts.boundingBox())!.height < 150, 'Collapsed catalog rows should be compact');
  await page.getByLabel('Search knowledge packs').fill('cybersecurity');
  await expect(
    page.getByRole('heading', { name: 'Cybersecurity Essentials', exact: true }),
  ).toBeVisible();
  await expect(hr).toHaveCount(0);
  await page.getByLabel('Search knowledge packs').fill('no-such-topic-xyz');
  await expect(page.getByText('No packs match your search or filter.')).toBeVisible();
  await page.getByLabel('Search knowledge packs').fill('');
  await page.getByLabel('Filter knowledge packs').selectOption('installed');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByLabel('Filter knowledge packs').selectOption('all');
  await hr.getByRole('button', { name: 'Install pack' }).click();
  await expect(hr.getByRole('button', { name: 'Installed', exact: true })).toBeDisabled();
  await contracts.getByRole('button', { name: 'Install pack' }).click();
  await expect(contracts.getByRole('button', { name: 'Installed', exact: true })).toBeDisabled();
  await hr.getByText('Explore sections').click();
  await hr.getByRole('button', { name: 'Paid Sick Leave', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Library reference' });
  await expect(reader.getByRole('heading', { name: 'Paid Sick Leave', exact: true })).toBeVisible();
  await expect(
    reader.getByRole('link', { name: /California Paid Sick Leave FAQ/ }),
  ).toHaveAttribute('href', 'https://www.dir.ca.gov/dlse/paid_sick_leave.htm');
  await page.keyboard.press('Escape');
  await expect(reader).not.toBeVisible();
  const cyber = page.locator('.library-card').filter({
    has: page.getByRole('heading', { name: 'Cybersecurity Essentials', exact: true }),
  });
  await cyber.getByRole('button', { name: 'Install pack' }).click();
  await expect(cyber.getByRole('button', { name: 'Installed', exact: true })).toBeDisabled();
  await cyber.getByText('Explore sections').click();
  await cyber
    .getByRole('button', { name: 'Cybersecurity Risk Register Template', exact: true })
    .click();
  await expect(reader.getByRole('table')).toBeVisible();
  await expect(reader.getByText(/not an official NIST form/)).toBeVisible();
  await page.keyboard.press('Escape');
  const ai = page.locator('.library-card').filter({
    has: page.getByRole('heading', { name: 'Responsible AI at Work', exact: true }),
  });
  await ai.getByText('Explore sections').click();
  await ai.getByRole('button', { name: 'AI-Use Assessment Template', exact: true }).click();
  await expect(reader.getByRole('table')).toBeVisible();
  await expect(reader.getByRole('link', { name: /NIST AI RMF Playbook/ })).toHaveAttribute(
    'href',
    'https://airc.nist.gov/airmf-resources/playbook/map/',
  );
  await page.keyboard.press('Escape');
  if (process.env.FRAME_SCREENSHOT) {
    await page
      .locator('.library-card details[open] summary')
      .evaluateAll((elements) => elements.forEach((el) => (el as HTMLElement).click()));
    await page.locator('.library-heading').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-library.png'),
      fullPage: true,
    });
  }
  if (!(await page.getByLabel('Project menu: People and Contracts').isVisible()))
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByLabel('Project menu: People and Contracts').click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Knowledge & Library', exact: true }).click();
  await page.locator('.library-collapse > summary').click();
  assert.equal(ctx.library.attachments(project.id)[0].version, '1.0.0');
  await hr.getByRole('button', { name: 'Use this version' }).click();
  await expect(hr.getByRole('button', { name: 'Detach' })).toBeVisible();
  assert.equal(ctx.library.attachments(project.id)[0].version, '1.1.0');
  await contracts.getByRole('button', { name: 'Attach to project' }).click();
  await expect(contracts.getByRole('button', { name: 'Detach' })).toBeVisible();
  assert.equal(ctx.library.attachments(project.id).length, 2);
  const leases = page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: 'Commercial Leases', exact: true }) });
  await leases.getByRole('button', { name: 'Install & attach', exact: true }).click();
  await expect(leases.getByRole('button', { name: 'Detach', exact: true })).toBeVisible();
  await leases.getByRole('button', { name: 'Detach', exact: true }).click();
  await expect(
    leases.getByRole('button', { name: 'Attach to project', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Import library pack')
    .setInputFiles(path.resolve('knowledge-packs/guild-governance-guide/1.0.0.json'));
  const guild = page.locator('.library-card').filter({
    has: page.getByRole('heading', {
      name: 'Guild Governance, Elections & Financial Stewardship',
      exact: true,
    }),
  });
  await expect(guild).toBeVisible();
  assert.equal(
    ctx.library.attachments(project.id).length,
    2,
    'Import should not automatically attach',
  );
  await guild.getByRole('button', { name: 'Attach to project', exact: true }).click();
  await expect(guild.getByRole('button', { name: 'Detach', exact: true })).toBeVisible();
  await guild.getByText('Explore sections').click();
  await guild
    .getByRole('button', { name: 'Member Rights and Officer Elections', exact: true })
    .click();
  await expect(
    reader.getByRole('heading', { name: 'Member Rights and Officer Elections', exact: true }),
  ).toBeVisible();
  await expect(reader.getByRole('link', { name: /OLMS: Conducting Local/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Filter knowledge packs').selectOption('attached');
  await expect(page.locator('.library-card')).toHaveCount(3);
  await page.getByLabel('Filter knowledge packs').selectOption('all');
  if (!(await page.getByLabel('Project menu: People and Contracts').isVisible()))
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page
    .getByRole('button', { name: 'People and Contracts', exact: false })
    .filter({ has: page.locator('.folder') })
    .click();
  await page
    .getByPlaceholder('Ask Frame anything about your work…')
    .fill('Review California paid sick leave accrual.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.locator('.rich-markdown').filter({ hasText: 'Review the leave policy' }),
  ).toBeVisible({ timeout: 30000 });
  const request = JSON.stringify(received);
  assert(
    request.includes('40 hours or five days'),
    'relevant library brief reaches actual SDK model request',
  );
  assert(request.includes('/api/library/packs/california-hr/1.1.0/pages/sick-leave'));
  assert(
    !request.includes('Contract Review and Document Authority\n\nPack:'),
    'entire unrelated pack is not injected',
  );
  await page
    .locator('.rich-markdown')
    .getByRole('button', { name: 'Paid Sick Leave', exact: true })
    .click();
  await expect(reader).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(reader).not.toBeVisible();
  await openAccountPage(page, 'Admin');
  await page.getByRole('tab', { name: 'Knowledge Library', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.getByRole('button', { name: 'Close navigation', exact: true }).isVisible())
    await page.keyboard.press('Escape');
  await page.locator('.library-heading').scrollIntoViewIfNeeded();
  await expect(hr).toBeVisible();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'mobile page must not overflow',
  );
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-library-mobile.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Browse packs', exact: true }).click();
  await expect(page.locator('.library-download-catalog .library-card')).toHaveCount(36);
  await page.getByLabel('Filter pack collection').selectOption('Federal core');
  await expect(page.locator('.library-card')).toHaveCount(7);
  await page.getByLabel('Search downloadable packs').fill('no-match-xyz');
  await expect(page.getByText('No packs match your search.', { exact: false })).toBeVisible();
  await page.getByLabel('Search downloadable packs').fill(federalPack.title);
  const downloadable = page.locator('.library-download-catalog .library-card');
  await expect(downloadable).toHaveCount(1);
  await downloadable.getByText('Pack details & sections').click();
  await expect(downloadable.locator('.library-sections li')).toHaveCount(federalPack.sections);
  assert.equal(packDownloads, 0, 'browsing and inspecting metadata must not fetch GitHub');
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'mobile catalog must not overflow',
  );
  await page.locator('.settings-panel').evaluate(scrollSettingsToTop);
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-catalog-mobile.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 1440, height: 1100 });
  downloadFailure = true;
  await downloadable.getByRole('button', { name: 'Install pack', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not download this pack');
  await expect(
    downloadable.getByRole('button', { name: 'Install pack', exact: true }),
  ).toBeEnabled();
  downloadFailure = false;
  const downloaded = page.waitForEvent('download');
  await downloadable.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const file = await downloaded;
  assert.equal(file.suggestedFilename(), `${federalPack.id}-${federalPack.version}.json`);
  assert.deepEqual(await readFile((await file.path())!), federalData);
  assert(!ctx.library.installed().some((p: any) => p.id === federalPack.id));
  const attachmentsBefore = ctx.library.attachments(project.id);
  await downloadable.getByRole('button', { name: 'Install pack', exact: true }).click();
  await expect(downloadable.getByRole('button', { name: 'Installed', exact: true })).toBeDisabled();
  assert.deepEqual(ctx.library.attachments(project.id), attachmentsBefore);
  await expect(
    page.getByRole('status').filter({ hasText: 'installed. Return to the library' }),
  ).toBeVisible();
  await page.locator('.settings-panel').evaluate(scrollSettingsToTop);
  if (process.env.FRAME_SCREENSHOT)
    await page.screenshot({
      path: process.env.FRAME_SCREENSHOT.replace('.png', '-catalog.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  await page.getByLabel('Search knowledge packs').fill(federalPack.title);
  await expect(page.getByRole('heading', { name: federalPack.title, exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    'Library browser: installation, attachment, sources, SDK retrieval, citations, dialog, and mobile layout passed.',
  );
} finally {
  await browser?.close();
  await ctx.app.close();
  await new Promise<void>((r, j) => model.close((e) => (e ? j(e) : r())));
  await rm(root, { recursive: true, force: true });
}
