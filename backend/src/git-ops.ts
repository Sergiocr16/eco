// Operaciones git sobre el worktree de cada burbuja: listar branches, cambiar
// de rama, pull, fetch. Pensado para usarse desde el frontend tipo GitHub app.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  | { ok: false; error: string };

export function checkoutBranch(workspace: string, branch: string, create = false): GitActionResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!branch || /[\s'"`;|&$<>()\\]/.test(branch)) return { ok: false, error: 'Nombre de rama inválido' };

  // Si pedimos checkout de un branch remoto sin crear local, hacemos `checkout -t`
  // que crea un local trackeando el remoto.
  const isRemoteRef = branch.includes('/') && !create;
  const args = create
    ? ['checkout', '-b', branch]
    : isRemoteRef
      ? ['checkout', '-t', branch]
      : ['checkout', branch];

  const r = git(args, workspace);
  if (!r.ok) {
    const msg = (r.stderr || r.stdout).trim() || 'checkout falló';
    return { ok: false, error: msg.slice(0, 600) };
  }
  return { ok: true, message: r.stdout.trim() || `Cambiado a «${branch}»` };
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
