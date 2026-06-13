import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ecoToken, writeStoredToken, writeStoredRefresh } from '@/lib/eco-config';
import { translateBackendError } from '@/lib/backend-errors';
import { writeProfileUsername } from './useProfile';

const SESSION_KEY = 'eco.session';

export type AuthStatus = 'loading' | 'needs_token' | 'no_user' | 'needs_login' | 'authenticated';
export type Role = 'admin' | 'member';

export type AuthState = {
  status: AuthStatus;
  username: string | null;
  userId: string | null;
  role: Role | null;
  error: string | null;
};

export type RegisterPayload = { username: string; pin: string };
export type LoginPayload = { username: string; pin: string };
export type RecoverPayload = { username: string; recoveryPhrase: string; newPin: string };

export type RegisterResult =
  | { ok: true; username: string; recoveryPhrase: string }
  | { ok: false; error: string };
export type LoginResult = { ok: true; username: string; role: Role } | { ok: false; error: string };
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
  const [state, setState] = useState<AuthState>({ status: 'loading', username: null, userId: null, role: null, error: null });

  const refresh = useCallback(async () => {
    // Web sin bearer token: NADA puede autenticar (todo HTTP y ambos WS lo
    // exigen) — server mode remoto donde el user todavía no pegó el token, o
    // dev web sin VITE_ECO_TOKEN. Pedimos el token antes de tocar la red.
    if (!window.electronAPI && !ecoToken()) {
      setState({ status: 'needs_token', username: null, userId: null, role: null, error: null });
      return;
    }
    try {
      const r = await apiFetch('/auth/status');
      const data = await r.json();
      if (!data.hasUser) {
        setState({ status: 'no_user', username: null, userId: null, role: null, error: null });
        return;
      }
      const session = readSession();
      if (!session) {
        setState({ status: 'needs_login', username: null, userId: null, role: null, error: null });
        return;
      }
      // Verificá la sesión + derivá identidad (username/role) desde el server.
      const r2 = await apiFetch('/auth/me');
      if (r2.status === 401) {
        const d2 = await r2.json().catch(() => null);
        if (d2?.error === 'http.unauthorized' && !window.electronAPI) {
          writeStoredToken(null);
          setState({ status: 'needs_token', username: null, userId: null, role: null, error: null });
          return;
        }
        writeSession(null);
        setState({ status: 'needs_login', username: null, userId: null, role: null, error: null });
        return;
      }
      const me = await r2.json().catch(() => null);
      setState({
        status: 'authenticated',
        username: me?.username ?? null,
        userId: me?.id ?? null,
        role: (me?.role as Role) ?? null,
        error: null,
      });
    } catch (e) {
      setState({ status: 'no_user', username: null, userId: null, role: null, error: e instanceof Error ? e.message : 'Error' });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Sync de sesión entre ventanas (principal y satélites "solo bubble").
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY && e.key !== null) return;
      if (readSession()) {
        void refresh();
      } else {
        setState((s) => ({ ...s, status: s.username ? 'needs_login' : 'no_user' }));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  useEffect(() => { writeProfileUsername(state.username); }, [state.username]);

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
      writeStoredRefresh(data.refresh ?? null);
      // No transicionamos a 'authenticated' acá: la AuthScreen primero muestra
      // la frase de recuperación; el confirm dispara refresh().
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
      writeStoredRefresh(data.refresh ?? null);
      void refresh();
      return { ok: true, username: data.username, role: data.role };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

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
      writeStoredRefresh(data.refresh ?? null);
      return { ok: true, username: data.username, newRecoveryPhrase: data.newRecoveryPhrase };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* noop */ }
    writeSession(null);
    writeStoredRefresh(null);
    setState((s) => ({ ...s, status: 'needs_login' }));
  }, []);

  // Bloquea la pantalla: invalida la sesión local y server pero conserva el
  // usuario. Al desbloquear se pide usuario+PIN (LoginView).
  const lock = logout;

  const destroyUser = useCallback(async (pin: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const r = await apiFetch('/auth/user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await r.json();
      if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
      writeSession(null);
      writeStoredRefresh(null);
      void refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refresh]);

  return { state, refresh, register, login, recover, logout, lock, destroyUser };
}
