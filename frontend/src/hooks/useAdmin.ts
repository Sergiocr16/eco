// Hook de la consola de admin. Lee Firestore directo (gateado por las Security
// Rules de admin) — reemplaza los endpoints /admin/* del backend local, que en
// el modelo multi-tenant solo conocían al usuario de SU máquina. Ahora el admin
// ve a TODO el equipo desde la nube.
//
// Acciones disponibles: cambiar rol (users/{id}.role) y habilitar/deshabilitar
// (users/{id}.disabled). El alta de usuarios es self-service (Firebase Auth), así
// que ya no hay createMember/claim/workspaces/delete acá.

import { useCallback, useState } from 'react';
import {
  collection, getDocs, doc, updateDoc, setDoc, serverTimestamp, query, orderBy, limit as fbLimit,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getDb, getEcoAuth, createUserAsAdmin } from '@/lib/firebase';

export type Role = 'admin' | 'member';

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: Role;
  disabled: boolean;
};

export type OverviewBubble = {
  id: string; title: string; workspace: string; status: string;
  archived: boolean; updatedAt: number; ptyRunning: boolean; devActive: boolean;
  lastMsgPreview?: string; categoryIds?: string[];
};
export type OverviewUser = {
  id: string; username: string; role: Role; lastSync: number; bubbles: OverviewBubble[];
};

export type AuditEventType =
  | 'auth.login' | 'auth.claim' | 'auth.logout'
  | 'bubble.create' | 'bubble.archive' | 'bubble.delete';

export const AUDIT_EVENT_TYPES: AuditEventType[] = [
  'auth.login', 'auth.claim', 'auth.logout',
  'bubble.create', 'bubble.archive', 'bubble.delete',
];

export type AuditEvent = {
  ts: number;
  actorId: string | null;
  actorName: string | null;
  type: AuditEventType;
  workspace?: string;
  bubbleId?: string;
  meta?: Record<string, string | number | boolean>;
};

type ActionResult = { ok: true } | { ok: false; error: string };

function usernameFromDoc(d: Record<string, unknown>, fallback: string): string {
  return (typeof d.displayName === 'string' && d.displayName)
    || (typeof d.email === 'string' && d.email)
    || fallback;
}

export function useAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overview, setOverview] = useState<OverviewUser[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshUsers = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(getDb(), 'users'));
      const out: AdminUser[] = [];
      snap.forEach((d) => {
        const x = d.data();
        out.push({
          id: d.id,
          username: usernameFromDoc(x, d.id),
          email: typeof x.email === 'string' ? x.email : '',
          role: (x.role === 'admin' ? 'admin' : 'member'),
          disabled: !!x.disabled,
        });
      });
      out.sort((a, b) => a.username.localeCompare(b.username));
      setUsers(out);
    } catch { /* sin acceso → vacío */ } finally { setLoading(false); }
  }, []);

  const refreshOverview = useCallback(async () => {
    try {
      const db = getDb();
      const [usersSnap, bubblesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'bubbles')),
      ]);
      const userMap = new Map<string, { username: string; role: Role }>();
      usersSnap.forEach((d) => {
        const x = d.data();
        userMap.set(d.id, { username: usernameFromDoc(x, d.id), role: x.role === 'admin' ? 'admin' : 'member' });
      });
      const byOwner = new Map<string, OverviewBubble[]>();
      bubblesSnap.forEach((d) => {
        const data = d.data();
        const owner = typeof data.ownerId === 'string' ? data.ownerId : null;
        if (!owner) return;
        const v = (data.value ?? {}) as Record<string, unknown>;
        if (v.deleted === true) return;  // ocultos en todos lados
        const arr = byOwner.get(owner) ?? [];
        arr.push({
          id: typeof v.id === 'string' ? v.id : d.id,
          title: typeof v.title === 'string' ? v.title : '—',
          workspace: typeof v.workspace === 'string' ? v.workspace : '',
          status: typeof v.status === 'string' ? v.status : 'idle',
          archived: !!v.archived,
          updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (typeof v.updatedAt === 'number' ? v.updatedAt : 0),
          ptyRunning: false,
          devActive: false,
          lastMsgPreview: typeof v.lastMsgPreview === 'string' ? v.lastMsgPreview : undefined,
          categoryIds: Array.isArray(v.categoryIds) ? v.categoryIds.filter((x): x is string => typeof x === 'string') : undefined,
        });
        byOwner.set(owner, arr);
      });
      const ids = new Set<string>([...userMap.keys(), ...byOwner.keys()]);
      const out: OverviewUser[] = [];
      ids.forEach((id) => {
        const u = userMap.get(id);
        out.push({ id, username: u?.username ?? id, role: u?.role ?? 'member', lastSync: 0, bubbles: byOwner.get(id) ?? [] });
      });
      setOverview(out);
    } catch { /* sin acceso → vacío */ }
  }, []);

  const refreshAudit = useCallback(async (q?: { userId?: string; type?: AuditEventType }) => {
    try {
      const snap = await getDocs(query(collection(getDb(), 'auditLog'), orderBy('ts', 'desc'), fbLimit(200)));
      let evs: AuditEvent[] = [];
      snap.forEach((d) => {
        const x = d.data();
        evs.push({
          ts: typeof x.ts === 'number' ? x.ts : 0,
          actorId: typeof x.ownerId === 'string' ? x.ownerId : null,
          actorName: typeof x.actorName === 'string' ? x.actorName : null,
          type: x.type as AuditEventType,
          workspace: typeof x.workspace === 'string' ? x.workspace : undefined,
          bubbleId: typeof x.bubbleId === 'string' ? x.bubbleId : undefined,
          meta: (x.meta && typeof x.meta === 'object') ? x.meta as AuditEvent['meta'] : undefined,
        });
      });
      if (q?.userId) evs = evs.filter((e) => e.actorId === q.userId);
      if (q?.type) evs = evs.filter((e) => e.type === q.type);
      setAudit(evs);
    } catch { setAudit([]); }
  }, []);

  // Alta de usuario por el admin: crea la cuenta Auth (instancia secundaria, no
  // desloguea al admin) + el doc users/{uid} (rol member). El admin comparte el
  // email + la contraseña temporal; el usuario la cambia después.
  const createUser = useCallback(async (email: string, displayName: string, password: string): Promise<ActionResult> => {
    try {
      const { uid } = await createUserAsAdmin(email, password);
      await setDoc(doc(getDb(), 'users', uid), {
        role: 'member',
        email: email.trim(),
        displayName: displayName.trim() || email.trim().split('@')[0],
        disabled: false,
        createdAt: serverTimestamp(),
      });
      await refreshUsers();
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const msg = code === 'auth/email-already-in-use' ? 'Ese email ya está registrado.'
        : code === 'auth/invalid-email' ? 'Email inválido.'
        : code === 'auth/weak-password' ? 'La contraseña debe tener al menos 6 caracteres.'
        : (e instanceof Error ? e.message : 'Error');
      return { ok: false, error: msg };
    }
  }, [refreshUsers]);

  const setRole = useCallback(async (id: string, role: Role): Promise<ActionResult> => {
    try { await updateDoc(doc(getDb(), 'users', id), { role }); await refreshUsers(); return { ok: true }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Error' }; }
  }, [refreshUsers]);

  const setDisabled = useCallback(async (id: string, disabled: boolean): Promise<ActionResult> => {
    try { await updateDoc(doc(getDb(), 'users', id), { disabled }); await refreshUsers(); return { ok: true }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Error' }; }
  }, [refreshUsers]);

  // Reset de contraseña: Firebase manda un email con link para que el propio
  // usuario defina la nueva (no requiere Admin SDK).
  const sendReset = useCallback(async (email: string): Promise<ActionResult> => {
    try { await sendPasswordResetEmail(getEcoAuth(), email); return { ok: true }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Error' }; }
  }, []);

  return { users, overview, audit, loading, refreshUsers, refreshOverview, refreshAudit, createUser, setRole, setDisabled, sendReset };
}
