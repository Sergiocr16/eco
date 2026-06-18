// "Usuario de máquina": en el modelo local single-user, el backend sirve a UNA
// persona (la logueada en esta máquina). Recordamos su uid de Firebase para que
// los procesos sin sesión interactiva (MCP server, spawns) tengan un dueño —
// reemplaza el viejo `firstAdminId()`. Se persiste best-effort a disco para
// sobrevivir reinicios del backend.

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const PATH = `${homedir()}/.eco/machine-user`;

let cached: string | null = null;

function loadFromDisk(): string | null {
  try {
    if (!existsSync(PATH)) return null;
    const v = readFileSync(PATH, 'utf-8').trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** uid del usuario de esta máquina (último login Firebase), o null. */
export function getMachineUser(): string | null {
  if (cached) return cached;
  cached = loadFromDisk();
  return cached;
}

/** Registra el uid del usuario logueado. Idempotente; persiste si cambió. */
export function setMachineUser(uid: string): void {
  if (!uid || uid === cached) return;
  cached = uid;
  try {
    const dir = dirname(PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(PATH, uid, { mode: 0o600 });
    chmodSync(PATH, 0o600);
  } catch {
    /* best-effort */
  }
}
