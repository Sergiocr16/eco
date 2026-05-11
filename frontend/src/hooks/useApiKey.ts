import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type ApiKeyState = {
  loading: boolean;
  hasKey: boolean;
  masked: string | null;
  error: string | null;
};

export function useApiKey() {
  const [state, setState] = useState<ApiKeyState>({
    loading: true, hasKey: false, masked: null, error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await apiFetch('/config/api-key');
      const data = await r.json().catch(() => ({}));
      setState({
        loading: false,
        hasKey: !!data.hasKey,
        masked: data.masked ?? null,
        error: null,
      });
    } catch (e) {
      setState({
        loading: false, hasKey: false, masked: null,
        error: e instanceof Error ? e.message : 'Error',
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (key: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch('/config/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, validate: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: data.error ?? `HTTP ${r.status}` };
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

  const remove = useCallback(async () => {
    try {
      await apiFetch('/config/api-key', { method: 'DELETE' });
      await refresh();
    } catch { /* noop */ }
  }, [refresh]);

  return { ...state, refresh, save, remove };
}
