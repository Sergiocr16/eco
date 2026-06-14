// Cliente de sync cross-device: el servidor (~/.eco/users/<id>/docs) es la
// autoridad del estado del usuario (bubbles, categorías, notas, review, prefs).
// - hydrateDocs(): GET /user/docs al loguear.
// - saveDoc(key, value): PUT debounced; el backend lo empuja a los otros
//   dispositivos del usuario por WS.
// - deleteDoc(key): DELETE.
// - shouldApplyRemote(key, updatedAt): filtra el eco de la propia escritura.
//
// Los stores del frontend (useBubbles, useCategories, etc.) usan esto + escuchan
// los eventos eco-bus 'eco:doc_updated' / 'eco:doc_deleted' (los reemite
// useEcoSocket desde el WS).

import { apiFetch } from './api';

export type SyncDoc = { value: unknown; updatedAt: number };

// updatedAt del último valor que NOSOTROS mandamos/aplicamos por key — para
// ignorar el eco que el backend re-empuja de nuestra propia escritura.
const lastSeen = new Map<string, number>();

export async function hydrateDocs(): Promise<Record<string, SyncDoc>> {
  try {
    const r = await apiFetch('/user/docs');
    if (!r.ok) return {};
    const d = await r.json().catch(() => null) as { docs?: Record<string, SyncDoc> } | null;
    const docs = d?.docs ?? {};
    for (const [k, v] of Object.entries(docs)) {
      if (v && typeof v.updatedAt === 'number') lastSeen.set(k, v.updatedAt);
    }
    return docs;
  } catch { return {}; }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function saveDoc(key: string, value: unknown, debounceMs = 600): void {
  const t = pending.get(key);
  if (t) clearTimeout(t);
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    const updatedAt = Date.now();
    lastSeen.set(key, updatedAt);
    void apiFetch('/user/doc', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, updatedAt }),
    }).catch(() => { /* best-effort */ });
  }, debounceMs));
}

export function deleteDoc(key: string): void {
  const t = pending.get(key);
  if (t) { clearTimeout(t); pending.delete(key); }
  lastSeen.delete(key);
  void apiFetch('/user/doc', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).catch(() => { /* best-effort */ });
}

/** ¿Aplicar un doc_updated remoto? false si es el eco de lo que ya mandamos. */
export function shouldApplyRemote(key: string, updatedAt: number): boolean {
  const mine = lastSeen.get(key) ?? 0;
  if (updatedAt <= mine) return false;
  lastSeen.set(key, updatedAt);
  return true;
}

/** Marca que aplicamos un valor (p.ej. al hidratar) para no re-subirlo. */
export function markSeen(key: string, updatedAt: number): void {
  lastSeen.set(key, updatedAt);
}
