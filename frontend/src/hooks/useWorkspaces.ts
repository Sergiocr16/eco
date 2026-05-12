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

export function useWorkspaces(): UseWorkspacesResult {
  const [list, setList] = useState<WorkspaceList>({ workspaces: [], fromEnv: [], editable: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch('/workspaces');
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setList({
        workspaces: Array.isArray(data.workspaces) ? data.workspaces : [],
        fromEnv: Array.isArray(data.fromEnv) ? data.fromEnv : [],
        editable: Array.isArray(data.editable) ? data.editable : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = useCallback(async (path: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch('/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

  const remove = useCallback(async (path: string) => {
    try {
      await apiFetch('/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      await refresh();
    } catch { /* noop */ }
  }, [refresh]);

  return { list, loading, error, refresh, add, remove };
}
