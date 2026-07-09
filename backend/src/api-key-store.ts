// Keys de API de los proveedores de agentes, guardadas en ~/.eco (chmod 600).
// `anthropic` alimenta al SDK de Claude y a los spawns `claude -p`; `openai`
// alimenta al PTY donde corre el CLI de Codex (ver pty-server:openaiEnvOverrides).
// Son globales a la máquina, no por usuario — igual que ~/.eco/api-key siempre lo fue.

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type KeyProvider = 'anthropic' | 'openai';

type KeySpec = {
  file: string;
  prefix: RegExp;
  prefixHint: string;
  maskPrefix: string;
  validate: (key: string) => Promise<{ ok: boolean; error?: string }>;
};

const ECO_DIR = join(homedir(), '.eco');

const SPECS: Record<KeyProvider, KeySpec> = {
  anthropic: {
    file: 'api-key',
    prefix: /^sk-ant-/,
    prefixHint: 'sk-ant-',
    maskPrefix: 'sk-ant-…',
    validate: validateAnthropicKey,
  },
  openai: {
    file: 'openai-api-key',
    prefix: /^sk-/,
    prefixHint: 'sk-',
    maskPrefix: 'sk-…',
    validate: validateOpenAiKey,
  },
};

const keyPath = (provider: KeyProvider) => join(ECO_DIR, SPECS[provider].file);

export function readKey(provider: KeyProvider): string | null {
  try {
    const p = keyPath(provider);
    if (!existsSync(p)) return null;
    const v = readFileSync(p, 'utf-8').trim();
    return v || null;
  } catch { return null; }
}

export function writeKey(provider: KeyProvider, key: string): void {
  const spec = SPECS[provider];
  const trimmed = key.trim();
  if (!trimmed) throw new Error('API key vacía');
  if (!spec.prefix.test(trimmed)) {
    throw new Error(`Formato de API key inválido (debe empezar con ${spec.prefixHint})`);
  }
  if (!existsSync(ECO_DIR)) mkdirSync(ECO_DIR, { recursive: true, mode: 0o700 });
  const p = keyPath(provider);
  writeFileSync(p, trimmed, { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch { /* no-op en NTFS */ }
}

export function deleteKey(provider: KeyProvider): void {
  try { unlinkSync(keyPath(provider)); } catch { /* noop */ }
}

export function hasKey(provider: KeyProvider): boolean {
  return existsSync(keyPath(provider));
}

/** Devuelve la key enmascarada para mostrar en UI (los últimos 4 chars). */
export function maskedKey(provider: KeyProvider): string | null {
  const k = readKey(provider);
  if (!k) return null;
  return `${SPECS[provider].maskPrefix}${k.slice(-4)}`;
}

export function validateKey(provider: KeyProvider, key: string): Promise<{ ok: boolean; error?: string }> {
  const spec = SPECS[provider];
  if (!key || !spec.prefix.test(key.trim())) {
    return Promise.resolve({ ok: false, error: `Formato inválido: la key debe empezar con ${spec.prefixHint}` });
  }
  return spec.validate(key.trim());
}

// La validación es deliberadamente laxa: solo un 401/403 rechaza la key. Un 500,
// un timeout o una red caída NO deben impedir guardarla — Eco puede estar offline
// y la key queda lista para cuando vuelva la conexión.
async function validateAnthropicKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Modelo deliberadamente "viejo y estable" — sigue siendo aceptado y
        // existe en cualquier tier de cuenta. Evitamos depender de fechas
        // específicas que pueden retirarse.
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (r.status === 401) return { ok: false, error: 'API key inválida (401)' };
    if (r.status === 403) return { ok: false, error: 'API key sin permisos (403)' };
    // 404/400 = el modelo no está disponible para esa cuenta, pero la key sirve.
    return { ok: true };
  } catch (e) {
    return { ok: true, error: `No se pudo validar (${e instanceof Error ? e.message : 'red'}), pero se guardó` };
  }
}

async function validateOpenAiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${key}` },
    });
    if (r.status === 401) return { ok: false, error: 'API key inválida (401)' };
    if (r.status === 403) return { ok: false, error: 'API key sin permisos (403)' };
    return { ok: true };
  } catch (e) {
    return { ok: true, error: `No se pudo validar (${e instanceof Error ? e.message : 'red'}), pero se guardó` };
  }
}

// Wrappers de compatibilidad: config.ts, claude-auth.ts e index.ts hablan de
// "la" API key sin proveedor porque históricamente solo existía la de Anthropic.
export const readApiKey = () => readKey('anthropic');
export const writeApiKey = (key: string) => writeKey('anthropic', key);
export const deleteApiKey = () => deleteKey('anthropic');
export const hasApiKey = () => hasKey('anthropic');
export const maskedApiKey = () => maskedKey('anthropic');
export const validateApiKey = (key: string) => validateKey('anthropic', key);
