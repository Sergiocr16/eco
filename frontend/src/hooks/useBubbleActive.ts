// "Activo" = el agente está haciendo algo real:
//   - Claude está procesando (thinking / executing / running / pending)
//   - El dev server está corriendo
//   - Hay una página web abierta en el browser del agente
//
// Tener un PTY abierto NO cuenta: un shell idle no es trabajo.
// Tener mensajes viejos en el chat tampoco cuenta.

import { useEffect, useState } from 'react';
import { on as ecoOn } from '@/lib/eco-bus';
import type { Bubble } from '@/lib/types';

function readHasBrowser(bubbleId: string): boolean {
  try { return !!window.localStorage.getItem(`eco.browser.url.${bubbleId}`); }
  catch { return false; }
}

export function useBubbleActive(bubble: Bubble): boolean {
  // Server status por rol — un agente puede tener frontend y backend a la vez.
  // Trackeamos cada rol por separado para que parar uno no apague el otro.
  const [serverRoles, setServerRoles] = useState<Record<string, boolean>>({});
  const serverRunning = Object.values(serverRoles).some(Boolean);
  // Browser — leemos de localStorage al montar y re-checkamos en intervalo
  // corto (no hay un evento global cuando cambia eco.browser.url.*).
  const [hasBrowser, setHasBrowser] = useState<boolean>(() => readHasBrowser(bubble.id));

  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubble.id) return;
      const role = d.role ?? 'main';
      const isRunning = d.status === 'running' || d.status === 'starting';
      setServerRoles((prev) => ({ ...prev, [role]: isRunning }));
    });
  }, [bubble.id]);

  useEffect(() => {
    setHasBrowser(readHasBrowser(bubble.id));
    // En esta misma tab, escuchamos el eco-bus (storage event NO dispara para
    // la propia tab que escribió). Cross-tab (raro acá, pero soportado) se
    // resuelve con el storage event nativo.
    const offBus = ecoOn('eco:browser_url_changed', (e) => {
      if (e.bubbleId !== bubble.id) return;
      setHasBrowser(e.hasUrl);
    });
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === `eco.browser.url.${bubble.id}`) {
        setHasBrowser(!!ev.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      offBus();
      window.removeEventListener('storage', onStorage);
    };
  }, [bubble.id]);

  const claudeBusy =
    bubble.status === 'thinking'
    || bubble.status === 'executing'
    || bubble.status === 'running'
    || bubble.status === 'pending';

  return claudeBusy || serverRunning || hasBrowser;
}
