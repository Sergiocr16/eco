import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { homedir } from 'node:os';

function parseWorkspaces(): string[] {
  const raw = process.env.ECO_WORKSPACES ?? process.env.ECO_WORKSPACE ?? `${homedir()}/projects/eco-test`;
  return raw
    .split(',')
    .map((p) => resolve(p.trim()))
    .filter(Boolean);
}

function parseAllowedOrigins(): string[] {
  const def = ['tauri://localhost', 'http://localhost:5173', 'http://127.0.0.1:5173'];
  const raw = process.env.ECO_ALLOWED_ORIGINS;
  if (!raw) return def;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
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
};

export function isAllowedWorkspace(target: string | undefined): boolean {
  if (!target) return false;
  const resolved = resolve(target);
  return config.workspaces.some(
    (allowed) => resolved === allowed || resolved.startsWith(allowed + sep),
  );
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
