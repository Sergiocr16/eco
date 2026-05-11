import {
  query,
  type CanUseTool,
  type Options,
  type Query,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { config, defaultWorkspace, isAllowedWorkspace } from './config.js';

export type AgentRunOptions = {
  prompt: string;
  workspace?: string;
  abortController?: AbortController;
  resumeSessionId?: string;
};

const DANGEROUS_BASH_PATTERNS: RegExp[] = [
  /\brm\s+-rf?\b[^|;]*\s\//,
  /\bsudo\b/,
  /\bchmod\s+-R\s+777\b/,
  /(?:curl|wget)\s+[^|;]*\|\s*(?:sh|bash|zsh|fish)\b/,
  /\bnc\b[^|;]*\s-e\b/,
  /\bdd\b[^|;]*\sof=\/dev\//,
  />\s*\/dev\/(?:sd[a-z]|nvme|disk)/,
  /\bmkfs\b/,
  /:\(\)\s*\{\s*:\|:&\s*\};/,
  /\beval\s+.*\$\(/,
];

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'TodoWrite']);

const canUseTool: CanUseTool = async (toolName, input) => {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return { behavior: 'allow', updatedInput: input };
  }

  if (toolName === 'Bash') {
    const cmd = String((input as { command?: unknown }).command ?? '');
    if (DANGEROUS_BASH_PATTERNS.some((re) => re.test(cmd))) {
      return {
        behavior: 'deny',
        message: `Comando Bash bloqueado por política de seguridad: ${cmd.slice(0, 120)}`,
        interrupt: true,
      };
    }
  }

  return { behavior: 'allow', updatedInput: input };
};

export function runAgent(opts: AgentRunOptions): Query {
  const requested = opts.workspace;
  if (requested && !isAllowedWorkspace(requested)) {
    throw new Error(`Workspace no permitido: ${requested}`);
  }
  const cwd = requested ?? defaultWorkspace();

  const sdkOptions: Options = {
    cwd,
    abortController: opts.abortController,
    pathToClaudeCodeExecutable: config.claudeCliPath,
    model: config.model,
    permissionMode: 'default',
    canUseTool,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    tools: { type: 'preset', preset: 'claude_code' },
    settingSources: ['project', 'user', 'local'],
    includePartialMessages: true,
    env: {
      ...process.env,
      ...(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
    } as Record<string, string>,
    resume: opts.resumeSessionId,
  };

  return query({ prompt: opts.prompt, options: sdkOptions });
}

export type { SDKMessage };
