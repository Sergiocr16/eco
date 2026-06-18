import { ecoBackend } from './eco-config';
import { currentIdToken } from './firebase';

// Auth contra el backend local = ID token de Firebase (Bearer). El SDK lo
// refresca solo, así que pedimos uno fresco en cada request. El header
// X-Eco-Client sigue siendo el gate de transporte local (anti CSRF/rebinding).
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Si pasaron URL absoluta o ya tiene base, dejamos pasar. Sino, prefijamos
  // con BACKEND (vacío en dev → Vite proxy lo maneja; absoluto en Electron).
  const url = /^https?:/i.test(path) ? path : `${ecoBackend()}${path}`;

  const headers = new Headers(init.headers);
  if (!headers.has('Authorization')) {
    const idToken = await currentIdToken();
    if (idToken) headers.set('Authorization', `Bearer ${idToken}`);
  }
  if (!headers.has('X-Eco-Client')) headers.set('X-Eco-Client', '1');

  try {
    return await fetch(url, { ...init, headers });
  } catch (e) {
    // Log que va al main process (vía preload IPC) para diagnosticar el
    // típico "Failed to fetch" sin contexto en la consola.
    const api = (window as unknown as { electronAPI?: { log?: (...a: unknown[]) => void } }).electronAPI;
    api?.log?.('[apiFetch] failed', { url, error: (e as Error).message });
    throw e;
  }
}
