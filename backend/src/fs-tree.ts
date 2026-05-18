// Listado de árbol de archivos del workdir de una burbuja. Usado por la tab
// "Archivos" en el frontend (lazy load por directorio + carga completa para
// Quick Open).
//
// Estrategia:
//  - Si el workdir es un repo git → `git ls-files --cached --others
//    --exclude-standard -z`. Rápido y gitignore-aware sin que tengamos que
//    parsear .gitignore.
//  - Sino → walk manual con `fs.readdir` respetando EXCLUDED_DIRS.
//
// El cap de 5000 entradas previene OOM en monorepos. Si se supera, devolvemos
// truncated: true y el frontend muestra un banner. No agregamos un watcher
// (chokidar) en v1: el polling existente de /git/status + botón refrescar
// cubren el caso. Si la UX flaquea, se agrega en v2 con un endpoint SSE.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { git, isRepo } from './git-ops.js';

export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'target',
  '.cache',
  '.turbo',
  'coverage',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

const MAX_ENTRIES = 5000;

export type TreeEntry = {
  path: string;      // relativo al workdir, separador '/' siempre
  name: string;      // nombre del segmento final
  type: 'file' | 'dir';
};

export type TreeResult = {
  ok: true;
  root: string;
  entries: TreeEntry[];
  truncated: boolean;
};

export function listTree(args: {
  workdir: string;
  subPath: string;     // ya validado con resolveSafePath, relativo al workdir
  maxDepth: number;    // 1..6
  includeHidden: boolean;
}): TreeResult {
  const { workdir, subPath, maxDepth, includeHidden } = args;
  const baseAbs = subPath ? pathJoin(workdir, subPath) : workdir;
  if (!existsSync(baseAbs)) {
    return { ok: true, root: workdir, entries: [], truncated: false };
  }
  if (isRepo(workdir)) {
    return treeFromGit({ workdir, subPath, maxDepth, includeHidden });
  }
  return treeFromWalk({ workdir, subPath, maxDepth, includeHidden });
}

// ─── Estrategia git ───────────────────────────────────────────────────────

function treeFromGit(args: {
  workdir: string;
  subPath: string;
  maxDepth: number;
  includeHidden: boolean;
}): TreeResult {
  const { workdir, subPath, maxDepth, includeHidden } = args;
  // -z usa NUL como separator para manejar paths con newlines o espacios.
  const r = git(
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', subPath || '.'],
    workdir,
  );
  if (!r.ok) {
    // Si ls-files falla por cualquier razón (worktree corrupto, repo bare),
    // caemos al walker manual en lugar de devolver error.
    return treeFromWalk(args);
  }
  const dirSet = new Set<string>();
  const fileSet = new Set<string>();
  const subPrefix = subPath ? subPath.replace(/\\/g, '/').replace(/\/+$/, '') : '';
  const baseDepth = subPrefix ? subPrefix.split('/').length : 0;

  for (const raw of r.stdout.split('\0')) {
    if (!raw) continue;
    // git ls-files devuelve paths con '/' (incluso en Windows con configs default).
    const filePath = raw.replace(/\\/g, '/');
    // Filtrar por subPath: si subPath está, solo entradas que empiecen con él.
    if (subPrefix && !filePath.startsWith(subPrefix + '/') && filePath !== subPrefix) {
      continue;
    }
    const segments = filePath.split('/');
    // Profundidad relativa al subPath. depth 1 = hijo directo.
    const relDepth = segments.length - baseDepth;
    if (relDepth < 1 || relDepth > maxDepth) {
      // El archivo está más profundo que maxDepth — solo agregamos los dirs
      // intermedios hasta maxDepth para que el frontend pueda expandir.
    }
    // Hidden filter.
    if (!includeHidden && segments.some((s, idx) => idx >= baseDepth && s.startsWith('.'))) {
      continue;
    }
    // Agregar todos los dirs intermedios hasta maxDepth.
    for (let i = baseDepth + 1; i < segments.length && i - baseDepth <= maxDepth; i++) {
      const dirPath = segments.slice(0, i).join('/');
      if (dirPath) dirSet.add(dirPath);
    }
    // Agregar el archivo si está dentro del maxDepth.
    if (relDepth >= 1 && relDepth <= maxDepth) {
      fileSet.add(filePath);
    }
    if (dirSet.size + fileSet.size > MAX_ENTRIES) break;
  }
  const entries: TreeEntry[] = [];
  for (const dir of dirSet) {
    entries.push({ path: dir, name: dir.split('/').pop() || dir, type: 'dir' });
    if (entries.length >= MAX_ENTRIES) break;
  }
  for (const file of fileSet) {
    if (entries.length >= MAX_ENTRIES) break;
    entries.push({ path: file, name: file.split('/').pop() || file, type: 'file' });
  }
  entries.sort(compareEntries);
  return {
    ok: true,
    root: workdir,
    entries,
    truncated: entries.length >= MAX_ENTRIES,
  };
}

// ─── Estrategia walker manual (no-git) ────────────────────────────────────

function treeFromWalk(args: {
  workdir: string;
  subPath: string;
  maxDepth: number;
  includeHidden: boolean;
}): TreeResult {
  const { workdir, subPath, maxDepth, includeHidden } = args;
  const baseAbs = subPath ? pathJoin(workdir, subPath) : workdir;
  const entries: TreeEntry[] = [];
  let truncated = false;
  function walk(currentAbs: string, currentRel: string, depthLeft: number) {
    if (truncated) return;
    let dirents;
    try {
      dirents = readdirSync(currentAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (entries.length >= MAX_ENTRIES) {
        truncated = true;
        return;
      }
      const name = dirent.name;
      if (!includeHidden && name.startsWith('.')) continue;
      if (dirent.isDirectory() && EXCLUDED_DIRS.has(name)) continue;
      const relPath = currentRel ? `${currentRel}/${name}` : name;
      if (dirent.isDirectory()) {
        entries.push({ path: relPath, name, type: 'dir' });
        if (depthLeft > 1) walk(pathJoin(currentAbs, name), relPath, depthLeft - 1);
      } else if (dirent.isFile()) {
        entries.push({ path: relPath, name, type: 'file' });
      }
      // Symlinks intencionalmente ignorados (la validación de path los
      // bloquea para abrir; en el listado los omitimos para no confundir).
    }
  }
  walk(baseAbs, subPath, maxDepth);
  entries.sort(compareEntries);
  return { ok: true, root: workdir, entries, truncated };
}

// Dirs primero, luego archivos. Dentro del mismo tipo, alfabético case-insensitive.
function compareEntries(a: TreeEntry, b: TreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
}

// Helper para que el handler valide el statSync solo cuando lo necesita.
export function safeStat(abs: string): { size: number; mtimeMs: number } | null {
  try {
    const s = statSync(abs);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}
