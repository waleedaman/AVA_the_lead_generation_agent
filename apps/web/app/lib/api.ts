export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const url = `${API_BASE_URL}${path}`;
  const startedAt = Date.now();

  try {
    const res = await fetch(url, init);
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      const message = await res.text();
      void logClientEvent('api_error', {
        path,
        method,
        status: res.status,
        durationMs,
        message,
      });
      throw new Error(message || `Request failed: ${res.status}`);
    }
    if (method !== 'GET') {
      void logClientEvent('api_mutation_success', {
        path,
        method,
        status: res.status,
        durationMs,
      });
    }
    return res.json() as Promise<T>;
  } catch (error) {
    void logClientEvent('api_fetch_failed', {
      path,
      method,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function logClientEvent(event: string, data: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        page: window.location.href,
        ...data,
      }),
    });
  } catch {
    // Logging must never break UI behavior.
  }
}
