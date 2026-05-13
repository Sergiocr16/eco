// Bus simple para eventos transversales de UI disparados por comandos de voz.
// Evita acoplar parser <→ AgentDetail/Settings; los paneles solo escuchan.

export type EcoBusEvents = {
  'eco:scroll': { dir: 'up' | 'down' | 'top' | 'bottom' };
  'eco:switch_tab': { tab: 'chat' | 'terminal' | 'files' | 'plan' | 'browser' | 'server' };
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
