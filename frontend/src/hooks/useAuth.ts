import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';

const SESSION_KEY = 'eco.session';

export type AuthStatus = 'loading' | 'no_user' | 'needs_login' | 'authenticated';

export type AuthState = {
  status: AuthStatus;
  username: string | null;
  error: string | null;
};

export type RegisterPayload = { username: string; pin: string };
export type LoginPayload = { pin: string };
export type RecoverPayload = { recoveryPhrase: string; newPin: string };

export type RegisterResult =
  | { ok: true; username: string; recoveryPhrase: string }
  | { ok: false; error: string };
export type LoginResult = { ok: true; username: string } | { ok: false; error: string };
export type RecoverResult =
  | { ok: true; username: string; newRecoveryPhrase: string }
  | { ok: false; error: string };

function readSession(): string | null {
  try { return window.localStorage.getItem(SESSION_KEY); } catch { return null; }
}
function writeSession(token: string | null) {
  try {
    if (token) window.localStorage.setItem(SESSION_KEY, token);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch { /* noop */ }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', username: null, error: null });

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch('/auth/status');
      const data = await r.json();
      if (!data.hasUser) {
        setState({ status: 'no_user', username: null, error: null });
        return;
      }
      const session = readSession();
      if (!session) {
        setState({ status: 'needs_login', username: data.username, error: null });
        return;
      }
      // Verificá la session pidiendo /info que sí requiere session
      const r2 = await apiFetch('/info');
      if (r2.status === 401) {
        writeSession(null);
        setState({ status: 'needs_login', username: data.username, error: null });
        return;
      }
      setState({ status: 'authenticated', username: data.username, error: null });
    } catch (e) {
      setState({ status: 'no_user', username: null, error: e instanceof Error ? e.message : 'Error' });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const register = useCallback(async (payload: RegisterPayload): Promise<RegisterResult> => {
    try {
      const r = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      writeSession(data.session);
      setState({ status: 'authenticated', username: data.username, error: null });
      return { ok: true, username: data.username, recoveryPhrase: data.recoveryPhrase };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<LoginResult> => {
    try {
      const r = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      writeSession(data.session);
      setState({ status: 'authenticated', username: data.username, error: null });
      return { ok: true, username: data.username };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, []);

  const recover = useCallback(async (payload: RecoverPayload): Promise<RecoverResult> => {
    try {
      const r = await apiFetch('/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      writeSession(data.session);
      setState({ status: 'authenticated', username: data.username, error: null });
      return { ok: true, username: data.username, newRecoveryPhrase: data.newRecoveryPhrase };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* noop */ }
    writeSession(null);
    setState((s) => ({ ...s, status: s.username ? 'needs_login' : 'no_user' }));
  }, []);

  return { state, refresh, register, login, recover, logout };
}
