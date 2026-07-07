// Config por workspace definida por el ADMIN y leída por todos (multi-tenant).
// A diferencia de los docs por-usuario, esto es estado compartido del anfitrión:
//   - server: comando(s) de dev server por workspace (single/dual).
//   - baseBranches: ramas base favoritas (CSV) para crear worktrees.
// El member NO la edita — solo la consume (iniciar/detener server, elegir rama).
//
// Persistido en ~/.eco/workspace-config.json (chmod 600), keyed por path absoluto.

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ECO_DIR = join(homedir(), '.eco');
const STORE_PATH = join(ECO_DIR, 'workspace-config.json');

export type WorkspaceServerConfig = {
  dual: boolean;
  main: string;
  frontend: string;
  backend: string;
  // Variables extra que se inyectan al spawn de cada dev server del workspace.
  // Las vars propias de Eco (PORT, HOST, etc.) se aplican después y ganan.
  env: Record<string, string>;
};
export type WorkspaceConfig = {
  server: WorkspaceServerConfig;
  baseBranches: string; // CSV
};

const EMPTY_SERVER: WorkspaceServerConfig = { dual: false, main: '', frontend: '', backend: '', env: {} };
const EMPTY: WorkspaceConfig = { server: { ...EMPTY_SERVER }, baseBranches: '' };

type Store = Record<string, WorkspaceConfig>;

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_MAX_VARS = 50;
const ENV_MAX_VALUE = 4000;

function normalizeEnv(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= ENV_MAX_VARS) break;
    if (typeof v !== 'string') continue;
    const key = k.trim();
    if (!key || key.length > 64 || !ENV_KEY_RE.test(key)) continue;
    // ECO_* configura a Eco mismo; como extras de buildSafeEnv bypasearían el denylist.
    if (key.startsWith('ECO_')) continue;
    out[key] = v.slice(0, ENV_MAX_VALUE);
  }
  return out;
}

function normalizeServer(raw: unknown): WorkspaceServerConfig {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    dual: !!s.dual,
    main: typeof s.main === 'string' ? s.main : '',
    frontend: typeof s.frontend === 'string' ? s.frontend : '',
    backend: typeof s.backend === 'string' ? s.backend : '',
    env: normalizeEnv(s.env),
  };
}
function normalizeConfig(raw: unknown): WorkspaceConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    server: normalizeServer(c.server),
    baseBranches: typeof c.baseBranches === 'string' ? c.baseBranches : '',
  };
}

function readStore(): Store {
  if (!existsSync(STORE_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as Record<string, unknown>;
    const out: Store = {};
    for (const [ws, cfg] of Object.entries(parsed)) out[ws] = normalizeConfig(cfg);
    return out;
  } catch { return {}; }
}

function writeStore(store: Store): void {
  if (!existsSync(ECO_DIR)) mkdirSync(ECO_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  try { chmodSync(STORE_PATH, 0o600); } catch { /* noop */ }
}

/** Toda la config; opcionalmente filtrada a un set de workspaces visibles. */
export function readAll(visibleWorkspaces?: string[]): Store {
  const store = readStore();
  if (!visibleWorkspaces) return store;
  const allow = new Set(visibleWorkspaces);
  const out: Store = {};
  for (const [ws, cfg] of Object.entries(store)) if (allow.has(ws)) out[ws] = cfg;
  return out;
}

export function getFor(workspace: string): WorkspaceConfig {
  return readStore()[workspace] ?? { ...EMPTY, server: { ...EMPTY_SERVER } };
}

/** Merge parcial (admin). Si la config queda totalmente vacía, borra la entrada. */
export function setFor(
  workspace: string,
  patch: { server?: Partial<WorkspaceServerConfig>; baseBranches?: string },
): WorkspaceConfig {
  const store = readStore();
  const current = store[workspace] ?? { ...EMPTY, server: { ...EMPTY_SERVER } };
  const next: WorkspaceConfig = {
    server: patch.server ? normalizeServer({ ...current.server, ...patch.server }) : current.server,
    baseBranches: typeof patch.baseBranches === 'string' ? patch.baseBranches.trim() : current.baseBranches,
  };
  const isEmpty = !next.server.dual && !next.server.main && !next.server.frontend
    && !next.server.backend && Object.keys(next.server.env).length === 0 && !next.baseBranches;
  if (isEmpty) delete store[workspace];
  else store[workspace] = next;
  writeStore(store);
  return next;
}
