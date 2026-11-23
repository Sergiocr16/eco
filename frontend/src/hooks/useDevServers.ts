import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit, on as ecoOn } from '@/lib/eco-bus';
import { useWorkspaceServerDefaults } from '@/hooks/useWorkspaceServerDefaults';

export type DevRoleName = 'main' | 'frontend' | 'backend';
export type DevRoleState = { status: string; url: string };
export type DevAction = 'start' | 'stop' | 'restart';

const BACKEND_READY_TIMEOUT_MS = 90_000;
// Tras quedar listo el backend se espera este rato por si el frontend arranca
// detrás (inicio dual): en ese caso la página a abrir es la del frontend.
const FRONTEND_GRACE_MS = 2500;
// El BrowserPanel se monta al mostrarse; su listener tarda un tick en existir.
const NAVIGATE_DELAY_MS = 120;

const isLive = (s: string | undefined) => s === 'running' || s === 'starting';

// Dev servers de la bubble, por rol. Semilla con /dev/active porque el evento
// solo llega cuando el estado cambia.
export function useBubbleDevServers(bubbleId: string): Record<string, DevRoleState> {
  const [roles, setRoles] = useState<Record<string, DevRoleState>>({});
  useEffect(() => {
    let cancelled = false;
    setRoles({});
    void (async () => {
      try {
        const r = await apiFetch('/dev/active');
        if (!r.ok || cancelled) return;
        const data = await r.json() as { sessions?: Array<{ bubbleId: string; role: string; status: string; url?: string }> };
        const seed: Record<string, DevRoleState> = {};
        for (const s of data.sessions ?? []) {
          if (s.bubbleId === bubbleId) seed[s.role] = { status: s.status, url: s.url ?? '' };
        }
        setRoles((prev) => ({ ...seed, ...prev }));
      } catch (e) {
        console.warn('[dev] /dev/active', e);
      }
    })();
    const off = ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubbleId) return;
      setRoles((prev) => ({ ...prev, [d.role ?? 'main']: { status: d.status, url: d.url } }));
    });
    return () => { cancelled = true; off(); };
  }, [bubbleId]);
  return roles;
}

async function postDev(path: string, body: Record<string, unknown>): Promise<void> {
  const r = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string };
  if (!r.ok || data.ok === false) throw new Error(data.error || data.message || `HTTP ${r.status}`);
}

function waitForRunning(bubbleId: string, role: DevRoleName): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => { window.clearTimeout(timer); off(); resolve(ok); };
    const off = ecoOn('eco:dev_status', (e) => {
      if (e.bubbleId !== bubbleId || (e.role ?? 'main') !== role) return;
      if (e.status === 'running') finish(true);
      else if (e.status === 'error' || e.status === 'stopped') finish(false);
    });
    const timer = window.setTimeout(() => finish(false), BACKEND_READY_TIMEOUT_MS);
  });
}

// Encender, apagar y reiniciar los dev servers de una bubble con la config del
// workspace, sin depender de que el ServerPanel esté montado.
export function useDevServerControl(bubbleId: string, workspace: string) {
  const { defaults, hasAny } = useWorkspaceServerDefaults(workspace);
  const roles = useBubbleDevServers(bubbleId);
  const [busy, setBusy] = useState<DevAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const configured: DevRoleName[] = defaults.dual
    ? (['backend', 'frontend'] as const).filter((r) => defaults[r].trim())
    : defaults.main.trim() ? ['main'] : [];
  const statuses = configured.map((r) => roles[r]?.status);
  const status: 'running' | 'starting' | 'error' | 'stopped' =
    statuses.some((s) => s === 'starting') ? 'starting'
    : statuses.some((s) => s === 'running') ? 'running'
    : statuses.some((s) => s === 'error') ? 'error'
    : 'stopped';

  const run = useCallback(async (action: DevAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    try {
      if (action === 'start') {
        // En dual el backend va primero: el proxy del frontend falla si el
        // backend todavía no escucha.
        for (const role of configured) {
          if (isLive(roles[role]?.status)) continue;
          const ready = role === 'backend' && configured.includes('frontend')
            ? waitForRunning(bubbleId, 'backend') : null;
          await postDev('/dev/start', { workspace, bubbleId, command: defaults[role], role });
          if (ready) await ready;
        }
      } else {
        const path = action === 'stop' ? '/dev/stop' : '/dev/restart';
        const targets = configured.filter((r) => {
          const s = roles[r]?.status;
          return isLive(s) || s === 'error';
        });
        await Promise.all(targets.map((role) => postDev(path, { bubbleId, role })));
      }
    } catch (e) {
      console.warn(`[dev] ${action}`, e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, [bubbleId, workspace, defaults, configured.join(','), roles]); // eslint-disable-line react-hooks/exhaustive-deps

  return { configured: hasAny && configured.length > 0, status, roles, busy, error, run };
}

// Cuando un dev server termina de levantar, abre su página en el navegador de
// la bubble. Solo backend → backend; con frontend vivo o en camino → frontend.
export function useAutoOpenDevPage(bubbleId: string) {
  useEffect(() => {
    const last: Record<string, DevRoleState> = {};
    const pending: Record<string, boolean> = {};
    let graceTimer = 0;
    let cancelled = false;
    // Semilla: un frontend que ya corría antes de montar no emite evento.
    void apiFetch('/dev/active').then(async (r) => {
      if (!r.ok || cancelled) return;
      const data = await r.json() as { sessions?: Array<{ bubbleId: string; role: string; status: string; url?: string }> };
      for (const s of data.sessions ?? []) {
        if (s.bubbleId !== bubbleId || last[s.role]) continue;
        last[s.role] = { status: s.status, url: s.url ?? '' };
        if (s.status === 'starting') pending[s.role] = true;
      }
    }).catch((e) => console.warn('[dev] /dev/active', e));
    const open = (url: string) => {
      if (!url) return;
      ecoEmit('eco:switch_tab', { tab: 'browser', bubbleId });
      window.setTimeout(() => ecoEmit('eco:browser_navigate', { bubbleId, url }), NAVIGATE_DELAY_MS);
    };
    const off = ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubbleId) return;
      const role = d.role ?? 'main';
      last[role] = { status: d.status, url: d.url };
      if (d.status !== 'running') { pending[role] = d.status === 'starting'; return; }
      // Solo tras un `starting` visto: el snapshot que el backend repite en
      // cada reconexión del WS llega como `running` a secas. La URL puede
      // llegar en un segundo `running`, cuando el log revela el puerto.
      if (!pending[role] || !d.url) return;
      pending[role] = false;
      if (role !== 'backend') { window.clearTimeout(graceTimer); open(d.url); return; }
      window.clearTimeout(graceTimer);
      graceTimer = window.setTimeout(() => {
        const front = last.frontend;
        if (front?.status === 'starting') return;
        open(front?.status === 'running' ? front.url : last.backend?.url ?? '');
      }, FRONTEND_GRACE_MS);
    });
    return () => { cancelled = true; window.clearTimeout(graceTimer); off(); };
  }, [bubbleId]);
}
