// History del repo: log paginado + detalle de un commit (meta + diff).
// Backend para la sub-pestaña "Historial" del tab Git.

import { resolve as pathResolve, sep as pathSep } from 'node:path';
import { git, isRepo, isValidSha } from './git-ops.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_DIFF_BYTES = 512 * 1024; // 512 KB, igual que file-diff.ts

export type LogEntry = {
  sha: string;
  abbrev: string;
  author: string;
  email: string;
  date: string; // ISO 8601
  subject: string;
  body: string;
  // refs decoradas (tags, branches) que apuntan a este commit
  refs: string[];
  // abbrev SHAs de los padres (1 = commit normal, 2+ = merge)
  parents: string[];
};

export type LogOpts = {
  branch?: string;
  limit?: number;
  skip?: number;
  path?: string;
  all?: boolean;
};

export type LogResult =
  | { ok: true; commits: LogEntry[]; hasMore: boolean }
  | { ok: false; error: string };

// Separadores in-band del control set ASCII — git nunca los emite en
// output natural y `spawn` los acepta (a diferencia de \x00, que Node
// rechaza por seguridad). `\x1f` (Unit Separator) entre campos del
// commit, `\x1e` (Record Separator) entre commits.
const FIELD_SEP = '\x1f';
const COMMIT_SEP = '\x1e';

const FORMAT = [
  '%H',  // full sha
  '%h',  // abbrev sha
  '%an', // author name
  '%ae', // author email
  '%aI', // author date ISO strict
  '%P',  // parent shas (space-separated, abbrev with %p)
  '%D',  // ref names (decorated)
  '%s',  // subject
  '%b',  // body
].join(FIELD_SEP);

export function gitLog(workspace: string, opts: LogOpts = {}): LogResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };

  const limitRaw = Number(opts.limit ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT), MAX_LIMIT);
  const skipRaw = Number(opts.skip ?? 0);
  const skip = Math.max(0, Number.isFinite(skipRaw) ? skipRaw : 0);

  const args = ['log', `--pretty=format:${FORMAT}${COMMIT_SEP}`, `-n`, String(limit + 1), `--skip=${skip}`];

  if (opts.all) {
    args.push('--all');
  } else if (opts.branch) {
    if (!/^[a-zA-Z0-9._\-/]+$/.test(opts.branch)) {
      return { ok: false, error: 'Nombre de rama inválido' };
    }
    args.push(opts.branch);
  } else {
    args.push('HEAD');
  }

  if (opts.path) {
    // Validar path-traversal: el path resuelto debe estar dentro del workspace.
    const abs = pathResolve(workspace, opts.path);
    const wsNorm = pathResolve(workspace);
    const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
    if (!inside) return { ok: false, error: 'Path fuera del workspace' };
    const rel = abs.slice(wsNorm.length + 1) || abs;
    args.push('--', rel);
  }

  const r = git(args, workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'git log falló' };
  }

  const raw = r.stdout;
  // Split por NUL — el último elemento es '' si el output termina con el separador.
  const chunks = raw.split(COMMIT_SEP).map((c) => c.replace(/^\n/, '')).filter((c) => c.length > 0);

  const all: LogEntry[] = [];
  for (const c of chunks) {
    const parts = c.split(FIELD_SEP);
    if (parts.length < 9) continue;
    const refs = (parts[6] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const parents = (parts[5] ?? '').split(/\s+/).filter(Boolean).map((p) => p.slice(0, 7));
    all.push({
      sha: parts[0] ?? '',
      abbrev: parts[1] ?? '',
      author: parts[2] ?? '',
      email: parts[3] ?? '',
      date: parts[4] ?? '',
      subject: parts[7] ?? '',
      body: (parts[8] ?? '').trim(),
      refs,
      parents,
    });
  }

  const hasMore = all.length > limit;
  return { ok: true, commits: hasMore ? all.slice(0, limit) : all, hasMore };
}

export type ShowResult =
  | { ok: true; meta: LogEntry; diff: string; truncated: boolean; stat: string }
  | { ok: false; error: string };

export function gitShow(workspace: string, sha: string): ShowResult {
  if (!isRepo(workspace)) return { ok: false, error: 'No es un repositorio git' };
  if (!isValidSha(sha)) return { ok: false, error: 'SHA inválido' };

  // Verificar que el commit existe.
  const exists = git(['cat-file', '-e', `${sha}^{commit}`], workspace);
  if (!exists.ok) {
    return { ok: false, error: 'Commit no encontrado en este worktree' };
  }

  // Meta + diff en una sola llamada.
  const metaArgs = ['show', `--pretty=format:${FORMAT}${COMMIT_SEP}`, '--no-color', sha];
  const r = git(metaArgs, workspace);
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 600) || 'git show falló' };
  }

  const sepIdx = r.stdout.indexOf(COMMIT_SEP);
  if (sepIdx < 0) return { ok: false, error: 'Salida de git show inesperada' };

  const metaRaw = r.stdout.slice(0, sepIdx);
  const diffRaw = r.stdout.slice(sepIdx + 1).replace(/^\n+/, '');

  const parts = metaRaw.split(FIELD_SEP);
  if (parts.length < 9) return { ok: false, error: 'Metadata del commit inválida' };
  const refs = (parts[6] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const parents = (parts[5] ?? '').split(/\s+/).filter(Boolean).map((p) => p.slice(0, 7));
  const meta: LogEntry = {
    sha: parts[0] ?? sha,
    abbrev: parts[1] ?? sha.slice(0, 7),
    author: parts[2] ?? '',
    email: parts[3] ?? '',
    date: parts[4] ?? '',
    subject: parts[7] ?? '',
    body: (parts[8] ?? '').trim(),
    refs,
    parents,
  };

  const diffBytes = Buffer.byteLength(diffRaw, 'utf-8');
  const truncated = diffBytes > MAX_DIFF_BYTES;
  const diff = truncated ? diffRaw.slice(0, MAX_DIFF_BYTES) + '\n…[diff truncado]' : diffRaw;

  // Stat aparte (resumen de archivos cambiados).
  const statR = git(['show', '--stat', '--format=', '--no-color', sha], workspace);
  const stat = statR.ok ? statR.stdout.trim() : '';

  return { ok: true, meta, diff, truncated, stat };
}
