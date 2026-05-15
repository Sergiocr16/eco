// Operaciones git avanzadas que pueden conflictar (cherry-pick, merge,
// revert), operaciones destructivas (reset) y detección/manejo de ops
// en progreso (abort/continue/opStatus).

import { existsSync } from 'node:fs';
import { isAbsolute, join as pathJoin } from 'node:path';
import {
  git,
  isRepo,
  isValidSha,
  isValidRef,
  type GitActionResult,
  type GitConflictOp,
  type GitOpResult,
} from './git-ops.js';

// ─── Helpers internos ──────────────────────────────────────────────────────

// Lista archivos en conflicto (unmerged). Vacío si no hay nada en mitad
// de un merge/cherry-pick/revert.
function conflictedFiles(workspace: string): string[] {
  const r = git(['diff', '--name-only', '--diff-filter=U'], workspace);
  if (!r.ok) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 200);
}

// En un worktree creado por `git worktree add`, .git es un ARCHIVO de
// texto, no un dir. CHERRY_PICK_HEAD / MERGE_HEAD / REVERT_HEAD viven
// en .git/worktrees/<id>/, no en <workspace>/.git/. Hay que resolver el
// path real con `git rev-parse --git-dir`.
function gitDirOf(workspace: string): string | null {
  const r = git(['rev-parse', '--git-dir'], workspace);
  if (!r.ok) return null;
  const raw = r.stdout.trim();
  if (!raw) return null;
  return isAbsolute(raw) ? raw : pathJoin(workspace, raw);
}

function detectOpInProgress(workspace: string): GitConflictOp | null {
  const dir = gitDirOf(workspace);
  if (!dir) return null;
  if (existsSync(pathJoin(dir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (existsSync(pathJoin(dir, 'MERGE_HEAD'))) return 'merge';
  if (existsSync(pathJoin(dir, 'REVERT_HEAD'))) return 'revert';
  return null;
}

// Construye un GitOpResult de error cuando una op (cherry-pick/merge/revert)
// dejó conflictos. Solo se llama si el comando original falló.
function buildConflictResult(workspace: string, op: GitConflictOp, errMsg: string): GitOpResult {
  const inProgress = detectOpInProgress(workspace);
  if (inProgress === op) {
    return {
      ok: false,
      error: errMsg,
      code: `${op}.conflict`,
      conflict: { files: conflictedFiles(workspace), op },
    };
  }
  return { ok: false, error: errMsg };
}

// ─── Cherry-pick ───────────────────────────────────────────────────────────

const MAX_CHERRY_PICK_SHAS = 50;

export function cherryPick(workspace: string, shas: string[]): GitOpResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!Array.isArray(shas) || shas.length === 0) {
    return { ok: false, error: 'Falta lista de commits a cherry-pickear' };
  }
  if (shas.length > MAX_CHERRY_PICK_SHAS) {
    return { ok: false, error: `Demasiados commits (max ${MAX_CHERRY_PICK_SHAS})` };
  }
  for (const s of shas) {
    if (!isValidSha(s)) return { ok: false, error: `SHA inválido: ${s.slice(0, 20)}` };
  }

  // Bloqueamos si ya hay una op en progreso (estado mixto).
  const ongoing = detectOpInProgress(workspace);
  if (ongoing) {
    return {
      ok: false,
      error: `Hay un ${ongoing} en progreso. Resolvé o abortá antes de continuar.`,
      code: 'op.in_progress',
      conflict: { files: conflictedFiles(workspace), op: ongoing },
    };
  }

  const r = git(['cherry-pick', ...shas], workspace);
  if (!r.ok) {
    const errMsg = (r.stderr || r.stdout).trim().slice(0, 600) || 'cherry-pick falló';
    return buildConflictResult(workspace, 'cherry-pick', errMsg);
  }
  return { ok: true, message: shas.length === 1 ? `Cherry-pick OK (${shas[0]?.slice(0, 7)})` : `${shas.length} commits cherry-pickeados` };
}

// ─── Merge ────────────────────────────────────────────────────────────────

export type MergeOpts = {
  noFf?: boolean;
  squash?: boolean;
  message?: string;
};

export function mergeBranch(workspace: string, source: string, opts: MergeOpts = {}): GitOpResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!source || !isValidRef(source)) return { ok: false, error: 'Nombre de rama inválido' };

  const ongoing = detectOpInProgress(workspace);
  if (ongoing) {
    return {
      ok: false,
      error: `Hay un ${ongoing} en progreso. Resolvé o abortá antes de continuar.`,
      code: 'op.in_progress',
      conflict: { files: conflictedFiles(workspace), op: ongoing },
    };
  }

  // Squash no crea commit automático — git lo deja staged y el user commitea.
  if (opts.squash) {
    const args = ['merge', '--squash', source];
    const r = git(args, workspace);
    if (!r.ok) {
      const errMsg = (r.stderr || r.stdout).trim().slice(0, 600) || 'merge --squash falló';
      return buildConflictResult(workspace, 'merge', errMsg);
    }
    return { ok: true, message: `Merge squash de «${source}» staged. Hacé commit para finalizar.` };
  }

  const args = ['merge'];
  if (opts.noFf) args.push('--no-ff');
  if (opts.message) {
    args.push('-m', opts.message.trim().slice(0, 500));
  }
  args.push(source);

  const r = git(args, workspace);
  if (!r.ok) {
    const errMsg = (r.stderr || r.stdout).trim().slice(0, 600) || 'merge falló';
    return buildConflictResult(workspace, 'merge', errMsg);
  }
  return { ok: true, message: r.stdout.trim().slice(0, 300) || `Merge de «${source}» OK` };
}

// ─── Revert ────────────────────────────────────────────────────────────────

export function revertCommit(workspace: string, sha: string): GitOpResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!isValidSha(sha)) return { ok: false, error: 'SHA inválido' };

  const ongoing = detectOpInProgress(workspace);
  if (ongoing) {
    return {
      ok: false,
      error: `Hay un ${ongoing} en progreso. Resolvé o abortá antes de continuar.`,
      code: 'op.in_progress',
      conflict: { files: conflictedFiles(workspace), op: ongoing },
    };
  }

  const r = git(['revert', '--no-edit', sha], workspace);
  if (!r.ok) {
    const errMsg = (r.stderr || r.stdout).trim().slice(0, 600) || 'revert falló';
    return buildConflictResult(workspace, 'revert', errMsg);
  }
  return { ok: true, message: `Revert de ${sha.slice(0, 7)} creado` };
}

// ─── Reset ────────────────────────────────────────────────────────────────

export type ResetMode = 'soft' | 'mixed' | 'hard';

export type ResetResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string; lostCommits?: number; lostSubjects?: string[] };

// `force` solo se respeta cuando mode='hard'. Para soft/mixed siempre se
// ejecuta — no son destructivos del working tree.
export function resetTo(workspace: string, ref: string, mode: ResetMode, force = false): ResetResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!ref) return { ok: false, error: 'Falta el ref destino' };
  // ref puede ser sha o nombre de branch — aceptamos ambos.
  if (!isValidSha(ref) && !isValidRef(ref)) {
    return { ok: false, error: 'Ref inválido' };
  }
  if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') {
    return { ok: false, error: 'Modo de reset inválido' };
  }

  // Pre-check destructivo: contar commits que se perderían.
  if (mode === 'hard' && !force) {
    const countR = git(['rev-list', '--count', `${ref}..HEAD`], workspace);
    if (countR.ok) {
      const lost = Number(countR.stdout.trim());
      if (Number.isFinite(lost) && lost > 0) {
        const subjectsR = git(['log', '--pretty=format:%s', '-n', '3', `${ref}..HEAD`], workspace);
        const subjects = subjectsR.ok
          ? subjectsR.stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3)
          : [];
        return {
          ok: false,
          error: `Vas a perder ${lost} commit${lost === 1 ? '' : 's'} con --hard`,
          code: 'reset.would_lose_commits',
          lostCommits: lost,
          lostSubjects: subjects,
        };
      }
    }
  }

  const r = git(['reset', `--${mode}`, ref], workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'reset falló' };
  }
  const label =
    mode === 'hard'
      ? `Reset --hard a ${ref}`
      : mode === 'soft'
        ? `Reset --soft a ${ref} (cambios preservados como staged)`
        : `Reset --mixed a ${ref} (cambios preservados como unstaged)`;
  return { ok: true, message: label };
}

// ─── Abort / Continue ──────────────────────────────────────────────────────

export function abortOp(workspace: string, op: GitConflictOp): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (op !== 'cherry-pick' && op !== 'merge' && op !== 'revert') {
    return { ok: false, error: 'Operación inválida' };
  }
  const r = git([op, '--abort'], workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || `${op} --abort falló` };
  }
  return { ok: true, message: `${op} abortado` };
}

export function continueOp(workspace: string, op: GitConflictOp): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (op !== 'cherry-pick' && op !== 'merge' && op !== 'revert') {
    return { ok: false, error: 'Operación inválida' };
  }
  // git <op> --continue invoca el editor por default si quedan cambios sin
  // commitear que requieren mensaje — pasamos GIT_EDITOR=true para que no
  // intente abrir nada (acepta el mensaje default).
  const r = git([op, '--continue'], workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || `${op} --continue falló` };
  }
  return { ok: true, message: `${op} continuado` };
}

// ─── Status de op en progreso ─────────────────────────────────────────────

export type OpStatus = {
  inProgress: GitConflictOp | null;
  conflictedFiles: string[];
};

export function opStatus(workspace: string): OpStatus {
  if (!isRepo(workspace)) return { inProgress: null, conflictedFiles: [] };
  const op = detectOpInProgress(workspace);
  if (!op) return { inProgress: null, conflictedFiles: [] };
  return { inProgress: op, conflictedFiles: conflictedFiles(workspace) };
}
