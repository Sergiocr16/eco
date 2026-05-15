// Bus simple para eventos transversales de UI disparados por comandos de voz.
// Evita acoplar parser <→ AgentDetail/Settings; los paneles solo escuchan.

export type EcoBusEvents = {
  'eco:scroll': { dir: 'up' | 'down' | 'top' | 'bottom' };
  // `bubbleId` opcional: si viene, SOLO la AgentDetail de esa burbuja
  // reacciona. Sin él (legacy / voz sin contexto), reacciona cualquiera
  // montada. Sin este filtro, con multi-detail keepalive TODAS las
  // AgentDetail montadas cambiaban de tab al mismo tiempo.
  'eco:switch_tab': { tab: 'chat' | 'terminal' | 'git' | 'plan' | 'browser' | 'server'; bubbleId?: string };
  // Cambio de sub-pestaña dentro del tab Git. Las sub-pestañas son
  // "branches" (Ramas), "history" (Historial), "changes" (Cambios pendientes),
  // "stash", "tags", "prs" (Pull requests). Si la AgentDetail está en otra
  // tab, primero hay que dispararle `eco:switch_tab → git`.
  'eco:switch_git_subtab': {
    sub: 'history' | 'changes' | 'prs';
    bubbleId?: string;
  };
  'eco:confirm': { answer: 'yes' | 'no' };
  'eco:wake_detected': { ts: number };
  'eco:dev_status': {
    bubbleId: string;
    role?: 'main' | 'frontend' | 'backend';
    status: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
    url: string;
    command: string;
    skill?: string;
  };
  // Stream de log chunks del dev server. El backend batchea cada ~80ms
  // así que el handler recibe ráfagas grandes, no cada caracter. Cada chunk
  // es texto raw incluyendo escapes ANSI.
  'eco:dev_log': {
    bubbleId: string;
    role: 'main' | 'frontend' | 'backend';
    chunk: string;
  };
  // Pedido al BrowserPanel del agente para cargar una URL específica (por
  // ejemplo desde el ServerPanel cuando el server arranca o el user clickea
  // la URL del server).
  'eco:browser_navigate': { bubbleId: string; url: string };
  // Notifica que la URL del browser de una burbuja cambió (set o cleared).
  // Usado por useBubbleActive para evitar el polling de localStorage.
  'eco:browser_url_changed': { bubbleId: string; hasUrl: boolean };
  // Pedido para refrescar el estado git (branches, status) de una burbuja
  // — emitido por componentes que mutan git por fuera de BranchPicker
  // (ej. checkout de PR).
  'eco:git_refresh': { bubbleId: string };
  // Cambio en el estado "Claude está procesando" del PTY de la burbuja.
  // El backend lo detecta por inactividad del output (1.5 s sin escribir
  // = idle). Se usa para mostrar indicadores visuales y opcionalmente
  // notificar al sistema cuando termina.
  'eco:pty_busy_change': { bubbleId: string; busy: boolean };
};

type EventName = keyof EcoBusEvents;

export function emit<K extends EventName>(name: K, detail: EcoBusEvents[K]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends EventName>(
  name: K,
  handler: (detail: EcoBusEvents[K]) => void,
): () => void {
  if (typeof window === 'undefined') return () => { /* noop */ };
  const listener = (e: Event) => {
    const ce = e as CustomEvent<EcoBusEvents[K]>;
    handler(ce.detail);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
