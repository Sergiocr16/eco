// Auto-detección del workspace para la bubble nueva a partir del cwd con
// el que Claude Code arrancó este MCP server.
//
// Tres casos:
//   1. cwd dentro de un worktree de Eco (~/.eco/worktrees/<bubbleId>) →
//      extraemos el bubbleId, miramos /bubbles para conocer el workspace
//      "real" al que pertenece esa burbuja, y usamos ese. Esto cubre el
//      caso "abrí claude dentro de una conversación de Eco" — el user
//      espera que el nuevo agente nazca en aditum-jh, no en $HOME/eco
//      worktrees.
//   2. cwd dentro de un workspace configurado de Eco → matcheamos el más
//      específico (path más largo). El sub-directorio no importa porque
//      git encuentra el repo arriba.
//   3. Ninguno → error con la lista de workspaces disponibles.

import { sep } from 'node:path';
import { homedir } from 'node:os';
import { listWorkspaces, listBubbles } from './client.js';

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
const ECO_WORKTREES_ROOT = `${homedir()}/.eco/worktrees`;

// Si el cwd vive adentro de ~/.eco/worktrees/<bubbleId>/..., extraemos el
// bubbleId. Sino, null.
function extractBubbleIdFromCwd(cwd: string): string | null {
  if (!cwd.startsWith(ECO_WORKTREES_ROOT + sep)) return null;
  const rest = cwd.slice(ECO_WORKTREES_ROOT.length + 1);
  const first = rest.split(sep)[0];
  return first || null;
}

async function resolveFromWorktree(cwd: string): Promise<string | null> {
  const bubbleId = extractBubbleIdFromCwd(cwd);
  if (!bubbleId) return null;
  try {
    const { bubbles } = await listBubbles();
    const b = bubbles.find((x) => x.id === bubbleId);
    if (b && b.workspace) return b.workspace;
  } catch { /* noop */ }
  return null;
}

export async function resolveWorkspace(
  explicit?: string,
): Promise<WorkspaceResolution> {
  if (explicit) {
    return { ok: true, workspace: explicit, source: 'explicit' };
  }

  // Caso 1: estoy adentro de un worktree de Eco → resuelvo al workspace
  // padre de esa burbuja (lo que el user llama "el mismo workspace").
  const fromWorktree = await resolveFromWorktree(STARTUP_CWD);
  if (fromWorktree) {
    return { ok: true, workspace: fromWorktree, source: 'cwd_match' };
  }

  // Caso 2: estoy en un workspace configurado (o sub-dir). Tomamos el match
  // más específico — si workspaces son [/Users/sergio, /Users/sergio/repo],
  // estando en /Users/sergio/repo queremos /Users/sergio/repo, no $HOME.
  let available: string[] = [];
  try {
    available = await listWorkspaces();
  } catch {
    return { ok: true, workspace: STARTUP_CWD, source: 'cwd_match' };
  }
  const matches = available
    .filter((ws) => isInside(STARTUP_CWD, ws))
    .sort((a, b) => b.length - a.length);
  if (matches.length > 0) {
    return { ok: true, workspace: matches[0]!, source: 'cwd_match' };
  }
  return { ok: false, error: 'cwd_outside_workspaces', available };
}
