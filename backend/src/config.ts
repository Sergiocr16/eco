import 'dotenv/config';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { readStore as readWorkspaceStore } from './workspaces-store.js';
import { readApiKey } from './api-key-store.js';

function parseEnvWorkspaces(): string[] {
  // Default: el home del user (existe siempre). Antes era ~/projects/eco-test
  // que rompía el PTY si esa carpeta no existía.
  const raw = process.env.ECO_WORKSPACES ?? process.env.ECO_WORKSPACE ?? homedir();
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const abs = resolve(p);
      try { return realpathSync(abs); } catch { return abs; }
    });
}

function loadWorkspaces(): string[] {
  const env = parseEnvWorkspaces();
  const stored = readWorkspaceStore();
  const combined = [...env, ...stored];
  return Array.from(new Set(combined));
}

function parseAllowedOrigins(): string[] {
  const def = ['tauri://localhost', 'http://localhost:5173', 'http://127.0.0.1:5173'];
  // El propio backend cuando sirve el frontend (Electron empaquetado) carga
  // el renderer desde su mismo origen — hay que aceptarlo automáticamente.
  const host = process.env.ECO_HOST ?? '127.0.0.1';
  const port = process.env.ECO_PORT ?? '7000';
  const scheme = process.env.ECO_TLS_CERT && process.env.ECO_TLS_KEY ? 'https' : 'http';
  const ownOrigins = [
    `${scheme}://${host}:${port}`,
    `${scheme}://localhost:${port}`,
  ];
  const raw = process.env.ECO_ALLOWED_ORIGINS;
  const userList = raw ? raw.split(',').map((o) => o.trim()).filter(Boolean) : def;
  const extraRaw = process.env.ECO_EXTRA_ORIGINS;
  const extra = extraRaw ? extraRaw.split(',').map((o) => o.trim()).filter(Boolean) : [];
  return Array.from(new Set([...userList, ...ownOrigins, ...extra]));
}

function parseAllowedHostnames(): string[] {
  const def = ['127.0.0.1', 'localhost', '[::1]'];
  const raw = process.env.ECO_ALLOWED_HOSTS;
  if (!raw) return def;
  const list = raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...def, ...list]));
}

function parseTlsConfig(): { certPath: string; keyPath: string } | null {
  const certPath = process.env.ECO_TLS_CERT?.trim();
  const keyPath = process.env.ECO_TLS_KEY?.trim();
  if (!certPath || !keyPath) return null;
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    console.warn(`⚠️  ECO_TLS_CERT/KEY apuntan a archivos inexistentes — usando HTTP`);
    return null;
  }
  return { certPath, keyPath };
}

function safeRealpath(target: string): string | null {
  try {
    return realpathSync(resolve(target));
  } catch {
    return null;
  }
}

function parseSkillSources(): Array<'user' | 'project' | 'local'> {
  const raw = process.env.ECO_SKILL_SOURCES ?? 'user,project';
  const allowed = new Set(['user', 'project', 'local']);
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is 'user' | 'project' | 'local' => allowed.has(s));
}

export const config = {
  get workspaces(): string[] { return loadWorkspaces(); },
  port: Number(process.env.ECO_PORT ?? 7000),
  host: process.env.ECO_HOST ?? '127.0.0.1',
  claudeCliPath: process.env.CLAUDE_CLI_PATH ?? `${homedir()}/.local/bin/claude`,
  model: process.env.ECO_MODEL ?? 'claude-sonnet-4-5-20250929',
  get anthropicApiKey(): string | undefined {
    const env = process.env.ANTHROPIC_API_KEY?.trim();
    if (env) return env;
    return readApiKey() ?? undefined;
  },
  allowedOrigins: parseAllowedOrigins(),
  allowedHostnames: parseAllowedHostnames(),
  tls: parseTlsConfig(),
  maxPromptsPerMinute: Number(process.env.ECO_RATE_LIMIT ?? 10),
  maxPromptBytes: Number(process.env.ECO_MAX_PROMPT_BYTES ?? 50_000),
  maxOpenConnections: Number(process.env.ECO_MAX_CONNS ?? 12),
  promptTimeoutMs: Number(process.env.ECO_PROMPT_TIMEOUT_MS ?? 10 * 60 * 1000),
  wsBackpressureBytes: Number(process.env.ECO_WS_BACKPRESSURE ?? 8 * 1024 * 1024),
  skillSources: parseSkillSources(),
};

export function isAllowedWorkspace(target: string | undefined): boolean {
  if (!target || !isAbsolute(target)) return false;
  const real = safeRealpath(target);
  if (!real) return false;
  // Aceptamos worktrees creados por Eco mismo (~/.eco/worktrees/<bubbleId>)
  // como permitidos automáticamente — son derivados de workspaces ya autorizados.
  const ecoWorktreesRoot = `${homedir()}/.eco/worktrees`;
  if (real === ecoWorktreesRoot || real.startsWith(ecoWorktreesRoot + sep)) return true;
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

export function defaultWorkspace(): string | null {
  return loadWorkspaces()[0] ?? null;
}

if (loadWorkspaces().length === 0) {
  console.warn('⚠️  Sin workspaces configurados. Agregá uno desde Ajustes o ECO_WORKSPACES.');
}

if (!existsSync(config.claudeCliPath)) {
  console.warn(`⚠️  No se encontró claude CLI en ${config.claudeCliPath}.`);
}
