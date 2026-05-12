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
