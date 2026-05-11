import {
  query,
  type CanUseTool,
  type Options,
  type Query,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { config, defaultWorkspace, isAllowedWorkspace, isInsideWorkspace } from './config.js';

export type AgentRunOptions = {
  prompt: string;
  workspace?: string;
  abortController?: AbortController;
  resumeSessionId?: string;
};

const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TMPDIR', 'TEMP', 'TMP', 'USER', 'LOGNAME', 'PWD', 'TERM',
];

function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const v = process.env[key];
    if (v) env[key] = v;
  }
  if (config.anthropicApiKey) env.ANTHROPIC_API_KEY = config.anthropicApiKey;
  return env;
}

const SAFE_READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'TodoWrite']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

export const ALLOWED_TOOL_NAMES: string[] = [
  'Read', 'Grep', 'Glob', 'LS', 'TodoWrite',
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
];

function makeCanUseTool(workspace: string): CanUseTool {
  return async (toolName, input) => {
    if (process.env.ECO_AUDIT_TOOLS) {
      console.error(`[audit] canUseTool: ${toolName} workspace=${workspace}`);
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
      return {
        behavior: 'deny',
        message: 'Bash deshabilitado en este nivel de permisos. Confirmación interactiva pendiente (UI).',
        interrupt: false,
      };
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

  const sdkOptions: Options = {
    cwd,
    abortController: opts.abortController,
    pathToClaudeCodeExecutable: config.claudeCliPath,
    model: config.model,
    permissionMode: 'default',
    canUseTool: makeCanUseTool(cwd),
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
      ].join('\n'),
    },
    tools: ALLOWED_TOOL_NAMES,
    disallowedTools: ['Bash', 'KillBash', 'BashOutput', 'WebFetch', 'WebSearch', 'Task'],
    settingSources: [],
    includePartialMessages: true,
    env: buildSafeEnv() as Record<string, string>,
    resume: opts.resumeSessionId,
  };

  return query({ prompt: opts.prompt, options: sdkOptions });
}

export type { SDKMessage };
