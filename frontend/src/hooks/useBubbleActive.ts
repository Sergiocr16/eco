// "Activo" = el agente está haciendo algo real o tiene cambios pendientes:
//   - Claude está procesando (thinking / executing / running / pending)
//   - El PTY del agente está emitiendo output (claude --print, gulp, etc.)
//   - El dev server está corriendo
//   - Hay una página web abierta en el browser del agente
//   - Hay archivos modificados sin revisar/commitear
//
// Tener un PTY abierto SIN output reciente NO cuenta: un shell idle no es
// trabajo. Tener mensajes viejos en el chat tampoco cuenta.

import { useEffect, useMemo, useState } from 'react';
import { on as ecoOn } from '@/lib/eco-bus';
import type { Bubble } from '@/lib/types';
import { useBubbleBusy, useBusyBubbleIds } from '@/hooks/usePtyBusyNotifier';
import { peekHasFiles, useFileChangesSubscription, useBubbleHasFilesMap } from '@/hooks/useGitChanges';

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
  const ptyBusy = useBubbleBusy(bubble.id);

  // hasFiles real: leemos del cache global de `git status`. El cache lo
  // mantiene el Dashboard (useBubbleHasFilesMap) y/o la FilesPanel
  // (useGitChanges). Si no hay entry todavía, asumimos `false` — preferimos
  // un falso negativo transitorio a un falso positivo permanente.
  useFileChangesSubscription();
  const hasFiles = bubble.workspace
    ? (peekHasFiles(bubble.workspace, bubble.id) ?? false)
    : false;

  return claudeBusy || ptyBusy || serverRunning || hasBrowser || hasFiles;
}

// ─── Versión collection-level ─────────────────────────────────────────────
// Para componentes que muestran un AGREGADO (ej. el card "Agentes en vivo"
// del Dashboard), queremos el mismo criterio que `useBubbleActive` pero
// aplicado a una lista. Devolvemos el Set de IDs activos — el caller hace
// el count o el filtrado.
export function useActiveBubbleIds(bubbles: Bubble[]): Set<string> {
  // Servers vivos por bubble — listener global del WS event.
  const [serversByBubble, setServersByBubble] = useState<Record<string, Set<string>>>({});
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      const role = d.role ?? 'main';
      const live = d.status === 'running' || d.status === 'starting';
      setServersByBubble((prev) => {
        const cur = new Set(prev[d.bubbleId] ?? []);
        if (live) cur.add(role); else cur.delete(role);
        return { ...prev, [d.bubbleId]: cur };
      });
    });
  }, []);

  // Browsers abiertos por bubble — listener del eco-bus + storage events.
  const [browsersByBubble, setBrowsersByBubble] = useState<Set<string>>(() => {
    const s = new Set<string>();
    try {
      for (const b of bubbles) {
        if (window.localStorage.getItem(`eco.browser.url.${b.id}`)) s.add(b.id);
      }
    } catch { /* noop */ }
    return s;
  });
  useEffect(() => {
    const offBus = ecoOn('eco:browser_url_changed', (e) => {
      setBrowsersByBubble((prev) => {
        const next = new Set(prev);
        if (e.hasUrl) next.add(e.bubbleId); else next.delete(e.bubbleId);
        return next;
      });
    });
    const onStorage = (ev: StorageEvent) => {
      const m = ev.key && /^eco\.browser\.url\.(.+)$/.exec(ev.key);
      if (!m) return;
      const id = m[1]!;
      setBrowsersByBubble((prev) => {
        const next = new Set(prev);
        if (ev.newValue) next.add(id); else next.delete(id);
        return next;
      });
    };
    window.addEventListener('storage', onStorage);
    return () => { offBus(); window.removeEventListener('storage', onStorage); };
  }, []);

  // PTYs procesando — Set global mantenido por usePtyBusyNotifier. Re-render
  // se dispara cada vez que un PTY cambia entre busy / idle.
  const busyPtyIds = useBusyBubbleIds();

  // hasFiles real por bubble — polleo compartido con el Dashboard. Triggerea
  // el fetch periódico de `/file/changes` para cada bubble con workspace.
  const hasFilesMap = useBubbleHasFilesMap(
    bubbles.map((b) => ({ id: b.id, workspace: b.workspace || '' })),
  );

  return useMemo(() => {
    const set = new Set<string>();
    for (const b of bubbles) {
      const claudeBusy =
        b.status === 'thinking' || b.status === 'executing'
        || b.status === 'running' || b.status === 'pending';
      const ptyBusy = busyPtyIds.has(b.id);
      const serverRunning = (serversByBubble[b.id]?.size ?? 0) > 0;
      const hasBrowser = browsersByBubble.has(b.id);
      const hasFiles = hasFilesMap.get(b.id) ?? false;
      if (claudeBusy || ptyBusy || serverRunning || hasBrowser || hasFiles) set.add(b.id);
    }
    return set;
  }, [bubbles, serversByBubble, browsersByBubble, busyPtyIds, hasFilesMap]);
}
