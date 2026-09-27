export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(60_000),
    headers:
      body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  // A reverse proxy can answer with an HTML error page (502, 413); do not surface a JSON parse error.
  const json = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('frame-signed-out'));
    throw new Error(json?.error || `Request failed (HTTP ${response.status})`);
  }
  if (json === undefined) throw new Error('The server returned an unreadable response.');
  return json;
}
