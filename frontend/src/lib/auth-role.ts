// Rol del usuario logueado, como singleton de módulo + suscripción — para que
// componentes profundos (ServerPanel, NameAgentDialog) sepan si es admin sin
// prop-drilling. App lo setea desde auth.state.role al hidratar.

import { useSyncExternalStore } from 'react';

export type Role = 'admin' | 'member' | null;

let role: Role = null;
const subs = new Set<() => void>();

export function setRole(r: Role): void {
  if (r === role) return;
  role = r;
  subs.forEach((f) => f());
}
export function getRole(): Role { return role; }
export function isAdmin(): boolean { return role === 'admin'; }

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function useRole(): Role {
  return useSyncExternalStore(subscribe, getRole, () => null);
}
export function useIsAdmin(): boolean {
  return useRole() === 'admin';
}
