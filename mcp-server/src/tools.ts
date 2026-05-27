// Definición + handlers de las tools MCP que el server expone a Claude Code.
// En v1: create_bubble (con initial_prompt opcional) + list_bubbles.
//
// Cada handler retorna `{ content: [{ type: 'text', text: ... }] }` que es
// el formato standard de respuesta de tool MCP. El texto es lo que el modelo
// "lee" tras invocar la tool.

import { z } from 'zod';
import {
  createBubble,
  listBubbles,
  type EcoApiError,
} from './client.js';
import { resolveWorkspace, getStartupCwd } from './workspace.js';

export const CreateBubbleSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe('Título corto y descriptivo del agente (3-6 palabras).'),
  workspace: z
    .string()
    .optional()
    .describe(
      'Path absoluto del workspace donde el agente trabajará. Si se omite, ' +
        'se autodetecta usando el cwd actual de Claude Code y se busca un ' +
        'workspace permitido de Eco que lo contenga.',
    ),
  base_branch: z
    .string()
    .optional()
    .describe('Rama git base desde la cual crear el worktree del agente. Si se omite, parte de HEAD del workspace.'),
  initial_prompt: z
    .string()
    .max(16_000)
    .optional()
    .describe(
      'Mensaje inicial que el agente Claude interno de la nueva bubble ' +
        'procesará automáticamente apenas se crea. Útil para arrancar la ' +
        'conversación con una tarea concreta sin que el usuario tenga que ' +
        'escribirla.',
    ),
});

export type CreateBubbleArgs = z.infer<typeof CreateBubbleSchema>;

function isApiError(e: unknown): e is EcoApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

function friendlyError(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'eco.no_clients') {
      return 'Eco no está abierto. Abrí la app y volvé a intentar.';
    }
    if (e.code === 'workspace.not_allowed') {
      return `Workspace no está en la whitelist de Eco. Agregalo desde Ajustes → Carpetas.`;
    }
    return `Error de Eco (${e.code}): ${e.message}`;
  }
  return `Error: ${e instanceof Error ? e.message : String(e)}`;
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export async function handleCreateBubble(args: CreateBubbleArgs) {
  const wsResolution = await resolveWorkspace(args.workspace);
  if (!wsResolution.ok) {
    const list = wsResolution.available.length > 0
      ? wsResolution.available.map((w) => `  • ${w}`).join('\n')
      : '  (ninguno configurado)';
    return textResult(
      `No se pudo autodetectar workspace.\n` +
        `cwd actual: ${getStartupCwd()}\n\n` +
        `Workspaces permitidos en Eco:\n${list}\n\n` +
        `Solución: pasá \`workspace\` explícito o agregá el directorio padre desde Ajustes → Carpetas en Eco.`,
    );
  }
  try {
    const r = await createBubble({
      title: args.title,
      workspace: wsResolution.workspace || undefined,
      baseBranch: args.base_branch,
      initialPrompt: args.initial_prompt,
    });
    const sourceNote = wsResolution.source === 'cwd_match'
      ? ` (workspace autodetectado desde cwd)`
      : wsResolution.source === 'explicit'
        ? ` (workspace explícito)`
        : '';
    const promptNote = args.initial_prompt
      ? `\n\nPrompt inicial enviado al agente Claude interno de la bubble.`
      : '';
    return textResult(
      `Bubble "${args.title}" creada en Eco.\n` +
        `  id: ${r.bubbleId}\n` +
        `  workspace: ${r.workspace ?? '(sin workspace)'}${sourceNote}\n` +
        `  worktree: ${r.worktreePath ?? '(sin worktree)'}` +
        promptNote,
    );
  } catch (e) {
    return textResult(friendlyError(e));
  }
}

export const ListBubblesSchema = z.object({});

export async function handleListBubbles() {
  try {
    const r = await listBubbles();
    if (r.bubbles.length === 0) {
      if (r.lastSync === 0) {
        return textResult(
          'Eco no ha sincronizado bubbles todavía. Abrí la app al menos una vez con bubbles activas.',
        );
      }
      return textResult('No hay bubbles activas en Eco.');
    }
    const lines = r.bubbles.map((b) => {
      const archived = b.archived ? ' [archivada]' : '';
      const ws = b.workspace || '(sin workspace)';
      return `  • [${b.id}] ${b.title} — status: ${b.status}, workspace: ${ws}${archived}`;
    });
    return textResult(
      `Bubbles en Eco (${r.bubbles.length}):\n${lines.join('\n')}`,
    );
  } catch (e) {
    return textResult(friendlyError(e));
  }
}
