/** Runs only in Chrome's isolated content-script world. No model-supplied code is evaluated. */
export function pageCommand(kind, payload) {
  const key = '__frameBrowserV1';
  const state = (globalThis[key] ||= {
    document: Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
    nodes: new Map(),
    reverse: new WeakMap(),
    next: 0,
    userVersion: 0,
  });
  if (!state.listening) {
    state.listening = true;
    for (const event of ['input', 'change', 'click', 'keydown'])
      document.addEventListener(
        event,
        (e) => {
          if (e.isTrusted) state.userVersion++;
        },
        true,
      );
  }
  const visible = (e) =>
    e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const secret = (e) =>
    /password|one.?time|otp|verification.?code|credit.?card|card.?number|security.?code|secret|token/i.test(
      [e.type, e.name, e.id, e.autocomplete, e.getAttribute('aria-label')].join(' '),
    );
  const label = (e) =>
    (
      e.getAttribute('aria-label') ||
      [...(e.labels || [])]
        .map((l) => {
          const copy = l.cloneNode(true);
          for (const control of copy.querySelectorAll('input,textarea,select,button'))
            control.remove();
          return copy.textContent || '';
        })
        .join(' ') ||
      e.innerText ||
      e.getAttribute('placeholder') ||
      e.getAttribute('title') ||
      e.name ||
      e.tagName
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 500);
  const ref = (e) => {
    let r = state.reverse.get(e);
    if (!r) {
      r = `${state.document}:${++state.next}`;
      state.reverse.set(e, r);
      state.nodes.set(r, e);
    }
    return r;
  };
  const roots = [document];
  const all = [];
  // Open shadow roots are supported. Closed roots need human handoff.
  for (let r = 0; r < roots.length; r++)
    for (const e of roots[r].querySelectorAll('*')) {
      if (e.shadowRoot) roots.push(e.shadowRoot);
      all.push(e);
    }
  if (kind === 'snapshot') {
    if (state.nodes.size > 5000) {
      state.nodes.clear();
      state.reverse = new WeakMap();
    }
    const text = roots
      .map((r) => (r === document ? document.body?.innerText || '' : r.textContent || ''))
      .join('\n');
    const controls = all.filter(
      (e) =>
        e.matches(
          'a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[role=checkbox],[contenteditable=true]',
        ) && visible(e),
    );
    return {
      url: location.href,
      title: document.title.slice(0, 500),
      text: text.slice(0, 30000),
      elements: controls.slice(0, 250).map((e) => ({
        ref: ref(e),
        role: e.getAttribute('role') || e.tagName.toLowerCase(),
        label: secret(e) ? '[Protected field: complete manually]' : label(e),
        ...(e.tagName === 'SELECT' && !secret(e)
          ? {
              options: [...e.options]
                .slice(0, 100)
                .map((o) => ({ value: o.value.slice(0, 1000), label: o.text.slice(0, 200) })),
            }
          : {}),
      })),
      truncated: text.length > 30000 || controls.length > 250,
    };
  }
  const a = kind === 'prepare' ? payload : payload.action;
  const e = a.ref ? state.nodes.get(a.ref) : undefined;
  if (a.ref && (!e || !e.isConnected || !visible(e)))
    throw new Error('Page element changed. Read the page again.');
  if (e && (secret(e) || e.disabled || e.readOnly))
    throw new Error('Protected or unavailable control. Ask the user to complete this step.');
  if (a.kind === 'press' && !['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(a.key))
    throw new Error('Unsupported key.');
  if (['fill', 'select'].includes(a.kind) && !e?.matches('input,textarea,select'))
    throw new Error('This custom input needs a human handoff.');
  if (a.kind === 'fill' && e?.matches('input[type=file],input[type=checkbox],input[type=radio]'))
    throw new Error('Use click for selection controls; file uploads are unavailable.');
  const form = e?.closest('form');
  const search =
    e?.matches('input[type=search]') ||
    !!e?.closest('[role=search]') ||
    form?.getAttribute('role') === 'search';
  const link =
    a.kind === 'click' &&
    e?.matches('a[href]') &&
    /^https?:$/.test(new URL(e.href).protocol) &&
    !e.hasAttribute('download') &&
    !e.getAttribute('onclick') &&
    !/delete|remove|save|submit|send|approve|purchase|logout|sign.?out/i.test(
      `${label(e)} ${e.href}`,
    );
  const free =
    a.kind === 'scroll' ||
    (!!search && ['fill', 'select', 'press', 'click'].includes(a.kind)) ||
    !!link ||
    (a.kind === 'press' && ['Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(a.key));
  const fingerprint = JSON.stringify({
    document: state.document,
    user: state.userVersion,
    url: location.href,
    ref: a.ref,
    label: e ? label(e) : '',
    tag: e?.tagName,
    type: e?.type,
    href: e?.getAttribute('href'),
    action: form?.action,
    row: e?.closest('tr')?.innerText?.slice(0, 1500),
    formText: form?.innerText?.slice(0, 2000),
  });
  if (kind === 'prepare')
    return {
      action: a,
      url: location.href,
      title: document.title.slice(0, 500),
      label: e ? label(e) : 'Page',
      fingerprint,
      review: !free,
      reason: free
        ? 'Navigation, search, or viewing action.'
        : 'This control may save, submit, or change website data, including autosave.',
    };
  if (payload.fingerprint !== fingerprint)
    throw new Error('Page or user input changed after review. Inspect and prepare a new batch.');
  if (a.kind === 'scroll')
    window.scrollBy({ top: a.direction === 'up' ? -650 : 650, behavior: 'instant' });
  else if (a.kind === 'click') e.click();
  else if (a.kind === 'fill' || a.kind === 'select') {
    e.focus();
    const proto =
      e.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : e.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) throw new Error('Unsupported field.');
    if (e.tagName === 'SELECT' && ![...e.options].some((o) => o.value === a.value))
      throw new Error('Select option unavailable.');
    setter.call(e, a.value);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (a.kind === 'press') {
    e.focus();
    if (a.key === 'Enter' && form) form.requestSubmit();
    else if (a.key === 'Enter' && e.matches('button,a')) e.click();
    else {
      e.dispatchEvent(new KeyboardEvent('keydown', { key: a.key, bubbles: true }));
      e.dispatchEvent(new KeyboardEvent('keyup', { key: a.key, bubbles: true }));
    }
  } else throw new Error('Unsupported page action.');
  return { ok: true };
}
