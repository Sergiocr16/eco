import { Component, type ErrorInfo, type ReactNode } from 'react';

// Recuperación silenciosa de fallos de arranque/render: en vez de quedar en
// pantalla negra, recargamos una vez. El throttle por timestamp evita un bucle
// de recargas si el fallo es permanente (un crash que se repite al instante).
const RELOAD_GUARD_KEY = 'eco.boot.lastReload';
const RELOAD_THROTTLE_MS = 15_000;

export function bootReloadOnce(): void {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0'); } catch { /* noop */ }
  const now = Date.now();
  if (now - last <= RELOAD_THROTTLE_MS) return;
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(now)); } catch { /* noop */ }
  window.location.reload();
}

type Props = { children: ReactNode };
type State = { crashed: boolean };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[eco] error de render no recuperado:', error, info);
    bootReloadOnce();
  }

  render(): ReactNode {
    // Decisión: recuperación silenciosa — sin UI de error. Mientras la recarga
    // ocurre mostramos nada (momentáneo); si el throttle frena la recarga,
    // queda en blanco como último recurso (el crash quedó logueado arriba).
    return this.state.crashed ? null : this.props.children;
  }
}
