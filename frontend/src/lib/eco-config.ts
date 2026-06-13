// Config global resuelta UNA VEZ al boot (ver main.tsx → bootstrap()).
// En Electron viene del preload (token leído de ~/.eco/token + backend URL
// del main process); en web puro de las env vars de Vite.

let backend = '';
let token = '';
let platform = ''; // 'darwin' | 'win32' | 'linux' | '' (web)

export function setEcoConfig(cfg: { backend: string; token: string; platform?: string }) {
  backend = cfg.backend;
  token = cfg.token;
  if (cfg.platform) platform = cfg.platform;
}

export function ecoBackend(): string { return backend; }
export function ecoToken(): string { return token; }
export function ecoPlatform(): string { return platform; }

// Token persistido para modo web servido por el backend (server mode vía
// Tailscale): el browser remoto no tiene VITE_ECO_TOKEN ni IPC de Electron,
// así que el user lo pega una vez en la pantalla "Conectar al servidor" y
// queda en localStorage. main.tsx lo usa como fallback en el bootstrap.
const STORED_TOKEN_KEY = 'eco.token';

export function readStoredToken(): string | null {
  try { return window.localStorage.getItem(STORED_TOKEN_KEY); } catch { return null; }
}

export function writeStoredToken(value: string | null): void {
  try {
    if (value) window.localStorage.setItem(STORED_TOKEN_KEY, value);
    else window.localStorage.removeItem(STORED_TOKEN_KEY);
  } catch { /* noop */ }
}
