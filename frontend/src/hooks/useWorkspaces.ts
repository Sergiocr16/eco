import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';

export type WorkspaceList = {
  workspaces: string[];
  fromEnv: string[];
  editable: string[];
};

export type UseWorkspacesResult = {
  list: WorkspaceList;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (path: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  remove: (path: string) => Promise<void>;
};

// Store a nivel módulo + subscribers (mismo patrón que useCategories): una
// sola fuente de verdad para TODA la app. Sin esto cada useWorkspaces() era
// una instancia aislada que fetcheaba al montar — agregar una carpeta en
// Settings no se reflejaba en el picker de "crear agente" hasta reiniciar.
let sharedList: WorkspaceList = { workspaces: [], fromEnv: [], editable: [] };
let sharedLoading = false;
let sharedError: string | null = null;
// True recién después de un fetch EXITOSO. Mientras sea false, cada consumer
// nuevo que monta reintenta — cubre el caso del primer fetch 401 pre-login
// (el hook de App.tsx monta antes de autenticar; el retry llega cuando el
// Dashboard/pickers montan ya logueados).
let fetchedOk = false;

const subs = new Set<() => void>();
function notify() { for (const fn of subs) { try { fn(); } catch { /* noop */ } } }

async function refreshShared(): Promise<void> {
  sharedLoading = true;
  sharedError = null;
  notify();
  try {
    const r = await apiFetch('/workspaces');
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    sharedList = {
      workspaces: Array.isArray(data.workspaces) ? data.workspaces : [],
      fromEnv: Array.isArray(data.fromEnv) ? data.fromEnv : [],
      editable: Array.isArray(data.editable) ? data.editable : [],
    };
    fetchedOk = true;
  } catch (e) {
    sharedError = e instanceof Error ? e.message : 'Error';
  } finally {
    sharedLoading = false;
    notify();
  }
}

export function useWorkspaces(): UseWorkspacesResult {
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subs.add(fn);
    // Refetch al montar solo si todavía no hubo un fetch exitoso y no hay
    // uno en vuelo — los demás consumers reusan el cache compartido.
    if (!fetchedOk && !sharedLoading) void refreshShared();
    return () => { subs.delete(fn); };
  }, []);

  const refresh = useCallback(() => refreshShared(), []);

  const add = useCallback(async (path: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch('/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      await refreshShared();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, []);

  const remove = useCallback(async (path: string) => {
    try {
      await apiFetch('/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      await refreshShared();
    } catch { /* noop */ }
  }, []);

  return { list: sharedList, loading: sharedLoading, error: sharedError, refresh, add, remove };
}
