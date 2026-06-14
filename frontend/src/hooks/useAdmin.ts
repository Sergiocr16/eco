// Hook de la consola de admin: envuelve los endpoints /admin/*. Solo lo usa
// AdminScreen (gated por rol admin en el sidebar + requireAdmin en el backend).

import { useCallback, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { translateBackendError } from '@/lib/backend-errors';

export type Role = 'admin' | 'member';

export type UserStatus = 'pending' | 'active' | 'disabled';

export type AdminUser = {
  id: string;
  username: string;
  role: Role;
  status: UserStatus;
  disabled: boolean;
  workspaceGrants: string[];
};

export type OverviewBubble = {
  id: string; title: string; workspace: string; status: string;
  archived: boolean; updatedAt: number; ptyRunning: boolean; devActive: boolean;
};
export type OverviewUser = {
  id: string; username: string; role: Role; lastSync: number; bubbles: OverviewBubble[];
};

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

async function post<T = undefined>(path: string, body?: unknown): Promise<Result<T>> {
  try {
    const r = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: translateBackendError(data, `HTTP ${r.status}`) };
    return { ok: true, data } as Result<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

export function useAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overview, setOverview] = useState<OverviewUser[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshUsers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/admin/users');
      const d = await r.json().catch(() => null);
      if (r.ok && Array.isArray(d?.users)) setUsers(d.users as AdminUser[]);
    } finally { setLoading(false); }
  }, []);

  const refreshOverview = useCallback(async () => {
    const r = await apiFetch('/admin/overview');
    const d = await r.json().catch(() => null);
    if (r.ok && Array.isArray(d?.users)) setOverview(d.users as OverviewUser[]);
  }, []);

  const createMember = useCallback(async (username: string, role: Role) => {
    const r = await post<{ claimToken: string; user: AdminUser }>('/admin/users', { username, role });
    if (r.ok) await refreshUsers();
    return r;
  }, [refreshUsers]);

  const setRole = useCallback(async (id: string, role: Role) => {
    const r = await post(`/admin/users/${id}/role`, { role });
    if (r.ok) await refreshUsers();
    return r;
  }, [refreshUsers]);

  const setWorkspaces = useCallback(async (id: string, workspaces: string[]) => {
    const r = await post(`/admin/users/${id}/workspaces`, { workspaces });
    if (r.ok) await refreshUsers();
    return r;
  }, [refreshUsers]);

  const issueClaim = useCallback(async (id: string) => {
    return post<{ claimToken: string }>(`/admin/users/${id}/issue-claim`);
  }, []);

  const setDisabled = useCallback(async (id: string, disabled: boolean) => {
    const r = await post(`/admin/users/${id}/disabled`, { disabled });
    if (r.ok) await refreshUsers();
    return r;
  }, [refreshUsers]);

  const deleteUser = useCallback(async (id: string) => {
    try {
      const r = await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false as const, error: translateBackendError(d, `HTTP ${r.status}`) };
      await refreshUsers();
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Error' };
    }
  }, [refreshUsers]);

  return { users, overview, loading, refreshUsers, refreshOverview, createMember, setRole, setWorkspaces, issueClaim, setDisabled, deleteUser };
}
