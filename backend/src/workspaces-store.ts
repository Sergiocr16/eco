import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const STORE_PATH = `${homedir()}/.eco/workspaces.json`;

const BLOCKED_HOSTS = new Set([
  '/', '/bin', '/boot', '/dev', '/etc', '/lib', '/lib32', '/lib64',
  '/libx32', '/proc', '/root', '/run', '/sbin', '/srv', '/sys',
  '/usr', '/var', '/private', '/System', '/Library', '/Applications',
]);

export type WorkspaceValidation =
  | { ok: true; path: string }
  | { ok: false; error: string; errorCode: string };

function fail(errorCode: string, error: string): WorkspaceValidation {
  return { ok: false, error, errorCode };
}

export function validateWorkspacePath(input: string): WorkspaceValidation {
  if (!input || typeof input !== 'string') return fail('wsp.path_empty', 'Ruta vacía');
  const trimmed = input.trim();
  if (!trimmed) return fail('wsp.path_empty', 'Ruta vacía');
  if (!isAbsolute(trimmed)) return fail('wsp.path_not_absolute', 'La ruta debe ser absoluta');
  if (trimmed.length > 4096) return fail('wsp.path_too_long', 'Ruta demasiado larga');
  if (trimmed.includes('\0')) return fail('wsp.path_invalid_char', 'Carácter inválido');

  let real: string;
  try {
    real = realpathSync(resolve(trimmed));
  } catch {
    return fail('wsp.path_not_found', 'La carpeta no existe en el sistema');
  }

  let stat;
  try { stat = statSync(real); } catch { return fail('wsp.path_not_readable', 'No se puede leer la carpeta'); }
  if (!stat.isDirectory()) return fail('wsp.path_not_dir', 'No es una carpeta');

  if (BLOCKED_HOSTS.has(real)) return fail('wsp.path_system', 'Ruta del sistema no permitida');
  for (const blocked of BLOCKED_HOSTS) {
    if (real === blocked || real.startsWith(blocked + sep)) {
      return fail('wsp.path_inside_system', `Ruta dentro de ${blocked} no permitida`);
    }
  }
  return { ok: true, path: real };
}

function ensureDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function readStore(): string[] {
  if (!existsSync(STORE_PATH)) return [];
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string').slice(0, 32);
  } catch {
    return [];
  }
}

function writeStore(paths: string[]) {
  ensureDir();
  const unique = Array.from(new Set(paths)).slice(0, 32);
  writeFileSync(STORE_PATH, JSON.stringify(unique, null, 2), { mode: 0o600 });
  try { chmodSync(STORE_PATH, 0o600); } catch { /* noop */ }
}

export function addWorkspace(input: string): WorkspaceValidation {
  const v = validateWorkspacePath(input);
  if (!v.ok) return v;
  const current = readStore();
  if (current.includes(v.path)) return { ok: true, path: v.path };
  writeStore([...current, v.path]);
  return v;
}

export function removeWorkspace(path: string): { ok: boolean } {
  const real = (() => { try { return realpathSync(resolve(path)); } catch { return path; } })();
  const current = readStore();
  const next = current.filter((p) => p !== real && p !== path);
  if (next.length !== current.length) writeStore(next);
  return { ok: true };
}
