import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { detailedPacks, federalPacks, sectorPacks } from './src/index.js';
import { bundledPacks } from '../server/library/bundles.js';

// Build offline. No source scraping, credential use, or installation side effects.
const check = process.argv.includes('--check');
const root = new URL('./', import.meta.url);
const raw = 'https://raw.githubusercontent.com/hgursel/frame/main/knowledge-packs/';
const latest = bundledPacks.filter(
  (p) =>
    !bundledPacks.some(
      (q) => q.id === p.id && q.version.localeCompare(p.version, undefined, { numeric: true }) > 0,
    ),
);
const packs = [...detailedPacks, ...latest];
const emit = async (name: string, data: string) => {
  const url = new URL(name, root);
  if (check) {
    if ((await readFile(url, 'utf8').catch(() => '')) !== data)
      throw new Error(`Pack artifact out of date: ${name}. Run npm run packs:build.`);
  } else {
    await mkdir(new URL('./', url), { recursive: true });
    await writeFile(url, data);
  }
};
const catalog: {
  id: string;
  version: string;
  title: string;
  description: string;
  type: string;
  collection: string;
  reviewedAt: string;
  sections: number;
  words: number;
  sources: number;
  bytes: number;
  sha256: string;
  file: string;
  downloadUrl: string;
}[] = [];
for (const pack of packs) {
  const data = JSON.stringify(pack, null, 2) + '\n';
  const file = `${pack.id}/${pack.version}.json`;
  await emit(file, data);
  catalog.push({
    id: pack.id,
    version: pack.version,
    title: pack.title,
    description: pack.description,
    type: detailedPacks.includes(pack) ? 'detailed-guide' : 'bundled-brief',
    collection: federalPacks.includes(pack)
      ? 'Federal core'
      : sectorPacks.includes(pack)
        ? 'Industry guides'
        : detailedPacks.includes(pack)
          ? 'California and guild guides'
          : 'Bundled briefs',
    reviewedAt: pack.reviewedAt,
    sections: pack.pages.length,
    words: pack.pages.reduce((n, p) => n + p.text.split(/\s+/).length, 0),
    sources: new Set(pack.pages.flatMap((p) => p.sources.map((s) => s.url))).size,
    bytes: Buffer.byteLength(data),
    sha256: createHash('sha256').update(data).digest('hex'),
    file,
    downloadUrl: raw + file,
  });
}
await emit(
  'catalog.json',
  JSON.stringify({ format: 'frame-knowledge-catalog-1', packs: catalog }, null, 2) + '\n',
);
await emit(
  'CATALOG.md',
  '# Downloadable knowledge packs\n\nSave a JSON download, then choose **Import pack** in Frame’s Knowledge Library or Project settings. Importing does not attach it to a project. Detailed guides are optional additions; bundled briefs preserve the existing releases.\n\n' +
    ['Federal core', 'Industry guides', 'California and guild guides', 'Bundled briefs']
      .map(
        (collection) =>
          `## ${collection}\n\n` +
          '| Pack | Sections | Words | Sources | Download |\n|---|---:|---:|---:|---|\n' +
          catalog
            .filter((p) => p.collection === collection)
            .map(
              (p) =>
                `| ${p.title} | ${p.sections} | ${p.words} | ${p.sources} | [v${p.version} JSON](${p.downloadUrl}) |`,
            )
            .join('\n'),
      )
      .join('\n\n') +
    '\n',
);
const refs = new Map(
  detailedPacks.flatMap((p) =>
    p.pages.flatMap((page) => page.sources.map((s) => [s.url, s] as const)),
  ),
);
await emit(
  'SOURCES.md',
  '# Source register\n\nPublisher pages consulted on 2026-10-17 for the detailed guides. This is a source check, not attorney verification or a guarantee of completeness/currentness. Page-level references identify the topics supported. External publications are not redistributed. Federal guides distinguish binding rules from voluntary frameworks and model codes; state and local overlays require separate review.\n\n' +
    [...refs.values()]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((s) => `- [${s.title}](${s.url}) — ${s.locator}`)
      .join('\n') +
    '\n',
);
console.log(
  `${check ? 'Verified' : 'Built'} ${catalog.length} pack downloads in ${fileURLToPath(root)} (${detailedPacks.length} detailed guides, ${refs.size} distinct source URLs).`,
);
