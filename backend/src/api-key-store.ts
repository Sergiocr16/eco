import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const KEY_PATH = `${homedir()}/.eco/api-key`;

export function readApiKey(): string | null {
  try {
    if (!existsSync(KEY_PATH)) return null;
    const v = readFileSync(KEY_PATH, 'utf-8').trim();
    return v || null;
  } catch { return null; }
}

export function writeApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) throw new Error('API key vacía');
  if (!/^sk-ant-/.test(trimmed)) throw new Error('Formato de API key inválido (debe empezar con sk-ant-)');
  const dir = dirname(KEY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(KEY_PATH, trimmed, { mode: 0o600 });
  try { chmodSync(KEY_PATH, 0o600); } catch { /* noop */ }
}

export function deleteApiKey(): void {
  try { unlinkSync(KEY_PATH); } catch { /* noop */ }
}

export function hasApiKey(): boolean {
  return existsSync(KEY_PATH);
}

/** Devuelve la key enmascarada para mostrar en UI (los últimos 4 chars). */
export function maskedApiKey(): string | null {
  const k = readApiKey();
  if (!k) return null;
  const tail = k.slice(-4);
  return `sk-ant-…${tail}`;
}

export async function validateApiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, error: 'API key inválida' };
    if (r.status === 403) return { ok: false, error: 'API key sin permisos' };
    if (r.status === 429) return { ok: true, error: 'Rate limit (key OK pero muchas requests)' };
    return { ok: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}
