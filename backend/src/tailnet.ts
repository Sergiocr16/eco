// Publicación de Eco en la tailnet desde la app de escritorio.
//
// Hasta ahora el acceso remoto era `npm run serve:web`: un SEGUNDO backend en
// :7200 que había que arrancar a mano desde una terminal. Esto lo reemplaza
// para el uso normal — la app publica su propio backend (el mismo que ya sirve
// el frontend estático) en https://<maquina>.ts.net, y el toggle vive en
// Ajustes. Un solo backend, dos entradas: Electron local y la tailnet.
//
// El estado vive en disco porque la decisión tiene que sobrevivir al cierre de
// la app: si quedó activado, al abrir Eco se vuelve a publicar solo.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { servePublic, servePublicOff, tailnetProbe, tailscaleBin } from './tailscale.js';

const CONFIG_PATH = join(homedir(), '.eco', 'tailnet.json');

export type TailnetConfig = { enabled: boolean };

export type TailnetStatus = {
  enabled: boolean;
  /** Hostname público, presente solo cuando la publicación está activa. */
  host?: string;
  url?: string;
  /** true cuando el mapeo de Tailscale está aplicado en esta corrida. */
  active: boolean;
  /** Motivo por el que no pudo activarse (Tailscale apagado, Serve sin permiso…). */
  error?: string;
};

export function readTailnetConfig(): TailnetConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Partial<TailnetConfig>;
      return { enabled: !!raw.enabled };
    }
  } catch { /* noop */ }
  return { enabled: false };
}

export function saveTailnetConfig(cfg: TailnetConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { chmodSync(CONFIG_PATH, 0o600); } catch { /* no-op en NTFS */ }
}

let activeHost: string | null = null;
let lastError: string | undefined;

export function tailnetStatus(): TailnetStatus {
  const { enabled } = readTailnetConfig();
  return {
    enabled,
    active: activeHost !== null,
    ...(activeHost ? { host: activeHost, url: `https://${activeHost}` } : {}),
    ...(lastError ? { error: lastError } : {}),
  };
}

// Abre el acceso remoto: resuelve el nombre de la tailnet, deja que el backend
// acepte ese Host/Origin y publica :443 → puerto local.
//
// Las tres propiedades de `config` se mutan en caliente a propósito: son los
// mismos campos que `ECO_EXTRA_HOSTS`/`ECO_PUBLIC_HOST`/`ECO_ALLOWED_ORIGINS`
// llenan en modo server, y sin tocarlos el backend rechazaría cada request
// remoto por host check antes de mirar el token.
export async function startTailnet(port: number): Promise<TailnetStatus> {
  const { host, detail } = await tailnetProbe();
  if (!host) {
    lastError = detail;
    activeHost = null;
    console.warn(`[tailnet] no se resolvió el nombre de la tailnet — ${detail} (bin: ${tailscaleBin()})`);
    return tailnetStatus();
  }
  console.log(`[tailnet] host resuelto: ${host} — publicando :443 -> ${port}`);

  if (!config.extraHosts.includes(host)) config.extraHosts.push(host);
  const origin = `https://${host}`;
  if (!config.allowedOrigins.includes(origin)) config.allowedOrigins.push(origin);
  // Con publicHost seteado, dev-server.ts arma las URLs de preview con el
  // nombre público y expone cada puerto por Tailscale (urlFor/syncServe).
  config.publicHost = host;

  lastError = undefined;
  activeHost = host;
  servePublic(port, (detail) => { lastError = detail; });
  return tailnetStatus();
}

// Cierra el acceso remoto. Deja de aceptar el host público y quita el mapeo.
// Los puertos de dev servers los limpia dev-server.ts por su cuenta al parar
// cada sesión; acá solo soltamos el :443, que es lo que abrimos nosotros.
export function stopTailnet(): void {
  if (activeHost) {
    config.extraHosts = config.extraHosts.filter((h) => h !== activeHost);
    config.allowedOrigins = config.allowedOrigins.filter((o) => o !== `https://${activeHost}`);
  }
  config.publicHost = undefined;
  activeHost = null;
  lastError = undefined;
  servePublicOff();
}

// Llamado al arrancar el backend. Si el toggle quedó activado en la corrida
// anterior, se republica sin intervención del usuario.
export async function restoreTailnet(port: number): Promise<void> {
  if (!readTailnetConfig().enabled) return;
  const st = await startTailnet(port);
  if (st.active) console.log(`[tailnet] Eco publicado en ${st.url}`);
  else console.warn(`[tailnet] no se pudo publicar: ${st.error ?? 'desconocido'}`);
}
