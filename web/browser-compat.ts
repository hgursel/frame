/** getRandomValues remains available on LAN HTTP, unlike randomUUID. */
export function requestId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const focused = document.activeElement as HTMLElement | null;
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.className = 'clipboard-buffer';
  input.setAttribute('aria-label', 'Copy text');
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) throw new Error('Copy unavailable');
  } finally {
    input.remove();
    focused?.focus({ preventScroll: true });
  }
}
