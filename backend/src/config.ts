import 'dotenv/config';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

function parseWorkspaces(): string[] {
  const raw = process.env.ECO_WORKSPACES ?? process.env.ECO_WORKSPACE ?? `${homedir()}/projects/eco-test`;
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const abs = resolve(p);
      try {
        return realpathSync(abs);
      } catch {
        return abs;
      }
    });
}

function parseAllowedOrigins(): string[] {
  const def = ['tauri://localhost', 'http://localhost:5173', 'http://127.0.0.1:5173'];
  const raw = process.env.ECO_ALLOWED_ORIGINS;
  if (!raw) return def;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function safeRealpath(target: string): string | null {
  try {
    return realpathSync(resolve(target));
  } catch {
    return null;
  }
}

export const config = {
  workspaces: parseWorkspaces(),
  port: Number(process.env.ECO_PORT ?? 7000),
  host: process.env.ECO_HOST ?? '127.0.0.1',
  claudeCliPath: process.env.CLAUDE_CLI_PATH ?? `${homedir()}/.local/bin/claude`,
  model: process.env.ECO_MODEL ?? 'claude-sonnet-4-5-20250929',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim(),
  allowedOrigins: parseAllowedOrigins(),
  maxPromptsPerMinute: Number(process.env.ECO_RATE_LIMIT ?? 10),
  maxPromptBytes: Number(process.env.ECO_MAX_PROMPT_BYTES ?? 50_000),
  maxOpenConnections: Number(process.env.ECO_MAX_CONNS ?? 12),
  promptTimeoutMs: Number(process.env.ECO_PROMPT_TIMEOUT_MS ?? 10 * 60 * 1000),
  wsBackpressureBytes: Number(process.env.ECO_WS_BACKPRESSURE ?? 8 * 1024 * 1024),
};

export function isAllowedWorkspace(target: string | undefined): boolean {
  if (!target || !isAbsolute(target)) return false;
  const real = safeRealpath(target);
  if (!real) return false;
  return config.workspaces.some(
    (allowed) => real === allowed || real.startsWith(allowed + sep),
  );
}

export function isInsideWorkspace(filePath: string | undefined, workspace: string): boolean {
  if (!filePath) return false;
  if (!isAbsolute(filePath)) return false;
  const realWorkspace = safeRealpath(workspace);
  if (!realWorkspace) return false;
  const realPath = safeRealpath(filePath);
  if (realPath) {
    return realPath === realWorkspace || realPath.startsWith(realWorkspace + sep);
  }
  const resolved = resolve(filePath);
  return resolved === realWorkspace || resolved.startsWith(realWorkspace + sep);
}

export function defaultWorkspace(): string {
  return config.workspaces[0]!;
}

if (config.workspaces.length === 0) {
  throw new Error('ECO_WORKSPACES vacío. Configurá al menos un workspace permitido.');
}

if (!existsSync(config.claudeCliPath)) {
  console.warn(`⚠️  No se encontró claude CLI en ${config.claudeCliPath}.`);
}
