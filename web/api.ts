export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(60_000),
    headers:
      body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('frame-signed-out'));
    throw new Error(json.error || 'Request failed');
  }
  return json;
}
