import {
  query,
  type CanUseTool,
  type Options,
  type Query,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { config, defaultWorkspace, isAllowedWorkspace, isInsideWorkspace } from './config.js';
import { buildEcoMcpServer, ECO_MCP_TOOL_NAMES, type ClientAction } from './agent-tools.js';
import { buildSafeEnv } from './security.js';

export type AgentRunOptions = {
  prompt: string;
  workspace?: string;
  abortController?: AbortController;
  resumeSessionId?: string;
  onClientAction?: (action: ClientAction) => void;
};

export type { ClientAction };

const SAFE_READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'TodoWrite']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

export const ALLOWED_TOOL_NAMES: string[] = [
  'Read', 'Grep', 'Glob', 'LS', 'TodoWrite',
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'Bash', 'KillBash', 'BashOutput',
  ...ECO_MCP_TOOL_NAMES,
];

function makeCanUseTool(workspace: string): CanUseTool {
  return async (toolName, input) => {
    if (process.env.ECO_AUDIT_TOOLS) {
      console.error(`[audit] canUseTool: ${toolName} workspace=${workspace}`);
    }
    // MCP tools — Eco propias (open_bubble, etc.) y las que el usuario tenga conectadas
    // a través de settingSources (Notion, Obsidian, Pencil, Vercel, etc.).
    // Confiamos en lo que el usuario ya autorizó en su config de Claude Code.
    if (toolName.startsWith('mcp__')) {
      return { behavior: 'allow', updatedInput: input };
    }
    if (SAFE_READ_TOOLS.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    if (WRITE_TOOLS.has(toolName)) {
      const filePath = (input as { file_path?: unknown }).file_path;
      if (typeof filePath !== 'string' || !isInsideWorkspace(filePath, workspace)) {
        return {
          behavior: 'deny',
          message: `Escritura denegada: ${typeof filePath === 'string' ? filePath : '(sin path)'} está fuera del workspace ${workspace}`,
        };
      }
      return { behavior: 'allow', updatedInput: input };
    }

    if (toolName === 'Bash' || toolName === 'KillBash' || toolName === 'BashOutput') {
      return { behavior: 'allow', updatedInput: input };
    }

    if (toolName === 'WebFetch' || toolName === 'WebSearch') {
      return {
        behavior: 'deny',
        message: `${toolName} deshabilitado por política (evitar exfiltración por prompt injection).`,
      };
    }

    if (toolName === 'Task') {
      return {
        behavior: 'deny',
        message: 'Sub-agentes (Task) deshabilitados por política.',
      };
    }

    return {
      behavior: 'deny',
      message: `Tool no permitida: ${toolName}`,
    };
  };
}

export function runAgent(opts: AgentRunOptions): Query {
  const requested = opts.workspace;
  if (requested && !isAllowedWorkspace(requested)) {
    throw new Error('Workspace no permitido.');
  }
  const cwd = requested ?? defaultWorkspace();
  if (!cwd) {
    throw new Error('No hay workspace configurado.');
  }

  const mcpServers = opts.onClientAction
    ? { eco: buildEcoMcpServer({ onClientAction: opts.onClientAction }) }
    : undefined;

  const sdkOptions: Options = {
    cwd,
    abortController: opts.abortController,
    pathToClaudeCodeExecutable: config.claudeCliPath,
    model: config.model,
    // 'acceptEdits' = auto mode: el SDK no espera approval de edits ni de comandos.
    // canUseTool sigue corriendo como gate fino (workspace-bound writes, etc.).
    permissionMode: 'acceptEdits',
    canUseTool: makeCanUseTool(cwd),
    mcpServers,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: [
        'Sos Eco, un asistente de voz en español que corre local en la Mac del usuario.',
        'Estilo de respuesta: extremadamente conciso. El usuario te escucha por voz, así que evitá texto largo.',
        'CRÍTICO: cuando recibas un comando, ANTES de usar cualquier tool, respondé con 1 frase corta confirmando lo que vas a hacer ("Voy a leer X y resumir.", "Buscando Y ahora.", etc.). Solo DESPUÉS usá las tools. Esto le da al usuario feedback inmediato.',
        'No expliques cómo vas a hacer las cosas — hacelas. No pidas confirmaciones innecesarias.',
        'Si una tarea va a tomar varios pasos, mencionalo en una sola frase ("Voy a leer 3 archivos y te resumo."), no enumeres paso por paso.',
        'El resumen final también corto: lo esencial, no análisis exhaustivo.',
        '',
        'BURBUJAS: tenés acceso a tools mcp__eco__open_bubble / rename_bubble / close_bubble que controlan ventanas/conversaciones visuales del usuario.',
        '- Si el usuario pide explícitamente "abrí una nueva burbuja/conversación/ventana/terminal para X", usá open_bubble con un título corto descriptivo (3-6 palabras).',
        '- Después de open_bubble, continuá la tarea en esa nueva burbuja (ya queda activa).',
        '- Si una conversación cambia de tema y el título inicial ya no aplica, podés usar rename_bubble.',
        '- Solo usá close_bubble si el usuario pide cerrar la burbuja.',
        '- Por defecto NO crees burbujas: trabajá en la actual a menos que el usuario lo pida o sea claramente un cambio de contexto.',
      ].join('\n'),
    },
    tools: ALLOWED_TOOL_NAMES,
    disallowedTools: ['WebFetch', 'WebSearch', 'Task'],
    settingSources: config.skillSources,
    includePartialMessages: true,
    env: buildSafeEnv(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}) as Record<string, string>,
    resume: opts.resumeSessionId,
  };

  return query({ prompt: opts.prompt, options: sdkOptions });
}

export type { SDKMessage };
