import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const TOKEN_PATH = `${homedir()}/.eco/token`;

export function getOrCreateToken(): string {
  if (existsSync(TOKEN_PATH)) {
    const mode = statSync(TOKEN_PATH).mode & 0o777;
    if (mode !== 0o600) chmodSync(TOKEN_PATH, 0o600);
    const value = readFileSync(TOKEN_PATH, 'utf-8').trim();
    if (value.length >= 32) return value;
  }
  const dir = dirname(TOKEN_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString('base64url');
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  chmodSync(TOKEN_PATH, 0o600);
  return token;
}

export function tokensMatch(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}
