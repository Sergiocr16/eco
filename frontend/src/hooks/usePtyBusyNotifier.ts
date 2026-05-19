// Trackea el estado "Claude está procesando" de cada PTY (uno por burbuja)
// y dispara una Notification del sistema cuando termina, si el usuario
// activó el setting `eco.notify.on_finish` y la ventana NO está visible.
//
// El estado por sí solo está expuesto via `useBubbleBusy(bubbleId)` para
// que la UI muestre indicadores visuales sin pedir permiso de notificación.

import { useEffect, useRef, useState } from 'react';
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

// Decide si la notificación es relevante: el user no está mirando la
// burbuja que terminó. Casos que disparan notificación:
//   - Ventana oculta (visibilityState !== 'visible')
//   - Ventana visible PERO `activeBubbleId !== bubble.id` (está mirando otra)
function shouldNotify(bubbleId: string, activeBubbleId: string | null): boolean {
  const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
  if (hidden) return true;
  return activeBubbleId !== bubbleId;
}

async function maybeShowDesktopNotification(bubble: Bubble, activeBubbleId: string | null) {
  if (!notificationsEnabled()) return;
  if (!shouldNotify(bubble.id, activeBubbleId)) return;
  const title = `Eco · ${bubble.title}`;
  const body = 'Claude terminó de procesar.';

  // En .dmg empaquetado, la Web Notification API a menudo NO aparece en
  // Notification Center de macOS (la app no está code-signed). Si Electron
  // expone `notify` via preload, usamos esa API que sí funciona unsigned.
  const api = (typeof window !== 'undefined' ? window : undefined)?.electronAPI;
  if (api?.notify) {
    try {
      await api.notify({ title, body, bubbleId: bubble.id, silent: false });
      return;
    } catch { /* fallback abajo */ }
  }

  // Fallback Web Notification (dev en browser).
  if (typeof Notification === 'undefined') return;
  let perm = Notification.permission;
  if (perm === 'default' && !permissionRequested) {
    permissionRequested = true;
    try { perm = await Notification.requestPermission(); } catch { return; }
  }
  if (perm !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
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
export function usePtyBusyTracker(bubbles: Bubble[], activeBubbleId: string | null) {
  // Usamos refs porque `bubbles` y `activeBubbleId` cambian seguido y no
  // queremos re-suscribir al evento cada render — los leemos al momento de
  // la notificación.
  const bubblesRef = useRef(bubbles);
  const activeRef = useRef(activeBubbleId);
  useEffect(() => { bubblesRef.current = bubbles; }, [bubbles]);
  useEffect(() => { activeRef.current = activeBubbleId; }, [activeBubbleId]);

  useEffect(() => {
    return ecoOn('eco:pty_busy_change', (e) => {
      const prev = busyByBubble.get(e.bubbleId) ?? false;
      busyByBubble.set(e.bubbleId, e.busy);
      notify();
      // Transición busy → idle: Claude terminó. Notificar si corresponde.
      if (prev && !e.busy) {
        const bubble = bubblesRef.current.find((b) => b.id === e.bubbleId);
        if (bubble) void maybeShowDesktopNotification(bubble, activeRef.current);
      }
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
