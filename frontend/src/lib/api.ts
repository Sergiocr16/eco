const TOKEN = (import.meta.env.VITE_ECO_TOKEN as string) ?? '';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Authorization') && TOKEN) headers.set('Authorization', `Bearer ${TOKEN}`);
  if (!headers.has('X-Eco-Client')) headers.set('X-Eco-Client', '1');
  return fetch(path, { ...init, headers });
}
