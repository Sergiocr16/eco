// Snapshot ligero de las bubbles que mantiene el frontend (autoridad). El
// frontend postea a `POST /bubbles/sync` con un resumen cada vez que cambia
// el estado relevante; el backend lo cachea para que clientes externos
// (MCP server stdio) puedan listar bubbles sin tener acceso a localStorage.
//
// Vida útil:
//  - El cache vive en memoria mientras el backend corre.
//  - Snapshot a `~/.eco/bubbles-index.json` (chmod 600) para sobrevivir
//    reinicios del backend (dev con `tsx watch` reinicia muy seguido).
//
// El snapshot NO es la fuente de verdad — el frontend siempre lo sobreescribe
// al reconectar.

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const STORE_PATH = `${homedir()}/.eco/bubbles-index.json`;

export type BubbleSummary = {
  id: string;
  title: string;
  workspace: string;
  status: string;
  archived: boolean;
  updatedAt: number;
};

export type BubblesSnapshot = {
  bubbles: BubbleSummary[];
  lastSync: number;
};

let cache: BubblesSnapshot | null = null;

function ensureDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function loadFromDisk(): BubblesSnapshot | null {
  if (!existsSync(STORE_PATH)) return null;
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.bubbles)) return null;
    return parsed as BubblesSnapshot;
  } catch {
    return null;
  }
}

export function setBubblesSnapshot(bubbles: BubbleSummary[]): void {
  const snap: BubblesSnapshot = { bubbles, lastSync: Date.now() };
  cache = snap;
  try {
    ensureDir();
    writeFileSync(STORE_PATH, JSON.stringify(snap), { mode: 0o600 });
    try { chmodSync(STORE_PATH, 0o600); } catch { /* noop */ }
  } catch { /* persistencia best-effort */ }
}

export function getBubblesSnapshot(): BubblesSnapshot {
  if (cache) return cache;
  const loaded = loadFromDisk();
  if (loaded) { cache = loaded; return loaded; }
  return { bubbles: [], lastSync: 0 };
}

export function findBubble(bubbleId: string): BubbleSummary | null {
  return getBubblesSnapshot().bubbles.find((b) => b.id === bubbleId) ?? null;
}
