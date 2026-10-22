// Snapshot ligero de las bubbles por usuario. El frontend postea a
// `POST /bubbles/sync` con un resumen de SUS bubbles; el backend lo cachea por
// userId para (a) clientes externos (MCP) y (b) la vista de admin
// (quién-trabaja-en-qué). Cada bubble lleva `ownerId` — fuente de verdad de la
// propiedad, seteado server-side desde la sesión, NUNCA del cliente.
//
// Persistido en ~/.eco/bubbles-index.json (chmod 600) para sobrevivir reinicios.
// El frontend sobreescribe su propia porción al reconectar.

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { firstAdminId } from './users-store.js';

const STORE_PATH = `${homedir()}/.eco/bubbles-index.json`;

export type BubbleSummary = {
  id: string;
  title: string;
  workspace: string;
  status: string;
  archived: boolean;
  updatedAt: number;
  ownerId: string;
  lastMsgPreview?: string;
  categoryIds?: string[];
  baseBranch?: string;
};

export type Category = { id: string; name: string; color: string };

export type BubblesSnapshot = {
  bubbles: BubbleSummary[];
  lastSync: number;
};

type Store = {
  version: 2;
  byUser: Record<string, BubbleSummary[]>;
  lastSync: Record<string, number>;
  // Categorías (id → nombre/color) que el frontend sincroniza junto a las
  // bubbles. Opcional para leer stores viejos sin migración.
  categoriesByUser?: Record<string, Category[]>;
};

// Suscriptores a cada sync: los endpoints MCP que delegan un cambio a la UI
// esperan acá a que el snapshot lo refleje (confirmación real, sin escritura
// optimista que el sync en vuelo pisaría).
type SnapshotListener = (userId: string) => void;
const listeners = new Set<SnapshotListener>();

let cache: Store | null = null;

// Último sync rechazado por usuario (en memoria: un sync exitoso lo borra y un
// reinicio obliga a la UI a re-sincronizar). Sin esto un 400 dejaba el snapshot
// congelado en silencio y el MCP no veía bubbles nuevas.
export type SyncFailure = { at: number; message: string };
const syncFailures = new Map<string, SyncFailure>();

export function noteSyncFailure(userId: string, message: string): void {
  syncFailures.set(userId, { at: Date.now(), message });
}

export function getSyncFailure(userId: string): SyncFailure | null {
  return syncFailures.get(userId) ?? null;
}

function ensureDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function emptyStore(): Store { return { version: 2, byUser: {}, lastSync: {} }; }

function loadFromDisk(): Store {
  if (!existsSync(STORE_PATH)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
    if (parsed?.version === 2 && parsed.byUser) return parsed as Store;
    // Migración del formato viejo { bubbles, lastSync } (sin owner): todo al admin.
    if (parsed && Array.isArray(parsed.bubbles)) {
      const admin = firstAdminId();
      const store = emptyStore();
      if (admin) {
        store.byUser[admin] = parsed.bubbles.map((b: Partial<BubbleSummary>) => ({
          id: String(b.id), title: String(b.title ?? ''), workspace: String(b.workspace ?? ''),
          status: String(b.status ?? 'idle'), archived: !!b.archived,
          updatedAt: Number(b.updatedAt ?? 0), ownerId: admin,
        }));
        store.lastSync[admin] = Number(parsed.lastSync ?? 0);
      }
      return store;
    }
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

function store(): Store {
  if (!cache) cache = loadFromDisk();
  return cache;
}

function persist() {
  try {
    ensureDir();
    writeFileSync(STORE_PATH, JSON.stringify(store()), { mode: 0o600 });
    try { chmodSync(STORE_PATH, 0o600); } catch { /* noop */ }
  } catch { /* best-effort */ }
}

// Devuelve las bubbles que aparecieron por primera vez en este sync (no estaban
// en el snapshot previo del usuario y no llegan archivadas) — base de la bitácora
// de "creación de agente". El primer sync de un usuario con index vacío puede
// reportar las preexistentes una sola vez; aceptable.
export function setBubblesSnapshot(userId: string, bubbles: Omit<BubbleSummary, 'ownerId'>[]): BubbleSummary[] {
  const s = store();
  const prevIds = new Set((s.byUser[userId] ?? []).map((b) => b.id));
  // ownerId SIEMPRE = el usuario de la sesión (ignora cualquier owner del cliente).
  const next = bubbles.map((b) => ({ ...b, ownerId: userId }));
  const added = next.filter((b) => !b.archived && !prevIds.has(b.id));
  s.byUser[userId] = next;
  s.lastSync[userId] = Date.now();
  syncFailures.delete(userId);
  persist();
  for (const fn of listeners) { try { fn(userId); } catch { /* noop */ } }
  return added;
}

export function setCategoriesSnapshot(userId: string, categories: Category[]): void {
  const s = store();
  if (!s.categoriesByUser) s.categoriesByUser = {};
  s.categoriesByUser[userId] = categories;
  persist();
}

export function getCategories(userId: string): Category[] {
  return store().categoriesByUser?.[userId] ?? [];
}

function foldName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export type CategoryResolution =
  | { ok: true; category: Category }
  | { ok: false; code: 'category.not_found' | 'category.ambiguous'; available: string[] };

/** Resuelve una categoría por id exacto o por nombre (sin distinguir mayúsculas ni acentos). */
export function resolveCategory(userId: string, nameOrId: string): CategoryResolution {
  const cats = getCategories(userId);
  const available = cats.map((c) => c.name);
  const byId = cats.find((c) => c.id === nameOrId);
  if (byId) return { ok: true, category: byId };
  const wanted = foldName(nameOrId);
  const matches = cats.filter((c) => foldName(c.name) === wanted);
  if (matches.length === 1) return { ok: true, category: matches[0]! };
  if (matches.length > 1) return { ok: false, code: 'category.ambiguous', available };
  return { ok: false, code: 'category.not_found', available };
}

export function onSnapshotChange(fn: SnapshotListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Espera a que la bubble del usuario cumpla `predicate` (null = ya no está en
 * el snapshot). Chequea de inmediato y luego en cada sync, hasta `timeoutMs`.
 */
export function waitForBubble(
  userId: string,
  bubbleId: string,
  predicate: (bubble: BubbleSummary | null) => boolean,
  timeoutMs: number,
): Promise<{ confirmed: boolean; bubble: BubbleSummary | null }> {
  const current = () => (store().byUser[userId] ?? []).find((b) => b.id === bubbleId) ?? null;
  const now = current();
  if (predicate(now)) return Promise.resolve({ confirmed: true, bubble: now });
  return new Promise((resolve) => {
    let done = false;
    const finish = (confirmed: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve({ confirmed, bubble: current() });
    };
    const unsubscribe = onSnapshotChange((uid) => {
      if (uid !== userId) return;
      if (predicate(current())) finish(true);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export function getBubblesSnapshot(userId: string): BubblesSnapshot {
  const s = store();
  return { bubbles: s.byUser[userId] ?? [], lastSync: s.lastSync[userId] ?? 0 };
}

/** Todas las bubbles de todos los usuarios — solo para la vista de admin. */
export function getAllSnapshots(): { byUser: Record<string, BubbleSummary[]>; lastSync: Record<string, number> } {
  const s = store();
  return { byUser: s.byUser, lastSync: s.lastSync };
}

/**
 * Busca una bubble por id. Mira primero la lista de `preferUser`: el mismo id
 * puede existir bajo un uid legacy (pre-Firebase) y bajo el uid actual, y el
 * primer match global devolvía el dueño viejo → 403 para el dueño real.
 */
export function findBubble(bubbleId: string, preferUser?: string | null): BubbleSummary | null {
  const s = store();
  if (preferUser) {
    const own = s.byUser[preferUser]?.find((b) => b.id === bubbleId);
    if (own) return own;
  }
  for (const list of Object.values(s.byUser)) {
    const found = list.find((b) => b.id === bubbleId);
    if (found) return found;
  }
  return null;
}

/** Dueño de una bubble, o null si no está registrada. */
export function ownerOfBubble(bubbleId: string): string | null {
  return findBubble(bubbleId)?.ownerId ?? null;
}
