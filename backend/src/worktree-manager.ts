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

const WORKTREES_ROOT = join(homedir(), '.eco', 'worktrees');

// Map en memoria: bubbleId → path absoluto del worktree (si existe).
const worktrees = new Map<string, string>();

function runGit(args: string[], cwd: string, timeoutMs = 8_000): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, timeout: timeoutMs, encoding: 'utf-8' });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? '').toString(),
    stderr: (r.stderr ?? '').toString(),
  };
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
export function ensureWorktree(bubbleId: string, parentWorkspace: string): string {
  if (!bubbleId || !parentWorkspace) return parentWorkspace;
  if (!isAllowedWorkspace(parentWorkspace)) return parentWorkspace;

  // Cache hit
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

  // Crear worktree + rama nueva desde HEAD del repo padre.
  let result = runGit(['worktree', 'add', '-b', branch, target], parentWorkspace);
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
 * Borra el worktree de una burbuja. El branch se preserva (puede tener trabajo
 * útil). Devuelve true si se borró algo.
 */
export function removeWorktree(bubbleId: string): boolean {
  const path = worktrees.get(bubbleId);
  if (!path) return false;
  worktrees.delete(bubbleId);
  if (!existsSync(path)) return true;
  // Necesitamos el repo padre para correr `worktree remove`. Lo descubrimos
  // preguntando al propio worktree por su `common dir`.
  const common = runGit(['rev-parse', '--git-common-dir'], path, 3_000);
  if (!common.ok) return false;
  const repoDir = common.stdout.trim().replace(/\.git\/?$/, '').replace(/\.git$/, '');
  const r = runGit(['worktree', 'remove', path, '--force'], repoDir);
  return r.ok;
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
