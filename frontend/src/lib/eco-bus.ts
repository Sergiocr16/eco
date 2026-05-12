// Bus simple para eventos transversales de UI disparados por comandos de voz.
// Evita acoplar parser <→ AgentDetail/Settings; los paneles solo escuchan.

export type EcoBusEvents = {
  'eco:scroll': { dir: 'up' | 'down' | 'top' | 'bottom' };
  'eco:switch_tab': { tab: 'chat' | 'terminal' | 'files' | 'plan' };
  'eco:confirm': { answer: 'yes' | 'no' };
  'eco:wake_detected': { ts: number };
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
