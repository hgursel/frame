import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../extension/page.js', import.meta.url), 'utf8').replace(
  'export function pageCommand',
  'function pageCommand',
);
function fixture() {
  const dom = new JSDOM(
    `<!doctype html><body><h1>Record 42</h1><form><label>Department<input id="department" value="Operations"></label><label>Office<select><option value="la">Los Angeles</option><option value="ny">New York</option></select></label><button>Save record 42</button></form><a href="https://internal.test/list">Browse records</a><input type="search" aria-label="Search records"><input type="password" aria-label="Password" value="never-extract-me"><div id="shadow"></div></body>`,
    { url: 'http://internal.test/record/42', runScripts: 'outside-only', pretendToBeVisual: true },
  );
  // jsdom does not implement layout. Supply only layout/innerText, execute the real extension code unchanged.
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent || '';
    },
  });
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return (this.style.display === 'none' ? [] : [{}]) as any;
  };
  const page = dom.window.eval(`(${source})`) as (kind: string, payload: any) => any;
  const snap = () => page('snapshot', {});
  const ref = (label: string) => snap().elements.find((e: any) => e.label === label).ref;
  return { dom, page, snap, ref };
}
test('real page executor extracts controls/options/shadow content without password values', () => {
  const f = fixture();
  try {
    f.dom.window.document.getElementById('shadow')!.attachShadow({ mode: 'open' }).innerHTML =
      '<button>Shadow control</button>';
    const snap = f.snap();
    assert.ok(snap.elements.some((e: any) => e.label === 'Shadow control'));
    assert.equal(snap.elements.find((e: any) => e.label === 'Office').options[1].value, 'ny');
    assert.ok(!JSON.stringify(snap).includes('never-extract-me'));
    const protectedRef = snap.elements.find((e: any) => e.label.includes('Protected field')).ref;
    assert.throws(
      () => f.page('prepare', { kind: 'fill', tab: '1', ref: protectedRef, value: 'secret' }),
      /Protected/,
    );
  } finally {
    f.dom.window.close();
  }
});
test('real page executor leaves mutation targets untouched until execute and rejects changed targets', () => {
  const f = fixture();
  try {
    let saves = 0,
      inputs = 0;
    const doc = f.dom.window.document;
    doc.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      saves++;
    });
    doc.getElementById('department')!.addEventListener('input', () => inputs++);
    const fill = f.page('prepare', {
      kind: 'fill',
      tab: '1',
      ref: f.ref('Department'),
      value: 'Engineering',
    });
    const save = f.page('prepare', { kind: 'click', tab: '1', ref: f.ref('Save record 42') });
    assert.equal(fill.review, true);
    assert.equal(save.review, true);
    assert.equal((doc.getElementById('department') as HTMLInputElement).value, 'Operations');
    f.page('execute', fill);
    f.page('execute', save);
    assert.equal((doc.getElementById('department') as HTMLInputElement).value, 'Engineering');
    assert.equal(inputs, 1);
    assert.equal(saves, 1);
    const stale = f.page('prepare', { kind: 'click', tab: '1', ref: f.ref('Save record 42') });
    doc.querySelector('button')!.textContent = 'Delete record 42';
    assert.throws(() => f.page('execute', stale), /changed after review/);
    assert.equal(saves, 1);
    const absent = f.page('prepare', {
      kind: 'fill',
      tab: '1',
      ref: f.ref('Department'),
      value: 'Finance',
    });
    doc.getElementById('department')!.remove();
    assert.throws(() => f.page('execute', absent), /element changed/);
  } finally {
    f.dom.window.close();
  }
});
test('search and normal navigation classify separately from unknown/autosaving controls', () => {
  const f = fixture();
  try {
    assert.equal(
      f.page('prepare', { kind: 'fill', tab: '1', ref: f.ref('Search records'), value: '42' })
        .review,
      false,
    );
    assert.equal(
      f.page('prepare', { kind: 'click', tab: '1', ref: f.ref('Browse records') }).review,
      false,
    );
    assert.equal(
      f.page('prepare', { kind: 'press', tab: '1', ref: f.ref('Department'), key: 'Enter' }).review,
      true,
    );
    assert.throws(
      () => f.page('prepare', { kind: 'press', tab: '1', ref: f.ref('Department'), key: 'F12' }),
      /Unsupported/,
    );
    const prepared = f.page('prepare', {
      kind: 'fill',
      tab: '1',
      ref: f.ref('Department'),
      value: 'Finance',
    });
    // User-generated input events increment this counter in Chrome; jsdom events are never trusted.
    (f.dom.window as any).__frameBrowserV1.userVersion++;
    assert.throws(() => f.page('execute', prepared), /changed after review/);
  } finally {
    f.dom.window.close();
  }
});
