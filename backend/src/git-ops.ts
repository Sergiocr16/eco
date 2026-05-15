// Operaciones git sobre el worktree de cada burbuja: listar branches, cambiar
// de rama, pull, fetch. Pensado para usarse desde el frontend tipo GitHub app.

import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync, mkdtempSync, statSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve as pathResolve, sep as pathSep, join as pathJoin } from 'node:path';
import { buildSafeEnv } from './security.js';
import { config } from './config.js';

const GIT_TIMEOUT = 10_000;

// Operación git que puede dejar el worktree en estado mixto (con
// CHERRY_PICK_HEAD / MERGE_HEAD / REVERT_HEAD en .git). Se usa para
// detectar conflictos en curso y ofrecer abort/continue.
export type GitConflictOp = 'cherry-pick' | 'merge' | 'revert';

export type GitOpResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      error: string;
      code?: string;
      conflict?: { files: string[]; op: GitConflictOp };
    };

// SHA hex válido (abbrev 4-40 chars).
export function isValidSha(s: string): boolean {
  return typeof s === 'string' && /^[a-f0-9]{4,40}$/i.test(s);
}

// Nombre de ref (branch/tag) sin metacaracteres de shell. Permite slashes
// para refs anidadas tipo `feature/login` o `eco/abc123`.
export function isValidRef(s: string): boolean {
  return typeof s === 'string' && /^[a-zA-Z0-9._\-/]+$/.test(s) && !s.startsWith('-');
}

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

export function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
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

export function isRepo(dir: string): boolean {
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

// Si el worktree estaba en una rama auto-creada `eco/<id>` y el user cambió
// a otra rama, esa `eco/<id>` queda huérfana. La limpiamos:
//  - mode 'discard' → `git branch -D` (force): el user descartó los cambios,
//    se borra entera aunque tuviera commits.
//  - 'plain' / 'carry' → `git branch -d` (safe): git solo la borra si está
//    fully-merged / sin commits propios. Si tiene trabajo, la conserva.
// Best-effort: cualquier error se ignora (la rama puede no existir, estar
// checked-out en otro worktree, etc.).
function maybeCleanupEcoBranch(workspace: string, prevBranch: string, mode: CheckoutMode): void {
  if (!prevBranch || !/^eco\//.test(prevBranch)) return;
  // No borrar si el checkout fue no-op (seguimos en la misma rama).
  const cur = git(['rev-parse', '--abbrev-ref', 'HEAD'], workspace);
  if (cur.ok && cur.stdout.trim() === prevBranch) return;
  const flag = mode === 'discard' ? '-D' : '-d';
  git(['branch', flag, prevBranch], workspace);
}

export function checkoutBranch(
  workspace: string,
  branch: string,
  create = false,
  mode: CheckoutMode = 'plain',
): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!branch || /[\s'"`;|&$<>()\\]/.test(branch)) return { ok: false, error: 'Nombre de rama inválido' };

  // Rama actual ANTES del checkout — para limpiar la `eco/<id>` huérfana
  // si el user se mueve a otra rama.
  const prevBranchR = git(['rev-parse', '--abbrev-ref', 'HEAD'], workspace);
  const prevBranch = prevBranchR.ok ? prevBranchR.stdout.trim() : '';

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
    maybeCleanupEcoBranch(workspace, prevBranch, mode);
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
        // NO limpiamos la rama vieja — el user todavía tiene que resolver.
        return {
          ok: true,
          message: `Cambiado a «${branch}». Conflictos al traer cambios — resolvelos manualmente (git stash list).`,
        };
      }
      maybeCleanupEcoBranch(workspace, prevBranch, mode);
      return { ok: true, message: `Cambiado a «${branch}» con tus cambios traídos.` };
    }
    maybeCleanupEcoBranch(workspace, prevBranch, mode);
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
  maybeCleanupEcoBranch(workspace, prevBranch, mode);
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

  // Detectar el estado del archivo:
  //  - en HEAD       → modified tracked, restauramos con checkout HEAD.
  //  - en index pero NO en HEAD → archivo nuevo staged (vía "Aceptar"),
  //    hay que sacarlo del index Y del filesystem con `git rm -f`.
  //  - sin index ni HEAD → untracked, rm del filesystem.
  const inIndex = git(['ls-files', '--error-unmatch', '--', relPath], workspace).ok;
  const inHead = git(['cat-file', '-e', `HEAD:${relPath}`], workspace).ok;

  if (inHead) {
    const r = git(['checkout', 'HEAD', '--', relPath], workspace);
    if (!r.ok) {
      return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'checkout falló' };
    }
    return { ok: true, message: `Cambios descartados en ${relPath}` };
  }

  if (inIndex) {
    // Está staged como nuevo pero no commiteado — `git rm -f` lo saca del
    // index y borra el archivo del worktree en una sola operación.
    const r = git(['rm', '-f', '--', relPath], workspace);
    if (!r.ok) {
      return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'git rm falló' };
    }
    return { ok: true, message: `Eliminado ${relPath}` };
  }

  // Untracked puro → rm filesystem.
  try {
    unlinkSync(abs);
    return { ok: true, message: `Eliminado ${relPath}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo eliminar' };
  }
}

/**
 * Revierte UN solo hunk de un archivo (review estilo Cursor). El frontend
 * extrae el bloque crudo del unified diff (líneas que arrancan con `@@`,
 * `+`, `-`, ` `) y lo pasa acá. Construimos un patch mínimo y lo aplicamos
 * con `git apply -R` para deshacer ese hunk sin tocar los demás.
 *
 * `--recount` regenera los números de línea del header del hunk, así no
 * fallamos por offsets cuando hubo cambios intermedios (otros hunks ya
 * aceptados/rechazados antes).
 */
export function revertHunk(
  workspace: string,
  inputPath: string,
  hunkText: string,
): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!inputPath) return { ok: false, error: 'Path vacío' };
  if (!hunkText || !hunkText.trim()) return { ok: false, error: 'Hunk vacío' };

  const abs = pathResolve(workspace, inputPath);
  const wsNorm = pathResolve(workspace);
  const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
  if (!inside) return { ok: false, error: `Path fuera del workspace (${inputPath})` };
  const relPath = abs.slice(wsNorm.length + 1) || abs;

  // Si el archivo es untracked (nuevo creado por el agente), su "diff" es
  // un solo hunk con todo el contenido — rechazarlo equivale a borrar el
  // archivo entero. `git apply -R` no puede manejar archivos sin base en
  // el index/HEAD, así que caemos al fallback de discardFile.
  const ls = git(['ls-files', '--error-unmatch', '--', relPath], workspace);
  if (!ls.ok) {
    try {
      unlinkSync(abs);
      return { ok: true, message: `Archivo nuevo descartado (${relPath})` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'No se pudo eliminar archivo nuevo' };
    }
  }

  // El bloque crudo del hunk debe arrancar con `@@`. Si el frontend mandó
  // algo distinto, fail fast.
  const cleaned = hunkText.endsWith('\n') ? hunkText : hunkText + '\n';
  if (!cleaned.startsWith('@@')) {
    return { ok: false, error: 'El hunk debe empezar con @@' };
  }

  const patch =
    `diff --git a/${relPath} b/${relPath}\n` +
    `--- a/${relPath}\n` +
    `+++ b/${relPath}\n` +
    cleaned;

  let tmpDir: string;
  try {
    tmpDir = mkdtempSync(pathJoin(tmpdir(), 'eco-revert-'));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No pude crear temp dir' };
  }
  const tmpFile = pathJoin(tmpDir, 'hunk.patch');
  try {
    writeFileSync(tmpFile, patch, 'utf-8');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No pude escribir patch' };
  }

  const r = git(['apply', '-R', '--whitespace=nowarn', '--recount', tmpFile], workspace);
  try { unlinkSync(tmpFile); } catch { /* noop */ }

  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'git apply -R falló' };
  }
  return { ok: true, message: `Hunk revertido en ${relPath}` };
}

/**
 * "Acepta" UN hunk haciendo `git apply --cached` del patch — el hunk pasa
 * a vivir en el INDEX (staged) y desaparece del diff working tree vs index.
 * Si después el agente edita el archivo, los cambios NUEVOS aparecen como
 * unstaged (lo único que queda por revisar).
 */
export function acceptHunk(
  workspace: string,
  inputPath: string,
  hunkText: string,
): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!inputPath) return { ok: false, error: 'Path vacío' };
  if (!hunkText || !hunkText.trim()) return { ok: false, error: 'Hunk vacío' };

  const abs = pathResolve(workspace, inputPath);
  const wsNorm = pathResolve(workspace);
  const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
  if (!inside) return { ok: false, error: `Path fuera del workspace (${inputPath})` };
  const relPath = abs.slice(wsNorm.length + 1) || abs;

  // Si el archivo no está en el index (archivo nuevo / untracked),
  // `git apply --cached` falla con "does not exist in index". Para nuevos
  // archivos el "diff" suele ser un solo hunk con todo el contenido —
  // aceptarlo equivale a stagear el archivo entero.
  const ls = git(['ls-files', '--error-unmatch', '--', relPath], workspace);
  if (!ls.ok) {
    const add = git(['add', '--', relPath], workspace);
    if (!add.ok) {
      return { ok: false, error: (add.stderr || add.stdout).trim().slice(0, 600) || 'git add falló' };
    }
    return { ok: true, message: `Archivo nuevo aceptado entero (${relPath})` };
  }

  const cleaned = hunkText.endsWith('\n') ? hunkText : hunkText + '\n';
  if (!cleaned.startsWith('@@')) {
    return { ok: false, error: 'El hunk debe empezar con @@' };
  }
  const patch =
    `diff --git a/${relPath} b/${relPath}\n` +
    `--- a/${relPath}\n` +
    `+++ b/${relPath}\n` +
    cleaned;

  let tmpDir: string;
  try { tmpDir = mkdtempSync(pathJoin(tmpdir(), 'eco-accept-')); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No pude crear temp dir' }; }
  const tmpFile = pathJoin(tmpDir, 'hunk.patch');
  try { writeFileSync(tmpFile, patch, 'utf-8'); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No pude escribir patch' }; }

  // --cached aplica al index sin tocar el working tree. El cambio ya estaba
  // en el filesystem (el agente lo escribió); solo lo marcamos como staged.
  const r = git(['apply', '--cached', '--whitespace=nowarn', '--recount', tmpFile], workspace);
  try { unlinkSync(tmpFile); } catch { /* noop */ }
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'git apply --cached falló' };
  }
  return { ok: true, message: `Hunk aceptado en ${relPath}` };
}

/**
 * Lee el contenido completo de un archivo dentro del workspace (con cap
 * de tamaño). El frontend lo usa para mostrar el archivo entero con
 * highlight de las líneas modificadas, complementando el diff puro.
 */
export type FileContentsResult =
  | { ok: true; content: string; size: number; truncated: boolean }
  | { ok: false; error: string };

export function readFileContents(workspace: string, inputPath: string): FileContentsResult {
  if (!inputPath) return { ok: false, error: 'Path vacío' };
  const abs = pathResolve(workspace, inputPath);
  const wsNorm = pathResolve(workspace);
  const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
  if (!inside) return { ok: false, error: `Path fuera del workspace (${inputPath})` };
  if (!existsSync(abs)) return { ok: false, error: 'Archivo no existe' };
  const MAX = 512 * 1024; // 512 KB
  try {
    const stat = statSync(abs);
    if (stat.isDirectory()) return { ok: false, error: 'Es un directorio' };
    const truncated = stat.size > MAX;
    // readFileSync con utf-8 puede romper caracteres multi-byte si truncamos
    // a la mitad de uno. Para mantener simple aceptamos esa imperfección
    // — los archivos > 512 KB son raros en review y el warning lo indica.
    const fullContent = readFileSync(abs, 'utf-8');
    const content = truncated ? fullContent.slice(0, MAX) : fullContent;
    return { ok: true, content, size: stat.size, truncated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error leyendo archivo' };
  }
}

/**
 * "Acepta" un archivo entero: `git add` lo stagea. Los cambios futuros
 * (si el agente vuelve a editarlo) aparecerán como unstaged y volverán
 * a mostrarse en el diff de review.
 */
export function acceptFile(workspace: string, inputPath: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!inputPath) return { ok: false, error: 'Path vacío' };
  const abs = pathResolve(workspace, inputPath);
  const wsNorm = pathResolve(workspace);
  const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
  if (!inside) return { ok: false, error: `Path fuera del workspace (${inputPath})` };
  const relPath = abs.slice(wsNorm.length + 1) || abs;
  const r = git(['add', '--', relPath], workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'git add falló' };
  }
  return { ok: true, message: `Archivo aceptado en ${relPath}` };
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

/**
 * Fetch tolerante: corre `git fetch` por cada remote y reporta cuáles
 * tuvieron éxito y cuáles fallaron por falta de credenciales (típico en
 * remotos tipo `heroku-*` que requieren auth interactiva). Como tenemos
 * `GIT_TERMINAL_PROMPT=0`, esos remotos fallan con "could not read
 * Username for X: terminal prompts disabled" — los tratamos como skip
 * en lugar de error fatal.
 *
 * Devolvemos `ok: true` si AL MENOS UN remote se trajo OK; el mensaje
 * resume cuáles OK y cuáles requirieron auth. Solo `ok: false` si todos
 * fallaron o si no hay remotos.
 */
export function fetch(workspace: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  const remotesR = git(['remote'], workspace);
  if (!remotesR.ok) {
    return { ok: false, error: (remotesR.stderr || 'no pude listar remotos').slice(0, 400) };
  }
  const remotes = remotesR.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  if (remotes.length === 0) {
    return { ok: false, error: 'El repositorio no tiene remotos configurados', code: 'fetch.no_remotes' };
  }
  const ok: string[] = [];
  const authNeeded: string[] = [];
  const otherFailures: { name: string; error: string }[] = [];
  for (const name of remotes) {
    const r = git(['fetch', '--prune', name], workspace);
    if (r.ok) { ok.push(name); continue; }
    const msg = (r.stderr || r.stdout).toLowerCase();
    if (/terminal prompts disabled|could not read username|could not read password|authentication failed/.test(msg)) {
      authNeeded.push(name);
    } else {
      otherFailures.push({ name, error: ((r.stderr || r.stdout).trim().slice(0, 200)) });
    }
  }
  // Todos fallaron sin auth issues → error fatal con detalle del primero.
  if (ok.length === 0 && authNeeded.length === 0 && otherFailures.length > 0) {
    const first = otherFailures[0]!;
    return { ok: false, error: `fetch falló en «${first.name}»: ${first.error}` };
  }
  // Todos fallaron por auth → reportamos auth, no error genérico.
  if (ok.length === 0 && otherFailures.length === 0 && authNeeded.length > 0) {
    return {
      ok: false,
      code: 'fetch.auth_needed',
      error: `Todos los remotos requieren credenciales: ${authNeeded.join(', ')}. Configurá un credential helper o sacá los remotos privados.`,
    };
  }
  // Hay al menos un OK — éxito parcial con resumen.
  const parts: string[] = [];
  if (ok.length > 0) parts.push(`OK: ${ok.join(', ')}`);
  if (authNeeded.length > 0) parts.push(`saltados (sin credenciales): ${authNeeded.join(', ')}`);
  if (otherFailures.length > 0) parts.push(`con error: ${otherFailures.map((f) => f.name).join(', ')}`);
  return { ok: true, message: `Fetch — ${parts.join(' · ')}` };
}

/**
 * Push de la rama actual al remoto (`origin` por convención). Si la rama
 * no tiene upstream, intenta crearlo con `--set-upstream origin <branch>`.
 * Maneja los errores comunes (no remote, no permisos, rejected fast-forward).
 */
export function push(workspace: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  // Detectar rama actual.
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], workspace);
  if (!head.ok) return { ok: false, error: 'No se pudo determinar la rama actual' };
  const branch = head.stdout.trim();
  if (!branch || branch === 'HEAD') return { ok: false, error: 'No estás en una rama (HEAD detached)' };
  // Verificar que exista al menos un remoto.
  const remotes = git(['remote'], workspace);
  if (!remotes.ok || !remotes.stdout.trim()) {
    return { ok: false, error: 'El repositorio no tiene remoto configurado' };
  }
  // Intentar push. Si no hay upstream, fallaremos y haremos un segundo
  // intento con --set-upstream origin <branch>.
  let r = git(['push'], workspace);
  if (!r.ok) {
    const stderr = r.stderr || r.stdout;
    if (/has no upstream branch|--set-upstream/i.test(stderr)) {
      r = git(['push', '--set-upstream', 'origin', branch], workspace);
    }
    if (!r.ok) {
      const msg = (r.stderr || r.stdout).trim();
      return { ok: false, error: msg.slice(0, 600) || 'push falló' };
    }
    return { ok: true, message: `Rama «${branch}» publicada en origin` };
  }
  return { ok: true, message: r.stdout.trim() || `Push de «${branch}» OK` };
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
    'Generate a concise commit message for the following changes.',
    'IMPORTANT: write the commit message in ENGLISH. Even if the diff, the user context, or the recent log are in another language, the output must be English.',
    'Return ONLY the commit message — no preamble, no quotes, no code fences, no explanation.',
    'Format: first line is the title (max 72 chars, imperative mood). If needed, leave a blank line and add a body of 1-3 bullets.',
    'Infer the repo style from the recent commits below (conventional, prefix like "feat:", etc.).',
    'DO NOT include trailers like Co-Authored-By, Signed-off-by, or "🤖 Generated with Claude Code".',
    extraContext ? `User context (may be in any language — translate if needed; output stays in English): ${extraContext}` : '',
    '',
    '=== git status ===',
    ctx.status || '(empty)',
    '',
    '=== git log --oneline -10 ===',
    ctx.recentLog || '(no history)',
    '',
    '=== git diff ===',
    ctx.diff || '(no diff)',
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
  // env: buildSafeEnv → PATH augmentado con /opt/homebrew/bin etc., así
  // `gh` se encuentra aunque Electron se haya lanzado desde Finder (que no
  // hereda el PATH del shell del user).
  const r = spawnSync('gh', ['--version'], {
    timeout: 3_000,
    encoding: 'utf-8',
    env: buildSafeEnv({}),
  });
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

// PR asociado a la rama actual del worktree (si lo hay). Lo usa el banner
// en el chat para mostrar "estás en el PR #N" + acciones.
export type CurrentPr = {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  // gh devuelve "MERGEABLE" | "CONFLICTING" | "UNKNOWN" (mayúsculas).
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | string;
  headRefName: string;
  baseRefName: string;
  author: string;
};

export type CurrentPrResult =
  | { ok: true; pr: CurrentPr | null }
  | { ok: false; error: string };

export function currentPullRequest(workspace: string): CurrentPrResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!ghAvailable()) return { ok: false, error: 'gh no instalado' };
  // `gh pr view` sin número usa la rama actual del repo. Si no hay PR
  // asociado, devuelve exit code 1 con "no pull requests found".
  const r = spawnSync('gh', [
    'pr', 'view',
    '--json', 'number,title,url,state,isDraft,mergeable,headRefName,baseRefName,author',
  ], {
    cwd: workspace,
    timeout: 15_000,
    encoding: 'utf-8',
    env: buildSafeEnv({}),
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString());
    if (/no pull request|no open pull request|found for branch/i.test(err)) {
      return { ok: true, pr: null };
    }
    return { ok: false, error: err.trim().slice(0, 400) };
  }
  try {
    const raw = JSON.parse((r.stdout ?? '').toString()) as any;
    return {
      ok: true,
      pr: {
        number: Number(raw.number),
        title: String(raw.title ?? ''),
        url: String(raw.url ?? ''),
        state: String(raw.state ?? 'OPEN') as CurrentPr['state'],
        isDraft: !!raw.isDraft,
        mergeable: String(raw.mergeable ?? 'UNKNOWN'),
        headRefName: String(raw.headRefName ?? ''),
        baseRefName: String(raw.baseRefName ?? ''),
        author: String(raw.author?.login ?? ''),
      },
    };
  } catch {
    return { ok: false, error: 'No pude parsear la respuesta de gh' };
  }
}

/**
 * Merge del PR usando `gh pr merge`. Método configurable: merge commit
 * (default), squash o rebase. Asume que el PR está mergeable — si hay
 * conflictos, gh devuelve error legible que pasamos al user.
 */
export function mergePullRequest(
  workspace: string,
  number: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!ghAvailable()) return { ok: false, error: 'gh no instalado' };
  if (!Number.isFinite(number) || number < 1) return { ok: false, error: 'número de PR inválido' };
  const flag = method === 'squash' ? '--squash' : method === 'rebase' ? '--rebase' : '--merge';
  const r = spawnSync('gh', ['pr', 'merge', String(number), flag], {
    cwd: workspace,
    timeout: 90_000,
    encoding: 'utf-8',
    env: buildSafeEnv({ GIT_TERMINAL_PROMPT: '0' }),
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString());
    return { ok: false, error: err.trim().slice(0, 600) || 'gh pr merge falló' };
  }
  return { ok: true, message: `PR #${number} mergeado (${method})` };
}

/**
 * Cierra el PR sin mergear. Opcionalmente acepta un comentario que se
 * agrega al PR.
 */
export function closePullRequest(workspace: string, number: number, comment?: string): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!ghAvailable()) return { ok: false, error: 'gh no instalado' };
  if (!Number.isFinite(number) || number < 1) return { ok: false, error: 'número de PR inválido' };
  const args = ['pr', 'close', String(number)];
  if (comment && comment.trim()) {
    args.push('--comment', comment.trim().slice(0, 1000));
  }
  const r = spawnSync('gh', args, {
    cwd: workspace,
    timeout: 30_000,
    encoding: 'utf-8',
    env: buildSafeEnv({ GIT_TERMINAL_PROMPT: '0' }),
  });
  if (r.status !== 0) {
    const err = ((r.stderr ?? '').toString() || (r.stdout ?? '').toString());
    return { ok: false, error: err.trim().slice(0, 600) || 'gh pr close falló' };
  }
  return { ok: true, message: `PR #${number} cerrado` };
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
