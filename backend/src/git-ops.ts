// Operaciones git sobre el worktree de cada burbuja: listar branches, cambiar
// de rama, pull, fetch. Pensado para usarse desde el frontend tipo GitHub app.

import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve as pathResolve, sep as pathSep } from 'node:path';
import { buildSafeEnv } from './security.js';
import { config } from './config.js';

const GIT_TIMEOUT = 10_000;

export type BranchInfo = {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  // tracking remote info si existe
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: {
    sha: string;
    subject: string;
    author: string;
    relTime: string;
  };
};

export type BranchListResult = {
  current: string | null;
  detached: boolean;
  branches: BranchInfo[];
  worktree: string;
};

function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('git', args, {
    cwd,
    timeout: GIT_TIMEOUT,
    encoding: 'utf-8',
    env: buildSafeEnv({ GIT_TERMINAL_PROMPT: '0' }),
  });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? '').toString(),
    stderr: (r.stderr ?? '').toString(),
  };
}

function isRepo(dir: string): boolean {
  if (!existsSync(dir)) return false;
  const r = git(['rev-parse', '--is-inside-work-tree'], dir);
  return r.ok && r.stdout.trim() === 'true';
}

function currentBranch(dir: string): { branch: string | null; detached: boolean } {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], dir);
  if (r.ok && r.stdout.trim()) return { branch: r.stdout.trim(), detached: false };
  // Detached HEAD — capturamos el SHA corto.
  const sha = git(['rev-parse', '--short', 'HEAD'], dir);
  return { branch: sha.ok ? sha.stdout.trim() : null, detached: true };
}

export function listBranches(workspace: string): BranchListResult {
  const empty: BranchListResult = { current: null, detached: false, branches: [], worktree: workspace };
  if (!isRepo(workspace)) return empty;
  const { branch: cur, detached } = currentBranch(workspace);

  // for-each-ref con un formato controlado. Separador NUL para evitar problemas
  // con espacios/caracteres en commit subjects.
  const SEP = '\x1f';
  const fmt = ['%(refname:short)', '%(refname)', '%(upstream:short)',
    '%(upstream:track,nobracket)', '%(objectname:short)', '%(authorname)',
    '%(committerdate:relative)', '%(contents:subject)'].join(SEP);

  // Listamos locales + remotos pero excluimos HEAD aliases de remotos.
  const r = git([
    'for-each-ref',
    '--sort=-committerdate',
    '--format=' + fmt,
    'refs/heads',
    'refs/remotes',
  ], workspace);

  const branches: BranchInfo[] = [];
  if (r.ok) {
    for (const line of r.stdout.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split(SEP);
      const name = parts[0] ?? '';
      const refname = parts[1] ?? '';
      const upstream = parts[2] ?? '';
      const track = parts[3] ?? '';
      const sha = parts[4] ?? '';
      const author = parts[5] ?? '';
      const relTime = parts[6] ?? '';
      const subject = parts[7] ?? '';
      if (!name) continue;
      if (name.endsWith('/HEAD')) continue;
      const isRemote = refname.startsWith('refs/remotes/');
      // Parse "ahead N, behind M" o variantes.
      let ahead: number | undefined;
      let behind: number | undefined;
      const aheadM = /ahead (\d+)/.exec(track);
      const behindM = /behind (\d+)/.exec(track);
      if (aheadM) ahead = Number(aheadM[1]);
      if (behindM) behind = Number(behindM[1]);
      branches.push({
        name,
        isCurrent: !detached && name === cur,
        isRemote,
        ...(upstream ? { upstream } : {}),
        ...(ahead !== undefined ? { ahead } : {}),
        ...(behind !== undefined ? { behind } : {}),
        lastCommit: sha ? { sha, subject, author, relTime } : undefined,
      });
    }
  }

  return { current: cur, detached, branches, worktree: workspace };
}

export type GitActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string; files?: string[] };

// Modos para resolver el conflicto cuando hay cambios sin commitear y el
// checkout fallaría:
//  - 'plain'   → comportamiento default (puede fallar con "would be overwritten").
//  - 'carry'   → stash → checkout → stash pop (lleva los cambios a la nueva rama).
//  - 'discard' → checkout --force (descarta los cambios locales sin commitear).
export type CheckoutMode = 'plain' | 'carry' | 'discard';

function listDirtyFiles(workspace: string): string[] {
  const r = git(['status', '--porcelain'], workspace);
  if (!r.ok) return [];
  return r.stdout.split('\n').map((l) => l.slice(3).trim()).filter(Boolean).slice(0, 50);
}

export function checkoutBranch(
  workspace: string,
  branch: string,
  create = false,
  mode: CheckoutMode = 'plain',
): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!branch || /[\s'"`;|&$<>()\\]/.test(branch)) return { ok: false, error: 'Nombre de rama inválido' };

  // Si pedimos checkout de un branch remoto sin crear local, hacemos `checkout -t`
  // que crea un local trackeando el remoto.
  const isRemoteRef = branch.includes('/') && !create;
  const baseArgs = create
    ? ['checkout', '-b', branch]
    : isRemoteRef
      ? ['checkout', '-t', branch]
      : ['checkout', branch];

  // Discard: fuerza el checkout descartando los cambios locales.
  if (mode === 'discard') {
    const forceArgs = create
      ? ['checkout', '-b', branch, '--force']
      : isRemoteRef
        ? ['checkout', '-t', branch, '--force']
        : ['checkout', '-f', branch];
    const r = git(forceArgs, workspace);
    if (!r.ok) {
      const msg = (r.stderr || r.stdout).trim() || 'checkout falló';
      return { ok: false, error: msg.slice(0, 600) };
    }
    return { ok: true, message: r.stdout.trim() || `Cambiado a «${branch}» (cambios descartados)` };
  }

  // Carry: stash con untracked → checkout → stash pop. Si pop tiene conflictos
  // los dejamos para que el user los resuelva manualmente.
  if (mode === 'carry') {
    const stashLabel = `eco:branch-switch:${Date.now()}`;
    const s = git(['stash', 'push', '-u', '-m', stashLabel], workspace);
    if (!s.ok) {
      return { ok: false, error: (s.stderr || s.stdout).trim().slice(0, 600) || 'stash falló' };
    }
    const hadStash = s.stdout.includes('Saved working directory');
    const co = git(baseArgs, workspace);
    if (!co.ok) {
      // Si falló el checkout, intentamos restaurar el stash y devolver error.
      if (hadStash) git(['stash', 'pop'], workspace);
      return { ok: false, error: (co.stderr || co.stdout).trim().slice(0, 600) || 'checkout falló' };
    }
    if (hadStash) {
      const pop = git(['stash', 'pop'], workspace);
      if (!pop.ok) {
        // Conflictos al popear: cambio de rama OK pero hay merge conflicts.
        return {
          ok: true,
          message: `Cambiado a «${branch}». Conflictos al traer cambios — resolvelos manualmente (git stash list).`,
        };
      }
      return { ok: true, message: `Cambiado a «${branch}» con tus cambios traídos.` };
    }
    return { ok: true, message: co.stdout.trim() || `Cambiado a «${branch}»` };
  }

  // Modo default: intentamos checkout normal. Si falla con "would be
  // overwritten by checkout" devolvemos un código especial para que el frontend
  // pueda preguntar qué hacer.
  let r = git(baseArgs, workspace);
  if (!r.ok) {
    const stderr = (r.stderr || r.stdout) || '';
    // Caso típico: la rama está checked-out por OTRO worktree de Eco huérfano
    // (~/.eco/worktrees/<bubble>). Buscamos ese worktree, lo removemos a la
    // fuerza, y reintentamos el checkout. Solo limpiamos worktrees nuestros
    // — nunca tocamos worktrees del user fuera de ~/.eco/.
    const conflictMatch = stderr.match(/already used by worktree at '([^']+)'/);
    if (conflictMatch && conflictMatch[1]) {
      const conflictingPath = conflictMatch[1];
      const ecoRoot = `${homedir()}/.eco/worktrees`;
      if (conflictingPath === ecoRoot || conflictingPath.startsWith(ecoRoot + '/')) {
        console.log('[git-ops] auto-removiendo worktree huérfano de Eco:', conflictingPath);
        git(['worktree', 'remove', conflictingPath, '--force'], workspace);
        git(['worktree', 'prune'], workspace);
        r = git(baseArgs, workspace);
      }
    }
    if (!r.ok) {
      const msg = (r.stderr || r.stdout).trim() || 'checkout falló';
      // Detectamos el caso de "local changes would be overwritten" para que el
      // frontend pida confirmación al user (llevar/descartar).
      if (/would be overwritten by (checkout|merge)/i.test(msg) || /commit your changes or stash/i.test(msg)) {
        return {
          ok: false,
          error: msg.slice(0, 600),
          code: 'checkout.dirty_working_tree',
          files: listDirtyFiles(workspace),
        };
      }
      return { ok: false, error: msg.slice(0, 600) };
    }
  }
  return { ok: true, message: r.stdout.trim() || `Cambiado a «${branch}»` };
}

/**
 * Descarta los cambios sin commitear de UN archivo:
 *  - Si está tracked (modificado): `git checkout HEAD -- <path>` lo restaura.
 *  - Si está untracked (creado nuevo): `rm <path>` lo elimina.
 * Acepta paths absolutos o relativos al workspace. Valida que el path final
 * esté dentro del workspace (anti path-traversal).
 */
export function discardFile(workspace: string, inputPath: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!inputPath) return { ok: false, error: 'Path vacío' };

  // Normalizamos a absoluto y verificamos que esté dentro del workspace.
  const abs = pathResolve(workspace, inputPath);
  const wsNorm = pathResolve(workspace);
  const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
  if (!inside) {
    return { ok: false, error: `Path fuera del workspace (${inputPath})` };
  }
  // Path relativo al workspace (lo que git espera).
  const relPath = abs.slice(wsNorm.length + 1) || abs;

  // Detectar si está tracked: `git ls-files --error-unmatch <path>` → 0 si tracked.
  const ls = git(['ls-files', '--error-unmatch', '--', relPath], workspace);
  if (ls.ok) {
    const r = git(['checkout', 'HEAD', '--', relPath], workspace);
    if (!r.ok) {
      return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'checkout falló' };
    }
    return { ok: true, message: `Cambios descartados en ${relPath}` };
  }
  // untracked → rm filesystem
  try {
    unlinkSync(abs);
    return { ok: true, message: `Eliminado ${relPath}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo eliminar' };
  }
}

export function pull(workspace: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  const r = git(['pull', '--ff-only'], workspace);
  if (!r.ok) {
    const msg = (r.stderr || r.stdout).trim();
    return { ok: false, error: msg.slice(0, 600) || 'pull falló' };
  }
  return { ok: true, message: r.stdout.trim() || 'Sin cambios remotos' };
}

export function fetch(workspace: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  const r = git(['fetch', '--all', '--prune'], workspace);
  if (!r.ok) {
    const msg = (r.stderr || r.stdout).trim();
    return { ok: false, error: msg.slice(0, 600) || 'fetch falló' };
  }
  return { ok: true, message: 'Fetch completado' };
}

export function renameBranch(workspace: string, newName: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!newName || /[\s'"`;|&$<>()\\]/.test(newName)) return { ok: false, error: 'Nombre de rama inválido' };
  const r = git(['branch', '-m', newName], workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'rename falló' };
  }
  return { ok: true, message: `Rama renombrada a «${newName}»` };
}

// Snapshot del repo para que la AI sugiera un mensaje: status + diff + últimos commits.
// Limita el tamaño para no inflar el prompt.
export function commitContext(workspace: string): { status: string; diff: string; recentLog: string; hasChanges: boolean } | { error: string } {
  if (!isRepo(workspace)) return { error: 'No es un repositorio git' };
  const status = git(['status', '--porcelain=v1'], workspace);
  if (!status.ok) return { error: (status.stderr || 'status falló').slice(0, 300) };
  const hasChanges = status.stdout.trim().length > 0;
  // Limitamos el diff a 60k chars para que entre en el prompt sin saturar.
  const diff = git(['diff', '--no-color', '--stat', '-U3'], workspace);
  const truncated = diff.stdout.length > 60_000 ? diff.stdout.slice(0, 60_000) + '\n…[diff truncado]' : diff.stdout;
  const log = git(['log', '--oneline', '-10'], workspace);
  return {
    status: status.stdout.trim(),
    diff: truncated,
    recentLog: log.stdout.trim(),
    hasChanges,
  };
}

// Pide a Claude que sugiera un mensaje de commit basándose en el diff actual.
// Usa `claude -p` (print mode, no interactivo) para una invocación one-shot.
export type SuggestResult = { ok: true; message: string; summary: string } | { ok: false; error: string };
export function suggestCommitMessage(workspace: string, extraContext = ''): SuggestResult {
  const ctx = commitContext(workspace);
  if ('error' in ctx) return { ok: false, error: ctx.error };
  if (!ctx.hasChanges) return { ok: false, error: 'Sin cambios para commitear' };

  const prompt = [
    'Generá un mensaje de commit conciso para los cambios siguientes.',
    'Devolvé ÚNICAMENTE el mensaje del commit — sin preámbulo, sin comillas, sin code fences, sin explicación.',
    'Formato: primera línea es el título (máx 72 chars, modo imperativo). Si hace falta, dejá una línea en blanco y agregás body de 1-3 bullets.',
    'Inferí el estilo del repo viendo los últimos commits (conventional, prefix tipo "feat:", etc.).',
    'NO incluyas trailers tipo Co-Authored-By, Signed-off-by, ni "🤖 Generated with Claude Code".',
    extraContext ? `Contexto del usuario: ${extraContext}` : '',
    '',
    '=== git status ===',
    ctx.status || '(vacío)',
    '',
    '=== git log --oneline -10 ===',
    ctx.recentLog || '(sin historial)',
    '',
    '=== git diff ===',
    ctx.diff || '(sin diff)',
  ].filter(Boolean).join('\n');

  const r = spawnSync(config.claudeCliPath, ['-p', prompt], {
    cwd: workspace,
    timeout: 60_000,
    encoding: 'utf-8',
    env: buildSafeEnv(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString()).trim();
    return { ok: false, error: err.slice(0, 600) || 'claude -p falló' };
  }
  const raw = ((r.stdout ?? '').toString()).trim();
  // Limpiamos code fences accidentales o cuotas externas.
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  // Summary corto: primera línea no vacía.
  const summary = (cleaned.split('\n').find((l) => l.trim()) ?? '').slice(0, 100);
  return { ok: true, message: cleaned, summary };
}

// Ejecuta `git add -A && git commit -m <message>`. El message se pasa por -F vía stdin
// para evitar problemas de escaping con quotes/newlines/$. NO hace push.
export function commitWithMessage(workspace: string, message: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  const cleaned = message.trim();
  if (!cleaned) return { ok: false, error: 'Mensaje vacío' };

  const add = git(['add', '-A'], workspace);
  if (!add.ok) return { ok: false, error: (add.stderr || 'add falló').slice(0, 400) };

  // git commit -F - lee el message del stdin.
  const r = spawnSync('git', ['commit', '-F', '-'], {
    cwd: workspace,
    timeout: GIT_TIMEOUT,
    encoding: 'utf-8',
    env: buildSafeEnv({ GIT_TERMINAL_PROMPT: '0' }),
    input: cleaned,
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString()).trim();
    return { ok: false, error: err.slice(0, 600) || 'commit falló' };
  }
  return { ok: true, message: (r.stdout ?? '').toString().trim() || 'Commit creado' };
}

// ─── Pull requests (GitHub) ───────────────────────────────────────────────
// Usa `gh` CLI ya autenticado en la máquina (~/.config/gh/hosts.yml). No
// almacenamos tokens propios — gh maneja keychain + OAuth.
//
// Requisitos: gh CLI instalado y `gh auth login` ejecutado por el user. Si
// alguno falta, listPullRequests devuelve un error legible.

export type PullRequest = {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
  // Si el PR viene de un fork (su head repo owner ≠ owner del repo actual).
  // Lo marcamos para que el frontend pueda avisar al user (el checkout
  // crea una rama local con prefix del fork).
  isFork: boolean;
  additions?: number;
  deletions?: number;
};

export type PullRequestsResult =
  | { ok: true; prs: PullRequest[] }
  | { ok: false; error: string; code?: string };

function ghAvailable(): boolean {
  const r = spawnSync('gh', ['--version'], { timeout: 3_000, encoding: 'utf-8' });
  return r.status === 0;
}

export function listPullRequests(workspace: string): PullRequestsResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git', code: 'git.not_a_repo' };
  if (!ghAvailable()) {
    return { ok: false, error: 'GitHub CLI (gh) no está instalado. Instalalo con `brew install gh`.', code: 'pr.gh_missing' };
  }
  // gh pr list necesita un remote configurado. Si el repo no tiene origin de
  // GitHub, gh devuelve un error claro que pasamos tal cual.
  const r = spawnSync('gh', [
    'pr', 'list',
    '--state', 'open',
    '--limit', '50',
    '--json', 'number,title,author,headRefName,baseRefName,isDraft,createdAt,updatedAt,url,headRepositoryOwner,additions,deletions',
  ], {
    cwd: workspace,
    timeout: 20_000,
    encoding: 'utf-8',
    env: buildSafeEnv({}),
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString()).trim();
    // gh dice "no GitHub repo found" cuando no hay remote o no está auth.
    if (/auth/i.test(err) && /login/i.test(err)) {
      return { ok: false, error: 'gh no autenticado. Corré `gh auth login` en una terminal.', code: 'pr.gh_unauthenticated' };
    }
    if (/no\s+(github\s+)?(remote|repository)/i.test(err)) {
      return { ok: false, error: 'Este repo no tiene un remote de GitHub configurado.', code: 'pr.no_github_remote' };
    }
    return { ok: false, error: err.slice(0, 400) || 'gh pr list falló' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse((r.stdout ?? '').toString());
  } catch {
    return { ok: false, error: 'No pude parsear la respuesta de gh' };
  }
  if (!Array.isArray(raw)) return { ok: true, prs: [] };

  // Para detectar forks, consultamos el owner del repo actual una sola vez.
  const ownerR = spawnSync('gh', ['repo', 'view', '--json', 'owner', '-q', '.owner.login'], {
    cwd: workspace, timeout: 8_000, encoding: 'utf-8', env: buildSafeEnv({}),
  });
  const repoOwner = ownerR.status === 0 ? ((ownerR.stdout ?? '').toString()).trim() : '';

  const prs: PullRequest[] = raw.map((p: any) => ({
    number: Number(p.number),
    title: String(p.title ?? ''),
    author: String(p.author?.login ?? ''),
    headRefName: String(p.headRefName ?? ''),
    baseRefName: String(p.baseRefName ?? ''),
    isDraft: !!p.isDraft,
    createdAt: String(p.createdAt ?? ''),
    updatedAt: String(p.updatedAt ?? ''),
    url: String(p.url ?? ''),
    isFork: !!(repoOwner && p.headRepositoryOwner?.login && p.headRepositoryOwner.login !== repoOwner),
    additions: typeof p.additions === 'number' ? p.additions : undefined,
    deletions: typeof p.deletions === 'number' ? p.deletions : undefined,
  }));
  return { ok: true, prs };
}

/**
 * Checkout de un PR usando `gh pr checkout <number>`. Maneja forks
 * transparentemente (crea remote temporal si hace falta) y branches que
 * ya existen localmente. Se ejecuta en el worktree del agente — el user
 * pierde la rama actual del worktree (igual que con checkoutBranch),
 * pero como cada agente tiene su propio worktree, no afecta a otros.
 */
export function checkoutPullRequest(workspace: string, number: number): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!ghAvailable()) return { ok: false, error: 'gh CLI no instalado' };
  if (!Number.isFinite(number) || number < 1) return { ok: false, error: 'número de PR inválido' };

  const r = spawnSync('gh', ['pr', 'checkout', String(number)], {
    cwd: workspace,
    timeout: 60_000,
    encoding: 'utf-8',
    env: buildSafeEnv({ GIT_TERMINAL_PROMPT: '0' }),
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString()).trim();
    return { ok: false, error: err.slice(0, 600) || 'gh pr checkout falló' };
  }
  return { ok: true, message: `Checkout del PR #${number} OK` };
}
