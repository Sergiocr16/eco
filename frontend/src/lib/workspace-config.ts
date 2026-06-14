// Config por workspace (server-authoritative): la define el admin, todos la
// consumen. Reemplaza el viejo localStorage `eco.dev.workspace_defaults.*` y
// `eco.worktree.favorites.*`. Cliente: hidrata al loguear, getters reactivos,
// y save (solo admin → POST). Mismo patrón de store-singleton que useCategories.

import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';

export type WorkspaceServerConfig = {
  dual: boolean;
  main: string;
  frontend: string;
  backend: string;
};
export type WorkspaceConfig = {
  server: WorkspaceServerConfig;
  baseBranches: string; // CSV
};

const EMPTY: WorkspaceConfig = {
  server: { dual: false, main: '', frontend: '', backend: '' },
  baseBranches: '',
};

let cache: Record<string, WorkspaceConfig> = {};
const subs = new Set<() => void>();
function notify() { subs.forEach((f) => f()); }

function normalizeServer(raw: unknown): WorkspaceServerConfig {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    dual: !!s.dual,
    main: typeof s.main === 'string' ? s.main : '',
    frontend: typeof s.frontend === 'string' ? s.frontend : '',
    backend: typeof s.backend === 'string' ? s.backend : '',
  };
}
function normalizeConfig(raw: unknown): WorkspaceConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    server: normalizeServer(c.server),
    baseBranches: typeof c.baseBranches === 'string' ? c.baseBranches : '',
  };
}

/** Hidrata todo el mapa al loguear. */
export async function hydrateWorkspaceConfig(): Promise<void> {
  try {
    const r = await apiFetch('/workspace-config');
    const d = await r.json().catch(() => null);
    if (d?.ok && d.configs && typeof d.configs === 'object') {
      const next: Record<string, WorkspaceConfig> = {};
      for (const [ws, cfg] of Object.entries(d.configs)) next[ws] = normalizeConfig(cfg);
      cache = next;
      notify();
    }
  } catch { /* offline / sin sesión — queda el cache previo */ }
}

export function resetWorkspaceConfig(): void {
  cache = {};
  notify();
}

export function getWorkspaceConfig(workspace: string): WorkspaceConfig {
  return cache[workspace] ?? EMPTY;
}

/** Guarda (solo admin server-side). Devuelve true si aplicó. */
export async function saveWorkspaceConfig(
  workspace: string,
  patch: { server?: Partial<WorkspaceServerConfig>; baseBranches?: string },
): Promise<boolean> {
  try {
    const r = await apiFetch('/workspace-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, ...patch }),
    });
    const d = await r.json().catch(() => null);
    if (d?.ok && d.config) {
      cache = { ...cache, [workspace]: normalizeConfig(d.config) };
      notify();
      return true;
    }
    return false;
  } catch { return false; }
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** Hook reactivo: la config de un workspace (re-renderiza al hidratar/guardar). */
export function useWorkspaceConfig(workspace: string): WorkspaceConfig {
  return useSyncExternalStore(
    subscribe,
    () => getWorkspaceConfig(workspace),
    () => EMPTY,
  );
}
