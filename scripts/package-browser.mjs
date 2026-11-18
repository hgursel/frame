import { readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
await copyFile('extension/manifest.json', 'dist/browser-extension/manifest.json');
const entries = {};
async function collect(dir, prefix = '') {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await collect(`${dir}/${e.name}`, `${prefix}${e.name}/`);
    else entries[`${prefix}${e.name}`] = new Uint8Array(await readFile(`${dir}/${e.name}`));
  }
}
await collect('dist/browser-extension');
await writeFile('dist/frame-browser.zip', zipSync(entries));
console.log('Built dist/frame-browser.zip');
