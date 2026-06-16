// Cliente de sync cross-device. Firestore es la AUTORIDAD del estado del usuario
// (bubbles+mensajes, categorías, notas, review, prefs). Antes esto pegaba al
// doc-store en disco del backend (~/.eco/users/<id>/docs) por HTTP+WS; ahora
// habla directo con Firestore (client SDK + Security Rules).
//
// Mantiene la MISMA API que consumían los hooks (hydrateDocs/saveDoc/deleteDoc/
// shouldApplyRemote/markSeen) + el evento eco-bus 'eco:doc_updated' — por eso
// useBubbles/useCategories/useReviewState/NotesPanel/prefs-sync no cambian.
//
// La "key" del doc-store (bubble:<id>, categories, notes:<id>, review:<id>,
// prefs) se mapea a (colección, docId) en Firestore. Cada doc guarda
// { ownerId, key, value, updatedAt } (ownerId lo exigen las Rules).

import {
  collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc as fbDeleteDoc,
  onSnapshot, type DocumentData,
} from 'firebase/firestore';
import { getDb, getEcoAuth } from './firebase';
import { apiFetch } from './api';
import { emit as ecoEmit } from './eco-bus';

export type SyncDoc = { value: unknown; updatedAt: number };

// updatedAt del último valor que NOSOTROS escribimos/aplicamos por key — para
// ignorar el echo de onSnapshot de la propia escritura.
const lastSeen = new Map<string, number>();

function uid(): string | null {
  try { return getEcoAuth().currentUser?.uid ?? null; } catch { return null; }
}

// Colecciones por usuario (1 doc por usuario): la key es fija.
const PER_USER = new Set(['prefs', 'categories']);

function locate(key: string, u: string): { col: string; id: string } | null {
  if (key === 'prefs') return { col: 'prefs', id: u };
  if (key === 'categories') return { col: 'categories', id: u };
  if (key.startsWith('bubble:')) return { col: 'bubbles', id: key.slice('bubble:'.length) };
  if (key.startsWith('notes:')) return { col: 'notes', id: key.slice('notes:'.length) };
  if (key.startsWith('review:')) return { col: 'review', id: key.slice('review:'.length) };
  return null;
}

function readStored(d: DocumentData | undefined, fallbackKey: string): { key: string; doc: SyncDoc } | null {
  if (!d || typeof d.updatedAt !== 'number') return null;
  return { key: typeof d.key === 'string' ? d.key : fallbackKey, doc: { value: d.value, updatedAt: d.updatedAt } };
}

// ── Migración one-time: sube el doc-store en disco (GET /user/docs) a Firestore.
// Idempotente y memoizada por uid. Preserva lo que el usuario ya tenía.
const migrated = new Map<string, Promise<void>>();
function ensureMigrated(u: string): Promise<void> {
  const flag = `eco.fsmigrated.${u}`;
  let p = migrated.get(u);
  if (p) return p;
  p = (async () => {
    try {
      if (window.localStorage.getItem(flag)) return;
      const r = await apiFetch('/user/docs');
      if (r.ok) {
        const data = await r.json().catch(() => null) as { docs?: Record<string, SyncDoc> } | null;
        const docs = data?.docs ?? {};
        for (const [key, v] of Object.entries(docs)) {
          const loc = locate(key, u);
          if (!loc || !v || typeof v.updatedAt !== 'number') continue;
          const ref = doc(getDb(), loc.col, loc.id);
          const existing = await getDoc(ref);
          if (!existing.exists()) {
            await setDoc(ref, { ownerId: u, key, value: v.value ?? null, updatedAt: v.updatedAt });
          }
        }
      }
      window.localStorage.setItem(flag, '1');
    } catch { /* best-effort: si falla, se reintenta en el próximo hydrate */ }
  })();
  migrated.set(u, p);
  return p;
}

export async function hydrateDocs(): Promise<Record<string, SyncDoc>> {
  const u = uid();
  if (!u) return {};
  await ensureMigrated(u);
  const db = getDb();
  const out: Record<string, SyncDoc> = {};
  try {
    // Colecciones con N docs por usuario: filtradas por ownerId.
    for (const col of ['bubbles', 'notes', 'review']) {
      const snap = await getDocs(query(collection(db, col), where('ownerId', '==', u)));
      snap.forEach((d) => {
        const r = readStored(d.data(), d.id);
        if (r) out[r.key] = r.doc;
      });
    }
    // Docs únicos por usuario (id == uid).
    for (const key of PER_USER) {
      const d = await getDoc(doc(db, key, u));
      const r = readStored(d.data(), key);
      if (r) out[key] = r.doc;
    }
  } catch { /* best-effort */ }
  for (const [k, v] of Object.entries(out)) lastSeen.set(k, v.updatedAt);
  return out;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function saveDoc(key: string, value: unknown, debounceMs = 600): void {
  const t = pending.get(key);
  if (t) clearTimeout(t);
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    const u = uid();
    if (!u) return;
    const loc = locate(key, u);
    if (!loc) return;
    const updatedAt = Date.now();
    lastSeen.set(key, updatedAt);
    void setDoc(doc(getDb(), loc.col, loc.id), { ownerId: u, key, value, updatedAt })
      .catch(() => { /* best-effort */ });
  }, debounceMs));
}

export function deleteDoc(key: string): void {
  const t = pending.get(key);
  if (t) { clearTimeout(t); pending.delete(key); }
  lastSeen.delete(key);
  const u = uid();
  if (!u) return;
  const loc = locate(key, u);
  if (!loc) return;
  void fbDeleteDoc(doc(getDb(), loc.col, loc.id)).catch(() => { /* best-effort */ });
}

/** ¿Aplicar un cambio remoto? false si es el echo de lo que ya escribimos. */
export function shouldApplyRemote(key: string, updatedAt: number): boolean {
  const mine = lastSeen.get(key) ?? 0;
  if (updatedAt <= mine) return false;
  lastSeen.set(key, updatedAt);
  return true;
}

/** Marca que aplicamos un valor (al hidratar) para no re-subirlo. */
export function markSeen(key: string, updatedAt: number): void {
  lastSeen.set(key, updatedAt);
}

// ── Listeners en vivo (reemplazan el push WS doc_updated/doc_deleted). Emiten
// los mismos eventos eco-bus que ya escuchan los hooks. Filtran el echo propio
// vía shouldApplyRemote. Devuelve un unsubscribe.
export function startUserDocListeners(u: string): () => void {
  const db = getDb();
  const unsubs: Array<() => void> = [];

  const onColSnapshot = (col: string) => onSnapshot(
    query(collection(db, col), where('ownerId', '==', u)),
    (snap) => {
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const key = typeof data.key === 'string' ? data.key : `${col === 'bubbles' ? 'bubble' : col === 'notes' ? 'notes' : 'review'}:${ch.doc.id}`;
        if (ch.type === 'removed') {
          ecoEmit('eco:doc_deleted', { key });
          return;
        }
        if (typeof data.updatedAt !== 'number') return;
        if (!shouldApplyRemote(key, data.updatedAt)) return;
        ecoEmit('eco:doc_updated', { key, value: data.value, updatedAt: data.updatedAt });
      });
    },
    () => { /* sin acceso/red: ignorar */ },
  );

  unsubs.push(onColSnapshot('bubbles'), onColSnapshot('notes'), onColSnapshot('review'));

  for (const key of PER_USER) {
    unsubs.push(onSnapshot(doc(db, key, u), (d) => {
      const data = d.data();
      if (!data || typeof data.updatedAt !== 'number') return;
      if (!shouldApplyRemote(key, data.updatedAt)) return;
      ecoEmit('eco:doc_updated', { key, value: data.value, updatedAt: data.updatedAt });
    }, () => { /* noop */ }));
  }

  return () => { for (const u of unsubs) { try { u(); } catch { /* noop */ } } };
}
