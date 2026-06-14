// Hook para el modo de review estilo Cursor: trackea qué archivos del
// worktree de un bubble el user ya aprobó visualmente.
//
// Sin persistencia compleja: un Set<string> de paths aceptados, persistido
// por bubble en localStorage. Al commitear con CommitWithAI se llama
// `clearAll()` porque todo lo commiteado pasa a aceptado implícito.
//
// Store global (singleton) con subscribers — múltiples consumers en
// distintas partes del UI (FilesPanel, DiffViewer, banner del sidebar)
// ven el mismo estado y se re-renderizan cuando cambia.

import { useEffect, useState } from 'react';
import { saveDoc, shouldApplyRemote, type SyncDoc } from '@/lib/user-sync';
import { on as ecoOn } from '@/lib/eco-bus';

const STORAGE_KEY = (bubbleId: string) => `eco.review.accepted.${bubbleId}`;
const DOC_KEY = (bubbleId: string) => `review:${bubbleId}`;

// Guardamos timestamp del accept (en lugar de `true` boolean) para que el
// FilesPanel pueda detectar si una nueva edición del agente sucedió DESPUÉS
// del último accept — si sí, el archivo vuelve a estar pendiente.
type AcceptedMap = Record<string, number>;
const store = new Map<string, AcceptedMap>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch { /* noop */ }
  }
}

function load(bubbleId: string): AcceptedMap {
  if (store.has(bubbleId)) return store.get(bubbleId)!;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(bubbleId));
    if (!raw) {
      store.set(bubbleId, {});
      return store.get(bubbleId)!;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Migración: el formato viejo guardaba `true` boolean. Lo convertimos
      // a Date.now() — asumimos "aceptado ahora", así que cualquier edición
      // FUTURA del agente lo invalida correctamente. Las ediciones que ya
      // existen en `bubble.messages` tienen createdAt < ahora, así que no
      // se desmarcan (el user las aceptó a propósito).
      const map: AcceptedMap = {};
      const now = Date.now();
      let migrated = false;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number') map[k] = v;
        else if (v === true) { map[k] = now; migrated = true; }
      }
      store.set(bubbleId, map);
      if (migrated) {
        try { window.localStorage.setItem(STORAGE_KEY(bubbleId), JSON.stringify(map)); } catch { /* noop */ }
      }
      return store.get(bubbleId)!;
    }
  } catch { /* noop */ }
  store.set(bubbleId, {});
  return store.get(bubbleId)!;
}

function persist(bubbleId: string) {
  const map = store.get(bubbleId) ?? {};
  try {
    window.localStorage.setItem(STORAGE_KEY(bubbleId), JSON.stringify(map));
  } catch { /* noop */ }
  saveDoc(DOC_KEY(bubbleId), map); // sync cross-device
}

/** Hidratación al loguear: siembra el store desde los docs `review:*`. */
export function hydrateReviewAll(docs: Record<string, SyncDoc>): void {
  for (const [key, doc] of Object.entries(docs)) {
    if (!key.startsWith('review:')) continue;
    const bubbleId = key.slice('review:'.length);
    if (doc.value && typeof doc.value === 'object' && !Array.isArray(doc.value)) {
      const map: AcceptedMap = {};
      for (const [k, v] of Object.entries(doc.value as Record<string, unknown>)) {
        if (typeof v === 'number') map[k] = v;
      }
      store.set(bubbleId, map);
    }
  }
  notify();
}

// Push en vivo de otros dispositivos del usuario.
ecoOn('eco:doc_updated', ({ key, value, updatedAt }) => {
  if (!key.startsWith('review:')) return;
  if (!shouldApplyRemote(key, updatedAt)) return;
  const bubbleId = key.slice('review:'.length);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const map: AcceptedMap = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'number') map[k] = v;
    }
    store.set(bubbleId, map);
    notify();
  }
});

export type ReviewState = {
  /** ¿El archivo está marcado como aceptado por el user? */
  isAccepted: (path: string) => boolean;
  /** Timestamp del último accept (0 si no aceptado, o si migrado de versión vieja). */
  acceptedAt: (path: string) => number;
  /** Marca un archivo como aceptado con timestamp actual. */
  accept: (path: string) => void;
  /** Quita la marca de aceptado de un archivo. */
  unaccept: (path: string) => void;
  /** Marca múltiples archivos como aceptados (botón "Aceptar todo"). */
  acceptAll: (paths: string[]) => void;
  /** Limpia todo el state (típicamente tras un commit exitoso). */
  clearAll: () => void;
  /** Conteo derivado: archivos en `filesChanged` que NO están aceptados. */
  pendingCount: (filesChanged: { path: string }[]) => number;
};

export function useReviewState(bubbleId: string | undefined): ReviewState {
  // Tick para re-render cuando el store cambia.
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  }, []);

  const key = bubbleId ?? '';
  // Si no hay bubbleId, todas las funciones son no-op y nada está aceptado.
  if (!bubbleId) {
    return {
      isAccepted: () => false,
      acceptedAt: () => 0,
      accept: () => { /* noop */ },
      unaccept: () => { /* noop */ },
      acceptAll: () => { /* noop */ },
      clearAll: () => { /* noop */ },
      pendingCount: (fc) => fc.length,
    };
  }

  return {
    isAccepted: (path) => !!load(key)[path],
    acceptedAt: (path) => load(key)[path] ?? 0,
    accept: (path) => {
      const map = load(key);
      const now = Date.now();
      if (map[path] === now) return;
      map[path] = now;
      persist(key);
      notify();
    },
    unaccept: (path) => {
      const map = load(key);
      if (!map[path]) return;
      delete map[path];
      persist(key);
      notify();
    },
    acceptAll: (paths) => {
      const map = load(key);
      const now = Date.now();
      let changed = false;
      for (const p of paths) {
        if (!map[p]) { map[p] = now; changed = true; }
      }
      if (changed) { persist(key); notify(); }
    },
    clearAll: () => {
      store.set(key, {});
      persist(key);
      notify();
    },
    pendingCount: (filesChanged) => {
      const map = load(key);
      let n = 0;
      for (const f of filesChanged) if (!map[f.path]) n += 1;
      return n;
    },
  };
}

/** Modo de review global. Lee el setting `eco.agent.review_mode` de
 * localStorage. Default OFF — opt-in explícito. */
export function isReviewModeEnabled(): boolean {
  try { return window.localStorage.getItem('eco.agent.review_mode') === '1'; }
  catch { return false; }
}
