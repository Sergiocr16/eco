// Tema activo del CLI de Claude Code (`/theme`), para que la terminal de Eco
// pinte el fondo que ese tema espera. El CLI no manda OSC 10/11 ni pinta el
// fondo: asume que el host terminal ya es oscuro o claro según su tema.
//
// Fuente: `$CLAUDE_CONFIG_DIR/settings.json` → `theme`. Valores built-in
// (`dark`, `light`, `light-daltonized`, `dark-ansi`, …) o `custom:<plugin>:<id>`
// / `custom:<id>`, cuyo JSON (`themes/<id>.json`) trae `base: dark|light` y
// opcionalmente `overrides.background`.

import { existsSync, mkdirSync, readFileSync, readdirSync, watchFile, unwatchFile, writeFileSync } from 'node:fs';
import { CLAUDE_THEMES } from './claude-themes-data.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { broadcastServerMessage, registerSnapshotProvider } from './ws-server.js';
import type { ServerMessage } from './protocol.js';

export type ClaudeTheme = { id: string; base: 'dark' | 'light'; background: string | null };

const POLL_MS = 2000;
const DEFAULT: ClaudeTheme = { id: 'dark', base: 'dark', background: null };

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude');
}

function settingsPath(): string {
  return join(configDir(), 'settings.json');
}

function readJson(p: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>; } catch { return null; }
}

function hexOrRgb(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s);
  if (!m) return null;
  const hex = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

// `custom:theme-gallery:driftwood` → themes/driftwood.json en el config dir
// (ahí los deja el plugin) o en el marketplace/caché del plugin.
function customThemeFiles(plugin: string | null, id: string): string[] {
  const dir = configDir();
  const out = [join(dir, 'themes', `${id}.json`)];
  if (!plugin) return out;
  const mk = join(dir, 'plugins', 'marketplaces');
  try {
    for (const m of readdirSync(mk)) out.push(join(mk, m, 'plugins', plugin, 'themes', `${id}.json`));
  } catch { /* sin marketplaces */ }
  const cache = join(dir, 'plugins', 'cache');
  try {
    for (const m of readdirSync(cache)) {
      const pdir = join(cache, m, plugin);
      try {
        for (const v of readdirSync(pdir)) out.push(join(pdir, v, 'themes', `${id}.json`));
      } catch { /* noop */ }
    }
  } catch { /* sin caché */ }
  return out;
}

export function readClaudeTheme(): ClaudeTheme {
  const settings = readJson(settingsPath());
  const raw = typeof settings?.theme === 'string' ? settings.theme.trim() : '';
  if (!raw) return DEFAULT;
  if (!raw.startsWith('custom:')) {
    return { id: raw, base: raw.startsWith('light') ? 'light' : 'dark', background: null };
  }
  const parts = raw.split(':').filter(Boolean);
  const id = parts[parts.length - 1] ?? '';
  const plugin = parts.length >= 3 ? parts[1] : null;
  for (const f of customThemeFiles(plugin, id)) {
    if (!existsSync(f)) continue;
    const def = readJson(f);
    if (!def) continue;
    const base = def.base === 'light' ? 'light' : 'dark';
    const overrides = (def.overrides ?? {}) as Record<string, unknown>;
    return { id: raw, base, background: hexOrRgb(overrides.background) };
  }
  return { id: raw, base: 'dark', background: null };
}

let current: ClaudeTheme = readClaudeTheme();
let watching = false;

function toMessage(t: ClaudeTheme): ServerMessage {
  return { type: 'claude_theme', theme: t };
}

// watchFile (stat polling) y no fs.watch: el CLI reescribe settings.json
// con rename, que fs.watch pierde en macOS, y 2 s de latencia es aceptable.
export function startClaudeThemeWatch(): void {
  if (watching) return;
  watching = true;
  registerSnapshotProvider(() => [toMessage(current)]);
  const p = settingsPath();
  watchFile(p, { interval: POLL_MS }, () => {
    const next = readClaudeTheme();
    if (next.id === current.id && next.base === current.base && next.background === current.background) return;
    current = next;
    console.log(`[claude-theme] ${next.id} (${next.base})`);
    broadcastServerMessage(toMessage(next));
  });
}

export function stopClaudeThemeWatch(): void {
  if (!watching) return;
  watching = false;
  try { unwatchFile(settingsPath()); } catch { /* noop */ }
}

export function currentClaudeTheme(): ClaudeTheme {
  current = readClaudeTheme();
  return current;
}

// Instala en `<config>/themes/<id>.json` la copia embebida si el usuario no
// tiene ese tema (ni suyo ni del plugin). Nunca pisa un archivo existente.
function ensureThemeInstalled(id: string): boolean {
  const dir = configDir();
  const target = join(dir, 'themes', `${id}.json`);
  if (existsSync(target)) return true;
  const def = CLAUDE_THEMES[id];
  if (!def) return false;
  try {
    mkdirSync(join(dir, 'themes'), { recursive: true });
    writeFileSync(target, JSON.stringify({ name: def.name, base: def.base, overrides: def.overrides }, null, 2) + '\n', 'utf8');
    console.log(`[claude-theme] instalado ${id} en ${target}`);
    return true;
  } catch (e) {
    console.warn('[claude-theme] no se pudo instalar', id, e);
    return false;
  }
}

// Escribe `theme` en settings.json preservando el resto. `id` es el nombre
// corto de la galería (`driftwood`): `custom:<id>` si está (o se acaba de
// instalar desde la copia embebida) en el config dir, `custom:theme-gallery:<id>`
// si solo lo tiene el plugin, o el built-in `fallback` si no existe.
export function applyClaudeTheme(id: string, fallback: 'dark' | 'light'): ClaudeTheme {
  let value: string = fallback;
  if (ensureThemeInstalled(id)) value = `custom:${id}`;
  else if (customThemeFiles('theme-gallery', id).some((f) => existsSync(f))) value = `custom:theme-gallery:${id}`;
  const p = settingsPath();
  const settings = readJson(p) ?? {};
  if (settings.theme !== value) {
    settings.theme = value;
    writeFileSync(p, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
  const next = readClaudeTheme();
  const changed = next.id !== current.id || next.base !== current.base || next.background !== current.background;
  current = next;
  if (changed) broadcastServerMessage(toMessage(next));
  return next;
}
