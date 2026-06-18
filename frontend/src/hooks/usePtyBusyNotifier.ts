// Trackea el estado "Claude está procesando" de cada PTY (uno por burbuja).
// El estado se expone via `useBubbleBusy(bubbleId)` / `useBusyBubbleIds()` para
// los indicadores visuales de la UI. (Las notificaciones del sistema al
// terminar se removieron.)

import { useEffect, useState } from 'react';
import { on as ecoOn } from '@/lib/eco-bus';

const busyByBubble = new Map<string, boolean>();
const subs = new Set<() => void>();
function notify() {
  for (const fn of subs) { try { fn(); } catch { /* noop */ } }
}

/**
 * Monta el listener global que actualiza el store de busy por burbuja.
 * Llamar una sola vez en `App.tsx`.
 */
export function usePtyBusyTracker() {
  useEffect(() => {
    return ecoOn('eco:pty_busy_change', (e) => {
      busyByBubble.set(e.bubbleId, e.busy);
      notify();
    });
  }, []);
}

/**
 * Estado "Claude procesando" del PTY de UNA burbuja. Re-renderiza cuando
 * cambia.
 */
export function useBubbleBusy(bubbleId: string): boolean {
  const [busy, setBusy] = useState<boolean>(busyByBubble.get(bubbleId) ?? false);
  useEffect(() => {
    const fn = () => setBusy(busyByBubble.get(bubbleId) ?? false);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, [bubbleId]);
  return busy;
}

/**
 * IDs de burbujas cuyo PTY está procesando ahora — útil para counts
 * agregados en el Dashboard.
 */
export function useBusyBubbleIds(): Set<string> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  const set = new Set<string>();
  for (const [k, v] of busyByBubble) if (v) set.add(k);
  return set;
}
