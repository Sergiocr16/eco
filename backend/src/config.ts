import 'dotenv/config';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { readStore as readWorkspaceStore } from './workspaces-store.js';
import { readApiKey } from './api-key-store.js';
import { getUser, workspaceGrantsFor } from './users-store.js';
import { currentUserId } from './request-context.js';

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
      try { return realpathSync.native(abs); } catch { return abs; }
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
  const ownOrigins = [
    `http://${host}:${port}`,
    `http://localhost:${port}`,
  ];
  const raw = process.env.ECO_ALLOWED_ORIGINS;
  const userList = raw ? raw.split(',').map((o) => o.trim()).filter(Boolean) : def;
  return Array.from(new Set([...userList, ...ownOrigins]));
}

function safeRealpath(target: string): string | null {
  try {
    // .native canonicaliza al case real del filesystem (en macOS APFS
    // case-insensitive). Sin esto, `realpathSync` preserva el case del
    // input y un mismo dir podía verse como dos paths distintos según
    // cómo lo tipearas (Github vs GitHub) → 403 espurios.
    return realpathSync.native(resolve(target));
  } catch {
    return null;
  }
}

function parseExtraHosts(): string[] {
  const raw = process.env.ECO_EXTRA_HOSTS;
  if (!raw) return [];
  return raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
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
  // Hostnames extra aceptados en el host check (HTTP + WS), además de
  // localhost. Para el modo server detrás de Tailscale Serve, que reenvía
  // el Host original (<maquina>.ts.net).
  extraHosts: parseExtraHosts(),
  // Hostname público con el que los clientes remotos alcanzan esta máquina
  // (ej. mimaquina.ts.net). Cuando está seteado, las URLs de dev servers se
  // arman con él y los puertos se exponen vía `tailscale serve`. Solo afecta
  // la URL/exposición — NUNCA la asignación de puertos.
  publicHost: process.env.ECO_PUBLIC_HOST?.trim().toLowerCase() || undefined,
  maxPromptsPerMinute: Number(process.env.ECO_RATE_LIMIT ?? 10),
  maxPromptBytes: Number(process.env.ECO_MAX_PROMPT_BYTES ?? 50_000),
  maxOpenConnections: Number(process.env.ECO_MAX_CONNS ?? 12),
  promptTimeoutMs: Number(process.env.ECO_PROMPT_TIMEOUT_MS ?? 10 * 60 * 1000),
  wsBackpressureBytes: Number(process.env.ECO_WS_BACKPRESSURE ?? 8 * 1024 * 1024),
  skillSources: parseSkillSources(),
};

// Host check único para HTTP y ambos WS. Localhost siempre; hostnames extra
// (modo server vía Tailscale) solo si se configuraron por ECO_EXTRA_HOSTS.
export function hostAllowed(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0]?.toLowerCase();
  if (!hostname) return false;
  if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]') return true;
  return config.extraHosts.includes(hostname);
}

// ACL de workspaces. `userId` opcional:
//  - sin userId → comportamiento global legacy (llamadas internas/ownerless).
//  - admin → todos los workspaces del universo.
//  - member → solo los concedidos por el admin (workspaceGrants).
// Los worktrees de Eco (~/.eco/worktrees/...) se aceptan siempre: son derivados
// de un workspace ya autorizado (la ownership fina por usuario se endurece en F2/F4).
export function isAllowedWorkspace(target: string | undefined, userId?: string): boolean {
  if (!target || !isAbsolute(target)) return false;
  const real = safeRealpath(target);
  if (!real) return false;
  const ecoWorktreesRoot = `${homedir()}/.eco/worktrees`;
  if (real === ecoWorktreesRoot || real.startsWith(ecoWorktreesRoot + sep)) return true;
  const inUniverse = config.workspaces.some(
    (allowed) => real === allowed || real.startsWith(allowed + sep),
  );
  if (!inUniverse) return false;
  // userId explícito, o el del request HTTP en curso (ALS). Sin ninguno (WS sin
  // tagging, startup, MCP) → legacy global allow hasta que F2 lo taggee.
  const uid = userId ?? currentUserId();
  if (!uid) return true;
  const user = getUser(uid);
  if (!user || user.role === 'admin') return true; // admin = todos (user inexistente cae a legacy)
  for (const g of workspaceGrantsFor(uid)) {
    const realGrant = safeRealpath(g) ?? g;
    if (real === realGrant || real.startsWith(realGrant + sep)) return true;
  }
  return false;
}

// Workspaces visibles para un usuario: admin ve todos; member solo los
// concedidos (intersectados con el universo global, normalizados a realpath).
export function workspacesForUser(userId?: string): string[] {
  const universe = config.workspaces;
  const uid = userId ?? currentUserId();
  if (!uid) return universe;
  const user = getUser(uid);
  if (!user || user.role === 'admin') return universe;
  const grantsReal = workspaceGrantsFor(uid).map((g) => safeRealpath(g) ?? g);
  return universe.filter((w) => grantsReal.some((g) => w === g || w.startsWith(g + sep)));
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
