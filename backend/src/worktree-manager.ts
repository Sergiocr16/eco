// Aislamiento por burbuja vía git worktrees.
//
// Cada burbuja con un workspace que sea repo git obtiene su propio worktree en
// `~/.eco/worktrees/<bubbleId>` sobre la rama `eco/<shortId>` derivada del HEAD
// del repo padre. El agente y el PTY operan dentro del worktree, así que dos
// burbujas tocando el mismo repo nunca se pisan.
//
// La rama queda viva al cerrar la burbuja (cleanup borra el worktree pero
// preserva la rama para que el usuario pueda mergear o revisar después). Las
// referencias en disco se pueden recolectar manualmente con `git worktree prune`.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isAllowedWorkspace } from './config.js';
import { githubEnvOverrides } from './github-runtime.js';

const WORKTREES_ROOT = join(homedir(), '.eco', 'worktrees');

// Map en memoria: bubbleId → path absoluto del worktree (si existe).
const worktrees = new Map<string, string>();

function runGit(
  args: string[],
  cwd: string,
  timeoutMs = 8_000,
  env?: NodeJS.ProcessEnv,
): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, timeout: timeoutMs, encoding: 'utf-8', ...(env ? { env } : {}) });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? '').toString(),
    stderr: (r.stderr ?? '').toString(),
  };
}

// Trae lo último del remoto para la rama base y devuelve el ref remote-tracking
// (`<remote>/<base>`) desde el cual basar el worktree, así arranca actualizado.
// Devuelve null si no hay remoto, no hay token/credenciales para HTTPS privado,
// o el fetch falla — en ese caso el caller usa la rama local tal cual.
//
// No mutamos la rama local del repo padre (no hacemos checkout ni reset). Solo
// actualizamos el remote-tracking y basamos la rama nueva del worktree en él.
function fetchUpdatedBaseRef(parentWorkspace: string, baseName: string): string | null {
  const remoteRes = runGit(['remote'], parentWorkspace, 3_000);
  if (!remoteRes.ok) return null;
  const remotes = remoteRes.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  // Preferimos 'origin' si existe; sino el primero.
  const remote = remotes.includes('origin') ? 'origin' : remotes[0];
  if (!remote) return null;

  // Env para el fetch: identidad/token de GitHub de Eco + credential helper
  // inline que lee $GH_TOKEN (para remotos HTTPS privados). GIT_TERMINAL_PROMPT=0
  // hace que git falle en vez de colgarse pidiendo user/pass.
  const overrides = githubEnvOverrides();
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides, GIT_TERMINAL_PROMPT: '0' };
  const credArgs = overrides.GH_TOKEN
    ? ['-c', 'credential.helper=!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f']
    : [];

  const fetchRes = runGit([...credArgs, 'fetch', remote, baseName], parentWorkspace, 25_000, env);
  if (!fetchRes.ok) {
    console.warn(`[worktree] fetch de ${remote}/${baseName} falló, uso base local:`, fetchRes.stderr.slice(0, 200));
    return null;
  }
  const remoteRef = `${remote}/${baseName}`;
  const verify = runGit(['rev-parse', '--verify', '--quiet', remoteRef], parentWorkspace, 3_000);
  if (!verify.ok || !verify.stdout.trim()) return null;

  // ¿Existe la rama base local? Si no, basamos directo desde el remoto.
  const localVerify = runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${baseName}`], parentWorkspace, 3_000);
  if (!localVerify.ok || !localVerify.stdout.trim()) return remoteRef;

  // La rama local existe: solo usamos el remoto si la local está DETRÁS
  // (es ancestro del remoto). Si tiene commits locales sin pushear, la local
  // no es ancestro → la respetamos para no perder trabajo (mejor que un pull
  // que mergearía o fallaría).
  const isAncestor = runGit(['merge-base', '--is-ancestor', baseName, remoteRef], parentWorkspace, 5_000);
  return isAncestor.ok ? remoteRef : null;
}

function isGitRepo(dir: string): boolean {
  if (!existsSync(dir)) return false;
  const r = runGit(['rev-parse', '--is-inside-work-tree'], dir, 3_000);
  return r.ok && r.stdout.trim() === 'true';
}

function shortId(bubbleId: string): string {
  // Conservamos solo alfanuméricos para la rama y limitamos a 12 chars.
  return bubbleId.replace(/[^a-zA-Z0-9]/g, '').slice(-12) || 'b';
}

function ensureRoot() {
  if (!existsSync(WORKTREES_ROOT)) {
    mkdirSync(WORKTREES_ROOT, { recursive: true, mode: 0o700 });
  }
}

/**
 * Asegura que exista un worktree para la burbuja. Retorna el path absoluto
 * a usar como cwd. Si el workspace no es repo git, devuelve el workspace
 * tal cual (sin aislamiento).
 */
export function ensureWorktree(
  bubbleId: string,
  parentWorkspace: string,
  baseBranch?: string,
): string {
  if (!bubbleId || !parentWorkspace) return parentWorkspace;
  if (!isAllowedWorkspace(parentWorkspace)) return parentWorkspace;

  // Cache hit — si el worktree ya existe, ignoramos baseBranch (se decidió
  // al crearlo y no podemos cambiar el punto de partida sin destruirlo).
  const cached = worktrees.get(bubbleId);
  if (cached && existsSync(cached)) return cached;

  if (!isGitRepo(parentWorkspace)) return parentWorkspace;

  ensureRoot();
  const target = join(WORKTREES_ROOT, bubbleId);
  const branch = `eco/${shortId(bubbleId)}`;

  // Si el directorio target ya existe (por restart anterior), intentamos reusarlo
  // sin crear una rama nueva.
  if (existsSync(target)) {
    worktrees.set(bubbleId, target);
    return target;
  }

  // Limpiamos worktrees huérfanos en el repo padre antes de crear uno nuevo.
  runGit(['worktree', 'prune'], parentWorkspace, 3_000);

  // Validamos baseBranch contra inyección: solo permitimos chars típicos de
  // nombres de rama git. Cualquier cosa rara → fallback a HEAD.
  const safeBase = baseBranch && /^[a-zA-Z0-9._\-/]+$/.test(baseBranch)
    ? baseBranch
    : null;

  // Determinamos el nombre de la rama base para actualizar desde el remoto.
  // Si vino baseBranch explícito, ese; sino la rama actual del repo padre
  // (salvo que esté en detached HEAD → no actualizamos, usamos HEAD).
  let baseName = safeBase;
  if (!baseName) {
    const cur = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], parentWorkspace, 3_000);
    const name = cur.ok ? cur.stdout.trim() : '';
    if (name && name !== 'HEAD') baseName = name;
  }

  // Pull de la rama base antes de crear el worktree: traemos lo último del
  // remoto y basamos la rama nueva en `<remote>/<base>` para que arranque
  // actualizada. Si no hay remoto o el fetch falla, caemos a la base local.
  const startPoint = baseName ? (fetchUpdatedBaseRef(parentWorkspace, baseName) ?? safeBase) : safeBase;

  // Crear worktree + rama nueva. Si hay start point válido, partimos de ahí;
  // sino, del HEAD del repo padre (comportamiento legacy).
  const addArgs = startPoint
    ? ['worktree', 'add', '-b', branch, target, startPoint]
    : ['worktree', 'add', '-b', branch, target];
  let result = runGit(addArgs, parentWorkspace);
  if (!result.ok) {
    // La rama ya puede existir (e.g., re-crear burbuja con mismo id).
    // Intentamos checkout sin -b.
    if (/already exists|already used/.test(result.stderr)) {
      result = runGit(['worktree', 'add', target, branch], parentWorkspace);
    }
  }
  if (!result.ok) {
    // Si falla todo, fallback al workspace original (sin aislamiento).
    console.error('[worktree] no se pudo crear worktree:', result.stderr.slice(0, 300));
    return parentWorkspace;
  }

  worktrees.set(bubbleId, target);
  return target;
}

/**
 * Borra el worktree de una burbuja Y la rama `eco/<id>` asociada. La rama
 * también se elimina con `-D` (force) para que no aparezca en `git branch`
 * ni en `git fetch` de otros agentes apuntando al mismo repo. Si querés
 * conservar la rama, hacele merge/push antes de cerrar la burbuja.
 */
export function removeWorktree(bubbleId: string): boolean {
  const path = worktrees.get(bubbleId);
  if (!path) return false;
  worktrees.delete(bubbleId);
  // Calcular el nombre de la rama que creamos al spawnear el worktree.
  const branch = `eco/${shortId(bubbleId)}`;
  if (!existsSync(path)) {
    // El worktree dir ya no está pero la rama puede seguir viva si el user
    // borró el dir manualmente. Intentamos limpiar la rama de todos modos.
    tryDeleteBranchFromAnyRepo(branch);
    return true;
  }
  // Necesitamos el repo padre para correr `worktree remove`. Lo descubrimos
  // preguntando al propio worktree por su `common dir`.
  const common = runGit(['rev-parse', '--git-common-dir'], path, 3_000);
  if (!common.ok) return false;
  const repoDir = common.stdout.trim().replace(/\.git\/?$/, '').replace(/\.git$/, '');
  const r = runGit(['worktree', 'remove', path, '--force'], repoDir);
  if (!r.ok) return false;
  // `git worktree remove` no borra la rama — la mata acá explícitamente.
  runGit(['branch', '-D', branch], repoDir, 3_000);
  return true;
}

// Helper: intenta borrar una rama eco/<id> sin saber el repo padre. Usado
// cuando el worktree dir ya no existe (caso edge: user lo eliminó a mano).
function tryDeleteBranchFromAnyRepo(branch: string): void {
  // Sin worktree dir no tenemos el repo padre fácil. Recorremos los
  // workspaces conocidos (todos los worktrees vivos) buscando el repo
  // common-dir y intentando el delete ahí.
  for (const [, p] of worktrees) {
    const common = runGit(['rev-parse', '--git-common-dir'], p, 3_000);
    if (!common.ok) continue;
    const repoDir = common.stdout.trim().replace(/\.git\/?$/, '').replace(/\.git$/, '');
    const r = runGit(['branch', '-D', branch], repoDir, 3_000);
    if (r.ok) return;
  }
}

/** Retorna el worktree de una burbuja si existe. */
export function getWorktree(bubbleId: string): string | null {
  const path = worktrees.get(bubbleId);
  if (path && existsSync(path)) return path;
  return null;
}

/** Retorna [bubbleId, path] para enumeración (snapshots, etc.). */
export function listWorktrees(): Array<{ bubbleId: string; path: string }> {
  return [...worktrees.entries()].map(([bubbleId, path]) => ({ bubbleId, path }));
}

/**
 * Barre `~/.eco/worktrees/` y borra todos los worktrees "limpios":
 *  - El path no existe / no es repo git válido → rm -rf.
 *  - O no tiene archivos modificados/untracked AND no tiene commits ahead del upstream.
 * Llamado al arrancar Eco, periódicamente, y al cerrar.
 */
export function pruneCleanWorktrees(): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];
  if (!existsSync(WORKTREES_ROOT)) return { removed, kept };

  let entries: string[] = [];
  try { entries = readdirSync(WORKTREES_ROOT); } catch { return { removed, kept }; }

  // Limpiamos referencias administrativas huérfanas en todos los repos
  // conocidos. Esto borra el record interno de git para worktrees cuyos
  // directorios físicos ya no existen — sin esto, `git worktree add` falla
  // con "already used by worktree at" aunque el path no exista.
  const seenParents = new Set<string>();
  for (const name of entries) {
    const p = join(WORKTREES_ROOT, name);
    const common = runGit(['rev-parse', '--git-common-dir'], p, 2000);
    if (common.ok && common.stdout.trim()) {
      const parent = common.stdout.trim().replace(/\/?\.git\/?$/, '');
      if (parent && existsSync(parent) && !seenParents.has(parent)) {
        seenParents.add(parent);
        runGit(['worktree', 'prune'], parent, 5000);
      }
    }
  }

  for (const name of entries) {
    const path = join(WORKTREES_ROOT, name);
    try {
      const st = statSync(path);
      if (!st.isDirectory()) continue;
    } catch { continue; }

    // 1) Si el path no es un repo git válido (huérfano), lo borramos.
    if (!isGitRepo(path)) {
      try {
        rmSync(path, { recursive: true, force: true });
        worktrees.delete(name);
        removed.push(name);
      } catch { kept.push(name); }
      continue;
    }

    // 2) ¿Tiene cambios o untracked?
    const status = runGit(['status', '--porcelain'], path, 5000);
    if (!status.ok) { kept.push(name); continue; }
    if (status.stdout.trim().length > 0) { kept.push(name); continue; }

    // 3) ¿Tiene commits ahead del upstream o de la rama base?
    // Probamos varios upstreams en orden. Si ninguno es comparable, asumimos limpio.
    let hasCommits = false;
    const compareRefs = ['@{upstream}', 'origin/HEAD', 'origin/main', 'origin/master'];
    for (const ref of compareRefs) {
      const ahead = runGit(['rev-list', '--count', `${ref}..HEAD`], path, 5000);
      if (ahead.ok && ahead.stdout.trim() && ahead.stdout.trim() !== '0') {
        hasCommits = true; break;
      }
      // Si el ref no existe, probamos el siguiente. Si todos fallan: dejamos hasCommits=false.
    }
    if (hasCommits) { kept.push(name); continue; }

    // 4) Worktree limpio → intentamos `git worktree remove --force` desde el repo padre.
    let removedOk = false;
    const commonDir = runGit(['rev-parse', '--git-common-dir'], path, 3000);
    if (commonDir.ok && commonDir.stdout.trim()) {
      const absCommon = commonDir.stdout.trim();
      const parent = absCommon.replace(/\/?\.git\/?$/, '');
      if (parent && existsSync(parent)) {
        const r = runGit(['worktree', 'remove', path, '--force'], parent, 5000);
        if (r.ok) removedOk = true;
      }
    }
    // Fallback: si el `worktree remove` falla, borramos el dir nomás.
    if (!removedOk) {
      try { rmSync(path, { recursive: true, force: true }); removedOk = true; } catch { /* noop */ }
    }
    if (removedOk) {
      worktrees.delete(name);
      removed.push(name);
    } else {
      kept.push(name);
    }
  }

  return { removed, kept };
}
