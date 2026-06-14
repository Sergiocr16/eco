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
};

export type BubblesSnapshot = {
  bubbles: BubbleSummary[];
  lastSync: number;
};

type Store = {
  version: 2;
  byUser: Record<string, BubbleSummary[]>;
  lastSync: Record<string, number>;
};

let cache: Store | null = null;

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
  persist();
  return added;
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

/** Busca una bubble por id en TODOS los usuarios (devuelve con ownerId). */
export function findBubble(bubbleId: string): BubbleSummary | null {
  const s = store();
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
