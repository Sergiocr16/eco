const TOKEN = (import.meta.env.VITE_ECO_TOKEN as string) ?? '';

function readSession(): string | null {
  try { return window.localStorage.getItem('eco.session'); } catch { return null; }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Authorization') && TOKEN) headers.set('Authorization', `Bearer ${TOKEN}`);
  if (!headers.has('X-Eco-Client')) headers.set('X-Eco-Client', '1');
  const session = readSession();
  if (session && !headers.has('X-Eco-Session')) headers.set('X-Eco-Session', session);
  return fetch(path, { ...init, headers });
}
