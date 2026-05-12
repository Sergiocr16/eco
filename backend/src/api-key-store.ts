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
  // Sanity check de formato — las keys de Anthropic empiezan con sk-ant-.
  if (!key || !key.trim().startsWith('sk-ant-')) {
    return { ok: false, error: 'Formato inválido: la key debe empezar con sk-ant-' };
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key.trim(),
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
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, error: 'API key inválida (401)' };
    if (r.status === 403) return { ok: false, error: 'API key sin permisos (403)' };
    if (r.status === 429) return { ok: true }; // rate-limited pero key OK
    if (r.status === 404 || r.status === 400) {
      // Modelo no disponible para esa cuenta — la key probablemente es OK
      // pero su tier no soporta ese modelo. Aceptamos sin error.
      return { ok: true };
    }
    // Cualquier otro código (500, timeout, etc.) → no podemos confirmar.
    // Asumimos OK y dejamos que el agente la use; si Anthropic la rechaza
    // después, el error será claro en uso real.
    return { ok: true };
  } catch (e) {
    // Error de red — no podemos validar. Aceptamos la key igual.
    // Si Eco está offline en este momento la guardamos local y queda lista
    // para cuando vuelva la conexión.
    return { ok: true, error: `No se pudo validar (${e instanceof Error ? e.message : 'red'}), pero se guardó` };
  }
}
