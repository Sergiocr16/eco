import { ecoToken, ecoBackend } from './eco-config';

function readSession(): string | null {
  try { return window.localStorage.getItem('eco.session'); } catch { return null; }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  // Resolvemos token y backend en cada llamada (no al cargar el módulo) porque
  // en Electron empaquetado los valores se setean tras un IPC asíncrono.
  const token = ecoToken();
  if (!headers.has('Authorization') && token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('X-Eco-Client')) headers.set('X-Eco-Client', '1');
  const session = readSession();
  if (session && !headers.has('X-Eco-Session')) headers.set('X-Eco-Session', session);
  // Si pasaron URL absoluta o ya tiene base, dejamos pasar. Sino, prefijamos
  // con BACKEND (vacío en dev → Vite proxy lo maneja; absoluto en Electron).
  const url = /^https?:/i.test(path) ? path : `${ecoBackend()}${path}`;
  return fetch(url, { ...init, headers });
}
