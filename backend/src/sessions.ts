import { randomBytes } from 'node:crypto';
import type { Role } from './users-store.js';

type Session = {
  id: string;
  userId: string;
  username: string;
  role: Role;
  createdAt: number;
  lastUsed: number;
};

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hora desde último uso
const sessions = new Map<string, Session>();

export function createSession(userId: string, role: Role, username: string): string {
  const id = randomBytes(32).toString('base64url');
  const now = Date.now();
  sessions.set(id, { id, userId, role, username, createdAt: now, lastUsed: now });
  return id;
}

export function getSession(id: string | null | undefined): Session | null {
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.lastUsed > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  s.lastUsed = Date.now();
  return s;
}

export function destroySession(id: string | null | undefined): void {
  if (!id) return;
  sessions.delete(id);
}

export function clearAllSessions(): void {
  sessions.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000).unref();
