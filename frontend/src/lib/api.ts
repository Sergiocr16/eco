import { ecoToken, ecoBackend, readStoredRefresh } from './eco-config';

const SESSION_KEY = 'eco.session';

function readSession(): string | null {
  try { return window.localStorage.getItem(SESSION_KEY); } catch { return null; }
}
function writeSession(token: string): void {
  try { window.localStorage.setItem(SESSION_KEY, token); } catch { /* noop */ }
}

// Una sola renovación en vuelo a la vez: si varias requests reciben 401 a la
// vez, todas esperan el mismo POST /auth/session en lugar de mintar N sesiones.
let renewInFlight: Promise<string | null> | null = null;

function renewSession(): Promise<string | null> {
  if (renewInFlight) return renewInFlight;
  renewInFlight = (async () => {
    try {
      const refresh = readStoredRefresh();
      // Sin refresh token no se puede renovar (multi-tenant): caemos a re-login.
      if (!refresh) return null;
      const headers = new Headers();
      const token = ecoToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Eco-Client', '1');
      headers.set('X-Eco-Refresh', refresh);
      const r = await fetch(`${ecoBackend()}/auth/session`, { method: 'POST', headers });
      if (!r.ok) return null;
      const data = await r.json();
      const session = typeof data?.session === 'string' ? data.session : null;
      if (session) writeSession(session);
      return session;
    } catch {
      return null;
    } finally {
      renewInFlight = null;
    }
  })();
  return renewInFlight;
}

// Si el 401 fue por sesión expirada (no por bearer inválido ni PIN incorrecto),
// el backend devuelve code 'auth.session_invalid'. Clonamos para no consumir el
// body que el caller todavía puede leer si no renovamos.
async function isSessionExpired(res: Response): Promise<boolean> {
  try {
    const data = await res.clone().json();
    // errResponse serializa el código en `error` (no `code`).
    return data?.error === 'auth.session_invalid' || data?.code === 'auth.session_invalid';
  } catch {
    return false;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Si pasaron URL absoluta o ya tiene base, dejamos pasar. Sino, prefijamos
  // con BACKEND (vacío en dev → Vite proxy lo maneja; absoluto en Electron).
  const url = /^https?:/i.test(path) ? path : `${ecoBackend()}${path}`;

  const send = async (): Promise<Response> => {
    const headers = new Headers(init.headers);
    // Resolvemos token y backend en cada llamada (no al cargar el módulo) porque
    // en Electron empaquetado los valores se setean tras un IPC asíncrono.
    const token = ecoToken();
    if (!headers.has('Authorization') && token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('X-Eco-Client')) headers.set('X-Eco-Client', '1');
    const session = readSession();
    if (session && !headers.has('X-Eco-Session')) headers.set('X-Eco-Session', session);
    return fetch(url, { ...init, headers });
  };

  try {
    const res = await send();
    // Renovación silenciosa: solo si seguía habiendo una sesión en localStorage
    // (idle, no lock manual — el lock la borra) y el endpoint no es de /auth/*.
    if (
      res.status === 401 &&
      readSession() &&
      !path.startsWith('/auth/') &&
      (await isSessionExpired(res))
    ) {
      const fresh = await renewSession();
      if (fresh) return await send();
    }
    return res;
  } catch (e) {
    // Log que va al main process (vía preload IPC) para diagnosticar el
    // típico "Failed to fetch" sin contexto en la consola.
    const api = (window as unknown as { electronAPI?: { log?: (...a: unknown[]) => void } }).electronAPI;
    api?.log?.('[apiFetch] failed', { url, hasToken: !!ecoToken(), error: (e as Error).message });
    throw e;
  }
}
