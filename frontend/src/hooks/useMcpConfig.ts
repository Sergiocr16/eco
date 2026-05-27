import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';

export type McpState = {
  loading: boolean;
  binaryAvailable: boolean;
  binaryPath: string;
  claudeAvailable: boolean;
  claudePath: string;
  installed: boolean;
  scope: 'user' | 'project' | 'local' | null;
  error: string | null;
};

const INITIAL: McpState = {
  loading: true,
  binaryAvailable: false, binaryPath: '',
  claudeAvailable: false, claudePath: '',
  installed: false, scope: null,
  error: null,
};

export function useMcpConfig() {
  const [state, setState] = useState<McpState>(INITIAL);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await apiFetch('/config/mcp');
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setState((s) => ({ ...s, loading: false, error: translateBackendError(data, `HTTP ${r.status}`) }));
        return;
      }
      setState({
        loading: false,
        binaryAvailable: !!data.binaryAvailable,
        binaryPath: data.binaryPath ?? '',
        claudeAvailable: !!data.claudeAvailable,
        claudePath: data.claudePath ?? '',
        installed: !!data.installed,
        scope: data.scope ?? null,
        error: null,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Error' }));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const install = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch('/config/mcp', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      }
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

  const uninstall = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch('/config/mcp', { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      }
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

  return { ...state, refresh, install, uninstall };
}
