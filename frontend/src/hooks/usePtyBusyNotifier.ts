// Trackea el estado "Claude está procesando" de cada PTY (uno por burbuja)
// y dispara una Notification del sistema cuando termina, si el usuario
// activó el setting `eco.notify.on_finish` y la ventana NO está visible.
//
// El estado por sí solo está expuesto via `useBubbleBusy(bubbleId)` para
// que la UI muestre indicadores visuales sin pedir permiso de notificación.

import { useEffect, useState } from 'react';
import { on as ecoOn } from '@/lib/eco-bus';
import type { Bubble } from '@/lib/types';

const busyByBubble = new Map<string, boolean>();
const subs = new Set<() => void>();
function notify() {
  for (const fn of subs) { try { fn(); } catch { /* noop */ } }
}

function notificationsEnabled(): boolean {
  try { return window.localStorage.getItem('eco.notify.on_finish') === '1'; }
  catch { return false; }
}

let permissionRequested = false;
async function maybeShowDesktopNotification(bubble: Bubble) {
  if (!notificationsEnabled()) return;
  if (typeof Notification === 'undefined') return;
  // Solo notificar si la ventana NO está visible (el user está en otra app).
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  let perm = Notification.permission;
  if (perm === 'default' && !permissionRequested) {
    permissionRequested = true;
    try { perm = await Notification.requestPermission(); } catch { return; }
  }
  if (perm !== 'granted') return;
  try {
    const n = new Notification(`Eco · ${bubble.title}`, {
      body: 'Claude terminó de procesar.',
      tag: `eco-pty-${bubble.id}`,
      silent: false,
    });
    setTimeout(() => { try { n.close(); } catch { /* noop */ } }, 8000);
  } catch { /* noop */ }
}

/**
 * Monta el listener global que actualiza el store + dispara la notificación
 * del sistema al transitar busy → idle. Llamar una sola vez en `App.tsx`.
 */
export function usePtyBusyTracker(bubbles: Bubble[]) {
  useEffect(() => {
    return ecoOn('eco:pty_busy_change', (e) => {
      const prev = busyByBubble.get(e.bubbleId) ?? false;
      busyByBubble.set(e.bubbleId, e.busy);
      notify();
      // Transición busy → idle: Claude terminó. Notificar si corresponde.
      if (prev && !e.busy) {
        const bubble = bubbles.find((b) => b.id === e.bubbleId);
        if (bubble) void maybeShowDesktopNotification(bubble);
      }
    });
  }, [bubbles]);
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
