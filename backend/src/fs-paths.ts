// Validación de paths para endpoints filesystem nuevos (/fs/tree, /fs/search,
// /file/save, /file/raw). Centraliza el patrón pathResolve + bounds check +
// realpathSync para frenar symlinks que escapen del workdir.
//
// Los endpoints viejos en git-ops.ts mantienen su patrón inline; este helper
// es solo para los nuevos. La unificación queda como cleanup posterior.

import { realpathSync } from 'node:fs';
import { resolve as pathResolve, sep as pathSep } from 'node:path';

export type SafePathResult =
  | { ok: true; abs: string; rel: string }
  | { ok: false; code: SafePathErrorCode; error: string };

export type SafePathErrorCode = 'fs.invalid_path';

// Resuelve un path relativo dentro del workdir asegurando que no escape.
//
// - workdir: ruta absoluta al directorio raíz permitido (worktree o workspace).
// - relPath: ruta relativa al workdir (también acepta absoluta — se valida que
//   caiga dentro igual). String vacía es válida y representa el workdir mismo.
//
// Validaciones:
//   1. Resolver a absoluto.
//   2. El absoluto debe ser === workdir o empezar con workdir + sep.
//   3. Si el path existe físicamente, también se resuelve con realpathSync
//      y se valida que el real esté dentro del realpath del workdir. Esto
//      frena symlinks creados dentro del worktree que apuntan fuera.
//   4. Si el path no existe (caso típico de save de archivo nuevo), se valida
//      con el realpath del directorio padre más cercano que sí exista.
export function resolveSafePath(workdir: string, relPath: string): SafePathResult {
  if (typeof workdir !== 'string' || workdir.length === 0) {
    return { ok: false, code: 'fs.invalid_path', error: 'Workdir vacío' };
  }
  const raw = typeof relPath === 'string' ? relPath : '';
  // Rechazo temprano de bytes nulos (algunos FS los aceptan y pueden truncar).
  if (raw.includes('\0') || workdir.includes('\0')) {
    return { ok: false, code: 'fs.invalid_path', error: 'Path inválido' };
  }
  const wsNorm = pathResolve(workdir);
  const abs = raw ? pathResolve(wsNorm, raw) : wsNorm;
  // Bounds check de strings.
  const inside = abs === wsNorm || abs.startsWith(wsNorm + pathSep);
  if (!inside) {
    return { ok: false, code: 'fs.invalid_path', error: 'Path fuera del workspace' };
  }
  // Realpath check para frenar symlinks que escapen. El workdir se resuelve una
  // vez (típicamente ya es real); el target solo si existe — para paths nuevos
  // (save de archivo no creado) chequeamos el ancestor más cercano que exista.
  let wsReal: string;
  try {
    wsReal = realpathSync(wsNorm);
  } catch {
    // El workdir mismo no existe — error duro.
    return { ok: false, code: 'fs.invalid_path', error: 'Workdir no existe' };
  }
  const realTarget = realpathOrAncestor(abs);
  if (realTarget) {
    const realInside = realTarget === wsReal || realTarget.startsWith(wsReal + pathSep);
    if (!realInside) {
      return { ok: false, code: 'fs.invalid_path', error: 'Path fuera del workspace' };
    }
  }
  const rel = abs === wsNorm ? '' : abs.slice(wsNorm.length + 1);
  return { ok: true, abs, rel };
}

// Devuelve realpathSync del path si existe; si no, sube por el árbol hasta
// encontrar el primer ancestor que exista y devuelve su realpath. Si nada
// existe (workdir borrado por debajo), devuelve null.
function realpathOrAncestor(abs: string): string | null {
  let current = abs;
  while (true) {
    try {
      return realpathSync(current);
    } catch {
      const parent = pathResolve(current, '..');
      if (parent === current) return null;
      current = parent;
    }
  }
}
