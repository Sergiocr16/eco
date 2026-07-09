// Definición + handlers de las tools MCP que el server expone a Claude Code.
// create_bubble (con initial_prompt opcional) + list_bubbles + send_to_bubble.
//
// Cada handler retorna `{ content: [{ type: 'text', text: ... }] }` que es
// el formato standard de respuesta de tool MCP. El texto es lo que el modelo
// "lee" tras invocar la tool.

import { z } from 'zod';
import {
  createBubble,
  listBubbles,
  sendToBubble,
  type EcoApiError,
} from './client.js';
import { resolveWorkspace, getStartupCwd } from './workspace.js';
import { detectHostAgent, type AgentCli } from './host-agent.js';

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
      'Mensaje inicial que el agente interno de la nueva bubble ' +
        'procesará automáticamente apenas se crea. Útil para arrancar la ' +
        'tarea sin que el usuario tenga que escribirla.',
    ),
  agent: z
    .enum(['claude', 'codex'])
    .optional()
    .describe(
      'Qué CLI de agente corre en la terminal de la nueva bubble. Si se omite, '
        + 'hereda el CLI desde el que se invocó esta tool (Claude o Codex). '
        + 'Pasalo explícito solo para forzar uno distinto al del caller.',
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
    if (e.code === 'bubble.not_found') {
      return 'No existe una bubble con ese id. Usá list_bubbles para ver las activas.';
    }
    if (e.code === 'bubble.archived') {
      return 'Esa bubble está archivada. Desarchivala en Eco antes de mandarle input.';
    }
    if (e.code === 'eco.not_synced') {
      return 'Eco no sincronizó bubbles todavía. Abrí la app al menos una vez.';
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
    // Sin `agent` explícito, la bubble hereda el CLI del caller: una tarea
    // lanzada desde Codex sigue en Codex.
    const agent: AgentCli = args.agent ?? detectHostAgent();
    const r = await createBubble({
      title: args.title,
      workspace: wsResolution.workspace || undefined,
      baseBranch: args.base_branch,
      initialPrompt: args.initial_prompt,
      agent,
    });
    const sourceNote = wsResolution.source === 'cwd_match'
      ? ` (workspace autodetectado desde cwd)`
      : wsResolution.source === 'explicit'
        ? ` (workspace explícito)`
        : '';
    const promptNote = args.initial_prompt
      ? `\n\nPrompt inicial enviado al agente ${agent} de la bubble.`
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

export const SendToBubbleSchema = z.object({
  bubble_id: z
    .string()
    .min(1)
    .max(128)
    .describe('Id de la bubble destino — sale de list_bubbles o del resultado de create_bubble.'),
  text: z
    .string()
    .min(1)
    .max(16_000)
    .describe('Prompt a enviar al agente de esa bubble. Se tipea en su terminal como si lo escribiera el usuario.'),
  agent: z
    .enum(['claude', 'codex'])
    .optional()
    .describe('A qué terminal de agente se tipea. Si se omite, hereda el CLI del caller.'),
});

export type SendToBubbleArgs = z.infer<typeof SendToBubbleSchema>;

export async function handleSendToBubble(args: SendToBubbleArgs) {
  try {
    const r = await sendToBubble(args.bubble_id, args.text, args.agent ?? detectHostAgent());
    return textResult(
      `Prompt enviado a la bubble ${r.bubbleId}` +
        (r.workspace ? ` (workspace: ${r.workspace})` : '') +
        `.\nEl agente lo procesa en su terminal — el envío es fire-and-forget, ` +
        `no espera la respuesta del agente.`,
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
