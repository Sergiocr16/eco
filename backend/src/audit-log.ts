// Bitácora append-only de eventos de sesión y agentes (quién hizo qué, en qué
// workspace, cuándo) — para la consola de admin. Se escribe en
// ~/.eco/audit-log.jsonl (una línea JSON por evento, chmod 600).
//
// best-effort: logEvent NUNCA debe romper el flujo de un endpoint. El actor
// SIEMPRE sale de la sesión (req.ecoUser) en el call site, nunca del cliente.
// Seguridad: NO escribir PINs, claim/refresh tokens ni texto de mensajes en meta.

import { existsSync, appendFileSync, readFileSync, renameSync, statSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const LOG_PATH = `${homedir()}/.eco/audit-log.jsonl`;
const ROTATED_PATH = `${homedir()}/.eco/audit-log.1.jsonl`;
const AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export type AuditEventType =
  | 'auth.login' | 'auth.claim' | 'auth.logout'
  | 'bubble.create' | 'bubble.archive' | 'bubble.delete';

export const AUDIT_EVENT_TYPES: AuditEventType[] = [
  'auth.login', 'auth.claim', 'auth.logout',
  'bubble.create', 'bubble.archive', 'bubble.delete',
];

export type AuditEvent = {
  ts: number;
  actorId: string | null;
  actorName: string | null;
  type: AuditEventType;
  workspace?: string;
  bubbleId?: string;
  meta?: Record<string, string | number | boolean>;
};

function ensureDir() {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

// Rotación de una sola generación: al pasar el cap, el actual se mueve a .1.jsonl
// (descarta cualquier .1 previo). Sin historia infinita.
function rotateIfNeeded() {
  try {
    if (!existsSync(LOG_PATH)) return;
    if (statSync(LOG_PATH).size < AUDIT_MAX_BYTES) return;
    renameSync(LOG_PATH, ROTATED_PATH);
  } catch { /* best-effort */ }
}

export function logEvent(e: Omit<AuditEvent, 'ts'>): void {
  try {
    ensureDir();
    rotateIfNeeded();
    const event: AuditEvent = { ts: Date.now(), ...e };
    appendFileSync(LOG_PATH, JSON.stringify(event) + '\n', { mode: 0o600 });
    try { chmodSync(LOG_PATH, 0o600); } catch { /* noop */ }
  } catch { /* best-effort: nunca romper el endpoint */ }
}

function readEvents(path: string): AuditEvent[] {
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l) as AuditEvent; } catch { return null; } })
      .filter((e): e is AuditEvent => !!e && typeof e.ts === 'number');
  } catch {
    return [];
  }
}

export function queryEvents(opts: {
  userId?: string;
  type?: AuditEventType;
  since?: number;
  limit?: number;
} = {}): AuditEvent[] {
  const all = [...readEvents(LOG_PATH), ...readEvents(ROTATED_PATH)];
  const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT, MAX_LIMIT);
  return all
    .filter((e) => (opts.userId ? e.actorId === opts.userId : true))
    .filter((e) => (opts.type ? e.type === opts.type : true))
    .filter((e) => (opts.since ? e.ts >= opts.since : true))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}
