// Contexto por-request (AsyncLocalStorage) con la identidad del usuario de la
// sesión. Permite que código profundo (p.ej. los spawns de git en git-ops.ts)
// resuelva "qué usuario es el dueño de esta operación" sin tener que threadear
// un userId por decenas de firmas. Es seguro ante concurrencia: cada request
// HTTP corre dentro de su propio store.
//
// Solo aplica a operaciones disparadas por un request HTTP con sesión. Los
// spawns disparados por WS (agente/PTY/dev) NO tienen este contexto y caen al
// fallback (primer admin) hasta que F2 los taggee con el userId explícito.

import { AsyncLocalStorage } from 'node:async_hooks';

type RequestStore = { userId?: string };

const als = new AsyncLocalStorage<RequestStore>();

export function runWithUser<T>(userId: string | undefined, fn: () => T): T {
  return als.run({ userId }, fn);
}

export function currentUserId(): string | undefined {
  return als.getStore()?.userId;
}
