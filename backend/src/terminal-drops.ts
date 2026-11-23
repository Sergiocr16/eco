// Archivos soltados sobre la terminal desde un cliente remoto (navegador por la
// tailnet). Ese cliente no tiene una ruta en ESTE host que pegarle al CLI, así
// que el archivo se sube, se guarda acá y la terminal recibe esta ruta.
// En Electron no pasa por acá: el renderer pega la ruta local directo.

import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const DROP_MAX_BYTES = 25 * 1024 * 1024;
const DROPS_DIR = join(homedir(), '.eco', 'drops');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Solo [A-Za-z0-9._-]: la ruta termina tipeada en un PTY, sin espacios ni
// metacaracteres que haya que escapar. La extensión se conserva porque el CLI
// la usa para reconocer imágenes.
function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  return (cleaned || 'archivo').slice(-80);
}

function pruneOld(): void {
  const now = Date.now();
  let entries: string[];
  try { entries = readdirSync(DROPS_DIR); } catch { return; }
  for (const name of entries) {
    const p = join(DROPS_DIR, name);
    try {
      if (now - statSync(p).mtimeMs > MAX_AGE_MS) unlinkSync(p);
    } catch { /* otro proceso lo borró o no es legible: se ignora */ }
  }
}

export function saveDroppedFile(rawName: string, data: Buffer): string {
  mkdirSync(DROPS_DIR, { recursive: true });
  pruneOld();
  const file = join(DROPS_DIR, `${randomBytes(4).toString('hex')}-${safeName(rawName)}`);
  writeFileSync(file, data);
  try { chmodSync(file, 0o600); } catch { /* no-op en NTFS */ }
  return file;
}
