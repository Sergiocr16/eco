import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';

export type GithubCredentialsState = {
  loading: boolean;
  hasCredentials: boolean;
  username: string | null;
  email: string | null;
  maskedPat: string | null;
  validatedAt: number | null;
  error: string | null;
};

export type SaveResult =
  | { ok: true }
  // El backend acepta el PAT pero GitHub oculta el email del user. La UI
  // recibe `loginHint` para mostrar "Conectado como X" mientras pide el email.
  | { ok: false; needEmail: true; loginHint?: string }
  | { ok: false; needEmail?: false; error: string };

export function useGithubCredentials() {
  const [state, setState] = useState<GithubCredentialsState>({
    loading: true, hasCredentials: false, username: null, email: null,
    maskedPat: null, validatedAt: null, error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await apiFetch('/config/github');
      const data = await r.json().catch(() => ({}));
      setState({
        loading: false,
        hasCredentials: !!data.hasCredentials,
        username: data.username ?? null,
        email: data.email ?? null,
        maskedPat: data.maskedPat ?? null,
        validatedAt: typeof data.validatedAt === 'number' ? data.validatedAt : null,
        error: null,
      });
    } catch (e) {
      setState({
        loading: false, hasCredentials: false, username: null, email: null,
        maskedPat: null, validatedAt: null,
        error: e instanceof Error ? e.message : 'Error',
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (input: { pat: string; email?: string }): Promise<SaveResult> => {
    try {
      const r = await apiFetch('/config/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: input.pat, ...(input.email ? { email: input.email } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        await refresh();
        return { ok: true };
      }
      // Caso especial: GitHub oculta el email del user → necesitamos que lo
      // ingrese manualmente. El backend responde 400 con `error: 'github.email_required'`.
      if (r.status === 400 && data.error === 'github.email_required') {
        return { ok: false, needEmail: true, loginHint: typeof data.login === 'string' ? data.login : undefined };
      }
      return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

  const remove = useCallback(async () => {
    try {
      await apiFetch('/config/github', { method: 'DELETE' });
      await refresh();
    } catch { /* noop */ }
  }, [refresh]);

  return { ...state, refresh, save, remove };
}
