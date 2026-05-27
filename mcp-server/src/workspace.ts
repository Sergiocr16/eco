// Auto-detección del workspace activo a partir del cwd con el que Claude Code
// arrancó este MCP server. La pregunta clave que respondemos:
//   "¿Cuál workspace de Eco contiene la carpeta donde estoy trabajando?"
//
// Lógica:
//   1. cwd = process.cwd() al momento de arrancar el server.
//   2. Pedimos al backend de Eco la lista de workspaces permitidos.
//   3. Devolvemos el primero que sea el cwd o un ancestro suyo.
//   4. Si ninguno matchea, error con la lista para que el user lo agregue
//      desde Settings de Eco.

import { sep } from 'node:path';
import { listWorkspaces } from './client.js';

// Capturado al arranque del proceso. Claude Code spawnea el MCP server con
// el cwd del proyecto donde está corriendo, así que esto refleja "donde está
// trabajando el user ahora mismo".
const STARTUP_CWD = process.cwd();

export function getStartupCwd(): string {
  return STARTUP_CWD;
}

export type WorkspaceResolution =
  | { ok: true; workspace: string; source: 'explicit' | 'cwd_match' | 'none' }
  | { ok: false; error: string; available: string[] };

function isInside(child: string, parent: string): boolean {
  if (!child || !parent) return false;
  if (child === parent) return true;
  return child.startsWith(parent + sep);
}

/**
 * Resuelve el workspace a usar para una operación de creación de bubble.
 *
 * - Si el caller pasó `explicit`, lo devuelve tal cual (el backend igual
 *   valida que esté en la whitelist).
 * - Si no, busca un workspace permitido que sea ancestro del cwd actual.
 * - Si no hay match, devuelve { ok: false } con la lista para que el caller
 *   pueda dar un error útil.
 *
 * Devolver `source: 'none'` con `workspace: ''` es válido cuando el user
 * no pasó workspace y el cwd está fuera de cualquier workspace conocido,
 * PERO también es válido crear una bubble sin workspace (queda flotante,
 * sin worktree). Para ese caso conviene que el caller decida.
 */
export async function resolveWorkspace(
  explicit?: string,
): Promise<WorkspaceResolution> {
  if (explicit) {
    return { ok: true, workspace: explicit, source: 'explicit' };
  }
  let available: string[] = [];
  try {
    available = await listWorkspaces();
  } catch {
    // Si no podemos contactar al backend para listar workspaces, igual
    // dejamos que el caller intente con cwd; el backend lo validará al
    // recibir el POST.
    return { ok: true, workspace: STARTUP_CWD, source: 'cwd_match' };
  }
  // Match exacto o ancestro. Preferimos el match más específico (path más
  // largo) por si hay workspaces anidados.
  const matches = available
    .filter((ws) => isInside(STARTUP_CWD, ws))
    .sort((a, b) => b.length - a.length);
  if (matches.length > 0) {
    return { ok: true, workspace: matches[0]!, source: 'cwd_match' };
  }
  return { ok: false, error: 'cwd_outside_workspaces', available };
}
