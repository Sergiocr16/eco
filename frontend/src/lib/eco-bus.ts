// Bus simple para eventos transversales de UI disparados por comandos de voz.
// Evita acoplar parser <→ AgentDetail/Settings; los paneles solo escuchan.

export type EcoBusEvents = {
  'eco:scroll': { dir: 'up' | 'down' | 'top' | 'bottom' };
  // `bubbleId` opcional: si viene, SOLO la AgentDetail de esa burbuja
  // reacciona. Sin él (legacy / voz sin contexto), reacciona cualquiera
  // montada. Sin este filtro, con multi-detail keepalive TODAS las
  // AgentDetail montadas cambiaban de tab al mismo tiempo.
  'eco:switch_tab': { tab: 'terminal' | 'git' | 'browser' | 'server' | 'files' | 'notes'; bubbleId?: string };
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
  // Sync cross-device: el backend empujó un cambio de doc del usuario a este
  // dispositivo (otro dispositivo suyo lo modificó). Lo reemite useEcoSocket
  // desde el WS; lo escuchan los stores (useBubbles, useCategories, etc.).
  'eco:doc_updated': { key: string; value: unknown; updatedAt: number };
  'eco:doc_deleted': { key: string };
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
  // Abre el detalle de un PR específico en la sub-pestaña PRs del tab Git.
  // El emisor (ej. GitMiniDock al detectar que la rama actual tiene PR) lo
  // dispara antes/después de un switch_tab → git + switch_git_subtab → prs.
  // PRsView lo escucha y setea su `selected`.
  'eco:open_pr': { bubbleId: string; prNumber: number };
  // Pide al FileTree (virtualizado) scrollear hasta una ruta. Lo emiten los
  // reveals (abrir archivo, breadcrumb): con virtualización los nodos fuera
  // de viewport no están en el DOM para un scrollIntoView directo.
  'eco:files:reveal_path': { path: string };
  // Pide a la tab Archivos que abra un archivo específico. Útil para deep-links
  // desde otras tabs (ej. desde "Cambios" del Git, click en archivo → abrirlo
  // en el editor). El emisor normalmente dispara switch_tab → files antes.
  'eco:files:open_path': { bubbleId: string; path: string };
  // Indicador global de "git ocupado" para una bubble. Lo emiten todas las
  // acciones git (commit, push, pull, fetch, sync, merge PR, close PR) al
  // empezar y al terminar. Un toast flotante muestra qué se está haciendo
  // para que el user sepa que la app no está colgada.
  'eco:git_busy': { bubbleId: string; busy: boolean; kind: string; label?: string };
  // Pide al BrowserPanel del agente crear un nuevo tab. `mode: 'shared'`
  // hereda la partition del tab activo (mismas cookies); `mode: 'isolated'`
  // genera una partition persistente única para login independiente.
  'eco:browser:new_tab': { bubbleId: string; mode: 'shared' | 'isolated' };
  // Cierra el tab activo del BrowserPanel del agente.
  'eco:browser:close_tab': { bubbleId: string };
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
