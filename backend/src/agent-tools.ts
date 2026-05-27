import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export type ClientAction =
  | {
      kind: 'open_bubble';
      id: string;
      title: string;
      focus: boolean;
      // Opcionales: presentes cuando la acción viene del MCP server externo
      // (HTTP /bubble/create). El agent tool interno los omite y el frontend
      // cae al default del usuario para el workspace.
      workspace?: string;
      baseBranch?: string;
    }
  | { kind: 'rename_bubble'; title: string }
  | { kind: 'close_bubble' };

export type AgentToolDeps = {
  onClientAction: (action: ClientAction) => void;
};

export function buildEcoMcpServer(deps: AgentToolDeps): McpSdkServerConfigWithInstance {
  const openBubble = tool(
    'open_bubble',
    'Abre una nueva burbuja/conversación visual para el usuario, separada de la actual. Usá esta tool cuando el usuario pida explícitamente una nueva conversación, terminal, ventana o burbuja, o cuando convenga separar contextos (ej: investigación paralela, debugging aparte). NO la uses por trivialidades — el usuario debe haberla pedido o el contexto ser claramente nuevo.',
    {
      title: z
        .string()
        .min(1)
        .max(80)
        .describe('Título corto y descriptivo de la burbuja (3-6 palabras). Ej: "Investigar bug auth", "Refactor de pagos"'),
      focus: z
        .boolean()
        .optional()
        .describe('Si true, la burbuja nueva queda activa y la pregunta del usuario se procesa ahí. Default: true.'),
    },
    async (args) => {
      const id = randomUUID();
      const focus = args.focus !== false;
      deps.onClientAction({ kind: 'open_bubble', id, title: args.title, focus });
      return {
        content: [
          {
            type: 'text',
            text: `Burbuja "${args.title}" abierta${focus ? ' y activa' : ''}.`,
          },
        ],
      };
    },
  );

  const renameBubble = tool(
    'rename_bubble',
    'Renombra la burbuja activa. Útil cuando el tema de la conversación se aclara y el título inicial ya no representa bien el contenido.',
    {
      title: z.string().min(1).max(80).describe('Nuevo título (3-6 palabras).'),
    },
    async (args) => {
      deps.onClientAction({ kind: 'rename_bubble', title: args.title });
      return {
        content: [{ type: 'text', text: `Burbuja renombrada a "${args.title}".` }],
      };
    },
  );

  const closeBubble = tool(
    'close_bubble',
    'Cierra la burbuja activa. SOLO cuando el usuario pida cerrarla explícitamente.',
    {},
    async () => {
      deps.onClientAction({ kind: 'close_bubble' });
      return {
        content: [{ type: 'text', text: 'Burbuja cerrada.' }],
      };
    },
  );

  return createSdkMcpServer({
    name: 'eco',
    version: '0.1.0',
    tools: [openBubble, renameBubble, closeBubble],
  });
}

export const ECO_MCP_TOOL_NAMES = [
  'mcp__eco__open_bubble',
  'mcp__eco__rename_bubble',
  'mcp__eco__close_bubble',
];
