// Store de documentos JSON por usuario — la AUTORIDAD del estado cross-device
// (bubbles+mensajes, categorías, notas, review, prefs/tema). Cada "store" del
// frontend es un doc clave→valor en ~/.eco/users/<userId>/docs/<key>.json
// (chmod 600). El frontend hidrata al loguear (listDocs), guarda al cambiar
// (writeDoc, debounced) y recibe push por WS a sus otros dispositivos.
//
// LWW por documento: cada doc lleva `updatedAt`; un PUT más viejo que el
// guardado se ignora (evita que un dispositivo desactualizado pise lo nuevo).

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { userFilePath } from './users-store.js';

export type Doc = { value: unknown; updatedAt: number };

// Las keys vienen del frontend (p.ej. "bubble:b_123", "categories", "notes:b_9",
// "prefs"). El ':' no es válido en nombres de archivo seguros → lo mapeamos a
// '__'. Solo permitimos un set acotado de caracteres.
function safeKey(key: string): string | null {
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key.replace(/:/g, '__');
}

function docsDir(userId: string): string {
  // userFilePath valida el userId + crea la carpeta del usuario.
  return userFilePath(userId, 'docs');
}
function docPath(userId: string, key: string): string | null {
  const safe = safeKey(key);
  if (!safe) return null;
  const dir = docsDir(userId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, `${safe}.json`);
}

// El archivo guarda { key, value, updatedAt } (key original para reconstruir el
// map en listDocs sin tener que des-mapear el nombre de archivo).
type StoredDoc = { key: string; value: unknown; updatedAt: number };

export function readDoc(userId: string, key: string): Doc | null {
  const p = docPath(userId, key);
  if (!p || !existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<StoredDoc>;
    if (typeof parsed.updatedAt !== 'number') return null;
    return { value: parsed.value, updatedAt: parsed.updatedAt };
  } catch { return null; }
}

/** Escribe el doc con LWW. Devuelve { applied, updatedAt }: applied=false si el
 *  entrante era más viejo (no se escribió). */
export function writeDoc(userId: string, key: string, value: unknown, updatedAt: number): { applied: boolean; updatedAt: number } {
  const p = docPath(userId, key);
  if (!p) return { applied: false, updatedAt: 0 };
  const existing = readDoc(userId, key);
  if (existing && existing.updatedAt > updatedAt) {
    return { applied: false, updatedAt: existing.updatedAt };
  }
  const doc: StoredDoc = { key, value, updatedAt };
  writeFileSync(p, JSON.stringify(doc), { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch { /* noop */ }
  return { applied: true, updatedAt };
}

export function deleteDoc(userId: string, key: string): void {
  const p = docPath(userId, key);
  if (p) { try { rmSync(p, { force: true }); } catch { /* noop */ } }
}

/** Todos los docs del usuario, key→{value,updatedAt} — para hidratar al loguear. */
export function listDocs(userId: string): Record<string, Doc> {
  const out: Record<string, Doc> = {};
  let dir: string;
  try { dir = docsDir(userId); } catch { return out; }
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Partial<StoredDoc>;
      if (typeof parsed.key === 'string' && typeof parsed.updatedAt === 'number') {
        out[parsed.key] = { value: parsed.value, updatedAt: parsed.updatedAt };
      }
    } catch { /* skip corrupto */ }
  }
  return out;
}
