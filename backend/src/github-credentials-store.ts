// Credenciales de GitHub configuradas por el user en Settings. Cuando
// existen, Eco las usa con prioridad sobre `gh auth login` / `git config`
// global del sistema. Si no existen, se hace fallback al CLI normal.
//
// Storage: ~/.eco/github.json con chmod 600 (mismo patrón que api-key-store).

import { existsSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { userFilePath, firstAdminId } from './users-store.js';

export type GithubCredentials = {
  username: string;
  email: string;
  pat: string;
  validatedAt: number;
};

// Multi-tenant: las credenciales viven en ~/.eco/users/<userId>/github.json.
// `userId` undefined → cae al primer admin (back-compat para procesos sin
// sesión todavía, p.ej. spawns de WS antes del tagging por usuario).
function resolveUserId(userId?: string): string | null {
  return userId ?? firstAdminId();
}
function filePathFor(userId?: string): string | null {
  const id = resolveUserId(userId);
  if (!id) return null;
  try { return userFilePath(id, 'github.json'); } catch { return null; }
}

export function hasGithubCredentials(userId?: string): boolean {
  const p = filePathFor(userId);
  return !!p && existsSync(p);
}

export function readGithubCredentials(userId?: string): GithubCredentials | null {
  try {
    const p = filePathFor(userId);
    if (!p || !existsSync(p)) return null;
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<GithubCredentials>;
    if (typeof parsed.username !== 'string' || !parsed.username) return null;
    if (typeof parsed.email !== 'string' || !parsed.email) return null;
    if (typeof parsed.pat !== 'string' || !parsed.pat) return null;
    const validatedAt = typeof parsed.validatedAt === 'number' ? parsed.validatedAt : 0;
    return { username: parsed.username, email: parsed.email, pat: parsed.pat, validatedAt };
  } catch { return null; }
}

export function writeGithubCredentials(userId: string, c: GithubCredentials): void {
  if (!c.username || !c.email || !c.pat) throw new Error('Credenciales incompletas');
  const p = userFilePath(userId, 'github.json');
  writeFileSync(p, JSON.stringify(c, null, 2), { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch { /* noop */ }
}

export function deleteGithubCredentials(userId: string): void {
  const p = filePathFor(userId);
  if (p) { try { unlinkSync(p); } catch { /* noop */ } }
}

/** Devuelve el PAT enmascarado para mostrar en UI. */
export function maskedPat(userId?: string): string | null {
  const c = readGithubCredentials(userId);
  if (!c) return null;
  const tail = c.pat.slice(-4);
  // PATs modernos pueden empezar con ghp_, github_pat_, gho_, ghu_, ghs_, ghr_.
  // Mostramos el prefijo si lo reconocemos para que el user pueda identificarlo.
  const m = /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/.exec(c.pat);
  const prefix = m ? m[1]! : '';
  return `${prefix}…${tail}`;
}

export type ValidateResult =
  | { ok: true; login: string; email: string | null; name: string | null }
  | { ok: false; error: string; status?: number };

// Valida el PAT haciendo GET https://api.github.com/user. Si 200, devuelve
// los datos del user asociado al token. Si 401/403, el token es inválido o
// no tiene permisos. Cualquier otro error se reporta como red.
export async function validateGithubPat(pat: string): Promise<ValidateResult> {
  const trimmed = pat.trim();
  if (!trimmed) return { ok: false, error: 'Token vacío' };
  // Sanity check de formato — los PATs modernos empiezan con ghp_, github_pat_,
  // gho_, ghu_, ghs_, ghr_. Permitimos cualquier prefijo igual por si GitHub
  // introduce uno nuevo, pero si claramente no tiene formato, fallamos rápido.
  if (trimmed.length < 20) {
    return { ok: false, error: 'Formato de token inválido' };
  }
  try {
    const r = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${trimmed}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Eco/0.1',
      },
    });
    if (r.status === 200) {
      const data = await r.json().catch(() => null) as {
        login?: string; email?: string | null; name?: string | null;
      } | null;
      if (!data || typeof data.login !== 'string' || !data.login) {
        return { ok: false, error: 'Respuesta inesperada de GitHub', status: 200 };
      }
      return {
        ok: true,
        login: data.login,
        email: (typeof data.email === 'string' && data.email) ? data.email : null,
        name: (typeof data.name === 'string' && data.name) ? data.name : null,
      };
    }
    if (r.status === 401) return { ok: false, error: 'Token inválido o expirado', status: 401 };
    if (r.status === 403) return { ok: false, error: 'Token sin permisos suficientes', status: 403 };
    return { ok: false, error: `Error GitHub (HTTP ${r.status})`, status: r.status };
  } catch (e) {
    return { ok: false, error: `No se pudo conectar a GitHub: ${e instanceof Error ? e.message : 'red'}` };
  }
}
