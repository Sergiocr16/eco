import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';

export type KeyProvider = 'anthropic' | 'openai';

export type ApiKeyState = {
  loading: boolean;
  hasKey: boolean;
  masked: string | null;
  error: string | null;
};

const ENDPOINTS: Record<KeyProvider, string> = {
  anthropic: '/config/api-key',
  openai: '/config/openai-key',
};

export function useApiKey(provider: KeyProvider = 'anthropic') {
  const [state, setState] = useState<ApiKeyState>({
    loading: true, hasKey: false, masked: null, error: null,
  });
  const endpoint = ENDPOINTS[provider];

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await apiFetch(endpoint);
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
  }, [endpoint]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (key: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, validate: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [endpoint, refresh]);

  const remove = useCallback(async () => {
    try {
      await apiFetch(endpoint, { method: 'DELETE' });
      await refresh();
    } catch { /* noop */ }
  }, [endpoint, refresh]);

  return { ...state, refresh, save, remove };
}
