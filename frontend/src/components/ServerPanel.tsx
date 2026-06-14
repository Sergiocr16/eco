// Panel de control del dev server por agente — separado del navegador
// porque son cosas distintas (proceso vs página). Cuando el server arranca,
// el panel Navegador se navega automáticamente a la URL emitida.
//
// El usuario define el comando bash directo. Eco le pasa un $PORT único.
// Admite "dual" — frontend + backend corriendo en paralelo con logs
// separados, gestionados como dos sesiones independientes vía el rol
// pasado a /dev/start /dev/stop /dev/restart.

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTokens } from '@/design/theme';
import {
  IconPlay, IconStop, IconResume, IconCpu, IconAlert,
  IconTrash, IconSettings, IconChevD, IconChevR, IconExt, IconGlobe,
} from '@/design/icons';
import { Glass, Btn } from '@/design/primitives';
import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useWorkspaceServerDefaults } from '@/hooks/useWorkspaceServerDefaults';
import { useIsAdmin } from '@/lib/auth-role';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { ecoToken } from '@/lib/eco-config';
import { useT } from '@/hooks/useI18n';

type Status = 'idle' | 'starting' | 'running' | 'stopped' | 'error';
type SlotRole = 'main' | 'frontend' | 'backend';
// Qué reinicia el botón global "Reiniciar servidor" cuando hay dos slots.
type RestartMode = 'both' | 'frontend' | 'backend';

type DevStatusEvent = {
  bubbleId: string;
  role?: SlotRole;
  status: Status;
  port?: number;
  url?: string;
  command?: string;
  exitCode?: number;
  skill?: string;
};


type SlotState = {
  status: Status;
  url: string;
  command: string;
  actionBusy: 'start' | 'stop' | 'restart' | null;
  actionError: string | null;
};

const initSlot = (): SlotState => ({
  status: 'idle', url: '', command: '',
  actionBusy: null, actionError: null,
});

export function ServerPanel({ bubbleId, workspace, visible }: { bubbleId: string; workspace: string; visible?: boolean }) {
  const t = useTokens();
  const tr = useT();
  const isAdmin = useIsAdmin();
  const wsDefaults = useWorkspaceServerDefaults(workspace);

  // El modo single/dual lo define la config del workspace (admin). Read-only acá.
  const dual = wsDefaults.defaults.dual;

  // ¿Está colapsada la sección de configuración? Persistido por agente.
  // Default: colapsado (la mayoría del tiempo el user solo quiere mirar logs).
  const CFG_KEY = `eco.dev.config_collapsed.${bubbleId}`;
  const [configCollapsed, setConfigCollapsedState] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(CFG_KEY);
      // Si nunca lo tocó (null), arranca colapsado. Si lo guardó como '0', expandido.
      return raw === null ? true : raw === '1';
    } catch { return true; }
  });
  const setConfigCollapsed = (v: boolean) => {
    setConfigCollapsedState(v);
    try { window.localStorage.setItem(CFG_KEY, v ? '1' : '0'); } catch { /* noop */ }
  };

  // Estado de minimización por slot (solo aplica en dual mode).
  const MIN_KEY = (role: SlotRole) => `eco.dev.min.${role}.${bubbleId}`;
  const [minFront, setMinFront] = useState<boolean>(() => {
    try { return window.localStorage.getItem(MIN_KEY('frontend')) === '1'; } catch { return false; }
  });
  const [minBack, setMinBack] = useState<boolean>(() => {
    try { return window.localStorage.getItem(MIN_KEY('backend')) === '1'; } catch { return false; }
  });
  const setMin = (role: 'frontend' | 'backend', v: boolean) => {
    if (role === 'frontend') setMinFront(v); else setMinBack(v);
    try { window.localStorage.setItem(MIN_KEY(role), v ? '1' : '0'); } catch { /* noop */ }
  };

  // Qué reinicia el botón global "Reiniciar servidor" en dual mode. Persistido
  // por agente. Default: ambos. Cada slot igual se puede reiniciar solo desde
  // su botón en el header.
  const RESTART_MODE_KEY = `eco.dev.restartmode.${bubbleId}`;
  const [restartMode, setRestartModeState] = useState<RestartMode>(() => {
    try {
      const raw = window.localStorage.getItem(RESTART_MODE_KEY);
      return raw === 'frontend' || raw === 'backend' ? raw : 'both';
    } catch { return 'both'; }
  });
  const setRestartMode = (v: RestartMode) => {
    setRestartModeState(v);
    try { window.localStorage.setItem(RESTART_MODE_KEY, v); } catch { /* noop */ }
  };

  // Comandos definidos por el admin en la config del workspace. Read-only acá.
  const cmdMain = wsDefaults.defaults.main;
  const cmdFrontend = wsDefaults.defaults.frontend;
  const cmdBackend = wsDefaults.defaults.backend;
  function cmdFor(role: SlotRole): string {
    if (role === 'main') return cmdMain;
    if (role === 'frontend') return cmdFrontend;
    return cmdBackend;
  }

  // Estado por slot (uno o dos slots).
  const [slots, setSlots] = useState<Record<SlotRole, SlotState>>({
    main: initSlot(),
    frontend: initSlot(),
    backend: initSlot(),
  });
  // Ref espejo de slots para leer el estado actual desde callbacks async sin
  // capturarlo en clausuras viejas.
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  const updateSlot = (role: SlotRole, patch: Partial<SlotState>) => {
    setSlots((p) => ({ ...p, [role]: { ...p[role], ...patch } }));
  };

  // Status inicial al montar para cada rol relevante.
  useEffect(() => {
    let cancelled = false;
    const rolesToCheck: SlotRole[] = !dual ? ['main'] : ['frontend', 'backend'];
    (async () => {
      for (const role of rolesToCheck) {
        try {
          const r = await apiFetch(`/dev/status?bubbleId=${encodeURIComponent(bubbleId)}&role=${role}`);
          if (!r.ok || cancelled) continue;
          const data = await r.json();
          updateSlot(role, { status: data.status, url: data.url ?? '', command: data.command ?? '' });
        } catch { /* noop */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId, dual]);

  // Stream de status vía WS. NO emitimos browser_navigate desde acá — el
  // BrowserPanel tiene su propio listener de dev_status con guard contra
  // navegación duplicada (lastAutoNavRef). Si emitiéramos acá sin guard, cada
  // WS push del backend bumparía el refreshKey del BrowserPanel y recrearía
  // el webview en loop.
  useEffect(() => {
    return ecoOn('eco:dev_status', (e: DevStatusEvent) => {
      if (e.bubbleId !== bubbleId) return;
      const role = (e.role ?? 'main') as SlotRole;
      updateSlot(role, {
        status: e.status,
        url: e.url ?? '',
        command: e.command ?? '',
      });
    });
  }, [bubbleId]);

  // El stream de logs (snapshot GET + eco:dev_log + clear-on-starting) vive
  // dentro de cada LogsPane — así un dev server ruidoso solo re-renderiza ese
  // panel chico, NO todo el ServerPanel (que era lo que hacía lagear la UI).

  // Helpers de fetch.
  async function postWithRetry(path: string, body: Record<string, unknown>): Promise<Response> {
    const doFetch = async () => {
      const ctl = new AbortController();
      const timer = window.setTimeout(() => ctl.abort(), 60_000);
      try {
        return await apiFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }
    };
    try { return await doFetch(); }
    catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/failed to fetch|network|TypeError|aborted/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 1500));
        return await doFetch();
      }
      throw e;
    }
  }

  // Guard sincrónico contra doble-click: el setState de actionBusy es async,
  // pero el onClick del botón se ejecuta antes del próximo render. Si el user
  // clickea rápido dos veces, ambas invocaciones pueden pasar el check del
  // disabled (que viene del state, atrasado). Este ref bloquea al instante.
  const actionInFlightRef = useRef<Record<SlotRole, boolean>>({
    main: false, frontend: false, backend: false,
  });

  async function runActionForRole(role: SlotRole, action: 'up' | 'down' | 'restart') {
    if (actionInFlightRef.current[role]) return;  // doble-click guard
    actionInFlightRef.current[role] = true;
    // Update optimista del status para feedback inmediato. El stream
    // `dev_status` lo va a sobreescribir con el estado real (running/stopped/error)
    // cuando el backend confirme — pero mientras tanto el user ve que SU click
    // se procesó.
    const optimisticStatus: Status | undefined =
      action === 'up' ? 'starting'
      : action === 'down' ? 'stopped'
      : 'starting'; // restart: lo tratamos como starting hasta que confirme
    updateSlot(role, {
      actionError: null,
      actionBusy: action === 'up' ? 'start' : action === 'down' ? 'stop' : 'restart',
      ...(optimisticStatus ? { status: optimisticStatus } : {}),
    });
    try {
      let r: Response;
      if (action === 'up') {
        const cmd = cmdFor(role);
        if (!cmd.trim()) {
          updateSlot(role, { actionError: 'Definí el comando para iniciar.', actionBusy: null, status: 'idle' });
          return;
        }
        r = await postWithRetry('/dev/start', { workspace, bubbleId, command: cmd, role });
      } else if (action === 'down') {
        r = await postWithRetry('/dev/stop', { bubbleId, role });
      } else {
        r = await postWithRetry('/dev/restart', { bubbleId, role });
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        updateSlot(role, { actionError: data.error || data.message || `HTTP ${r.status}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de red';
      if (/failed to fetch|network|TypeError/i.test(msg)) {
        updateSlot(role, { actionError: 'No se pudo contactar Eco. Reintentá en unos segundos.' });
      } else if (/aborted|timeout/i.test(msg)) {
        updateSlot(role, { actionError: 'La operación tardó más de 60s. Revisá el status.' });
      } else {
        updateSlot(role, { actionError: msg });
      }
    } finally {
      updateSlot(role, { actionBusy: null });
      actionInFlightRef.current[role] = false;
    }
  }

  // Espera a que el slot `role` reporte status=running, o falle. Resuelve
  // booleano (true si llegó a running). Timeout para no quedar colgado si
  // el backend nunca arranca o nunca pinta el log "Started on port ...".
  function waitForRoleRunning(role: SlotRole, timeoutMs = 90_000): Promise<boolean> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      // Si ya está running, salimos inmediato.
      if (slotsRef.current[role].status === 'running') { resolve(true); return; }
      const off = ecoOn('eco:dev_status', (e: DevStatusEvent) => {
        if (e.bubbleId !== bubbleId) return;
        const r = (e.role ?? 'main') as SlotRole;
        if (r !== role) return;
        if (e.status === 'running') { off(); resolve(true); }
        else if (e.status === 'error' || e.status === 'stopped') { off(); resolve(false); }
        else if (Date.now() - startedAt > timeoutMs) { off(); resolve(false); }
      });
      const timer = window.setTimeout(() => { off(); resolve(false); }, timeoutMs);
      void timer; // el off del ecoOn maneja la limpieza también.
    });
  }

  async function runAllAction(action: 'up' | 'down' | 'restart') {
    if (!dual) { return runActionForRole('main', action); }

    // Dual + 'up': el backend va primero. Esperamos a que esté running (port
    // detectado en el log) antes de largar el frontend. Esto evita los
    // ECONNREFUSED de proxies como gulp/browser-sync que apuntan al backend
    // y se vuelven locos si el backend todavía no escucha.
    if (action === 'up') {
      await runActionForRole('backend', 'up');
      await waitForRoleRunning('backend');
      await runActionForRole('frontend', 'up');
      return;
    }

    // 'restart' respeta el setting "Al reiniciar": el user puede pedir que el
    // botón global reinicie solo un slot.
    if (action === 'restart' && restartMode !== 'both') {
      return runActionForRole(restartMode, 'restart');
    }

    // 'down' y 'restart' (ambos): los corremos en paralelo, no hay dependencia.
    // Para 'restart' técnicamente el frontend podría fallar si lo bajamos y
    // levantamos antes que el backend, pero como el backend se reinicia en
    // paralelo, en pocos segundos vuelve a estar — y el proxy reintentará.
    await Promise.all([
      runActionForRole('frontend', action),
      runActionForRole('backend', action),
    ]);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* Header con estado(s) */}
        <PanelHeader
          dual={dual}
          slots={slots}
          bubbleId={bubbleId}
          onRestartRole={(role) => void runActionForRole(role, 'restart')}
        />

        {/* Botones de acción globales — corren ambos slots en dual */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(() => {
            const activeRoles: SlotRole[] = !dual ? ['main'] : ['frontend', 'backend'];
            const anyRunning = activeRoles.some((r) => slots[r].status === 'running' || slots[r].status === 'starting');
            const anyStoppable = activeRoles.some((r) => slots[r].status === 'running' || slots[r].status === 'starting' || slots[r].status === 'error');
            const anyBusy = activeRoles.some((r) => !!slots[r].actionBusy);
            const startLabel = 'Iniciar servidor';
            const restartLabel = dual && restartMode === 'frontend' ? 'Reiniciar frontend'
              : dual && restartMode === 'backend' ? 'Reiniciar backend'
              : 'Reiniciar servidor';
            const stopLabel = 'Detener servidor';
            // Identificamos cuál es la acción en curso (si la hay) para
            // mostrar "Iniciando…/Reiniciando…/Deteniendo…" en el botón
            // correcto en vez de "Trabajando…" en el primero solo.
            const busyAction = activeRoles
              .map((r) => slots[r].actionBusy)
              .find(Boolean) as 'start' | 'stop' | 'restart' | undefined;
            return (
              <>
                <Btn kind="primary" size="md" onClick={() => void runAllAction('up')}
                  disabled={anyBusy || anyRunning} icon={IconPlay}>
                  {busyAction === 'start' ? 'Iniciando…' : startLabel}
                </Btn>
                <Btn kind="secondary" size="md" onClick={() => void runAllAction('restart')}
                  disabled={anyBusy} icon={IconResume}>
                  {busyAction === 'restart' ? 'Reiniciando…' : restartLabel}
                </Btn>
                <Btn kind="danger" size="md" onClick={() => void runAllAction('down')}
                  disabled={anyBusy || !anyStoppable} icon={IconStop}>
                  {busyAction === 'stop' ? 'Deteniendo…' : stopLabel}
                </Btn>
              </>
            );
          })()}
        </div>

        {/* Header de la sección de configuración con toggle de colapso */}
        <button
          type="button"
          onClick={() => setConfigCollapsed(!configCollapsed)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', padding: '6px 8px', marginBottom: 8,
            background: 'transparent', border: 0,
            cursor: 'pointer', color: t.text2,
            fontFamily: t.fontSans, fontSize: 11,
            textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
            textAlign: 'left',
            borderRadius: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          {configCollapsed ? <IconChevR size={11}/> : <IconChevD size={11}/>}
          <IconSettings size={11}/>
          Configuración del server
        </button>

        {!configCollapsed && (
          <>
            {/* Config del server: la define el admin por workspace. Read-only acá:
                el member solo inicia/detiene; admin la edita en Settings → Folders. */}
            {(dual ? (cmdFrontend || cmdBackend) : cmdMain) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!dual ? (
                  <ReadonlyCmd label={tr('server.cmd.main_label')} value={cmdMain}/>
                ) : (
                  <>
                    <ReadonlyCmd label="Frontend" value={cmdFrontend}/>
                    <ReadonlyCmd label="Backend" value={cmdBackend}/>
                  </>
                )}
                <div style={{ fontSize: 10.5, color: t.text3, lineHeight: 1.5, marginTop: 2 }}>
                  {tr('server.cfg.admin_defined')}{isAdmin ? ` ${tr('server.cfg.admin_edit_hint')}` : ''}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                fontSize: 12, color: t.text2, lineHeight: 1.5,
              }}>
                {isAdmin ? tr('server.cfg.none_admin') : tr('server.cfg.none_member')}
              </div>
            )}

        {/* En dual, picker de qué panel de logs se ve grande por defecto */}
        {dual && (
          <div style={{
            padding: '10px 12px', marginBottom: 12, borderRadius: 10,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0, marginBottom: 2 }}>
              Vista de logs
            </div>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 8, lineHeight: 1.45 }}>
              Cuál panel se muestra grande. Igual podés colapsar/expandir desde los chevrons en cada panel.
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            }}>
              {([
                { id: 'both',     label: 'Ambos',         sub: 'mitad y mitad' },
                { id: 'frontend', label: 'Frontend',      sub: 'backend chiquito' },
                { id: 'backend',  label: 'Backend',       sub: 'frontend chiquito' },
              ] as const).map((opt) => {
                const selected = (!minFront && !minBack && opt.id === 'both')
                  || (minBack && !minFront && opt.id === 'frontend')
                  || (minFront && !minBack && opt.id === 'backend');
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === 'both') { setMin('frontend', false); setMin('backend', false); }
                      else if (opt.id === 'frontend') { setMin('frontend', false); setMin('backend', true); }
                      else { setMin('frontend', true); setMin('backend', false); }
                    }}
                    style={{
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${selected ? t.accent : t.glassBorder}`,
                      background: selected ? t.accentFaint : t.bg3,
                      color: selected ? t.accent : t.text1,
                      fontFamily: t.fontSans, textAlign: 'left',
                    }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: t.text3, marginTop: 1 }}>{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* En dual, qué reinicia el botón global "Reiniciar servidor" */}
        {dual && (
          <div style={{
            padding: '10px 12px', marginBottom: 12, borderRadius: 10,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0, marginBottom: 2 }}>
              Al reiniciar
            </div>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 8, lineHeight: 1.45 }}>
              Qué reinicia el botón "Reiniciar servidor". Igual podés reiniciar cada slot por separado desde su botón en el header.
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            }}>
              {([
                { id: 'both',     label: 'Ambos',    sub: 'frontend + backend' },
                { id: 'frontend', label: 'Frontend', sub: 'solo el frontend' },
                { id: 'backend',  label: 'Backend',  sub: 'solo el backend' },
              ] as const).map((opt) => {
                const selected = restartMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRestartMode(opt.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${selected ? t.accent : t.glassBorder}`,
                      background: selected ? t.accentFaint : t.bg3,
                      color: selected ? t.accent : t.text1,
                      fontFamily: t.fontSans, textAlign: 'left',
                    }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: t.text3, marginTop: 1 }}>{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Descripción de cómo funciona */}
        <Glass radius={10} style={{ padding: 14, marginTop: 16, background: t.bg2 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            fontSize: 11, color: t.accent, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: 0.3,
          }}>
            <IconCpu size={11}/> {tr('server.help.how_it_works')}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>
            {tr('server.help.body_a')} <code style={mono(t)}>$PORT</code> {dual ? tr('server.help.body_dual') : tr('server.help.body_single')} {tr('server.help.body_b')} <code style={mono(t)}>vite --port $PORT</code>, <code style={mono(t)}>process.env.PORT</code>{tr('server.help.body_c')} <code style={mono(t)}>lsof</code>.
          </div>
          {dual && (
            <div style={{
              marginTop: 10, paddingTop: 10,
              borderTop: `1px solid ${t.glassBorder}`,
              fontSize: 11.5, color: t.text2, lineHeight: 1.55,
            }}>
              <div style={{ fontWeight: 600, color: t.text1, marginBottom: 4 }}>
                {tr('server.help.dual.title')}
              </div>
              {tr('server.help.dual.body_a')} <strong>{tr('server.help.dual.body_b')}</strong> {tr('server.help.dual.body_c')} <strong>{tr('server.help.dual.body_d')}</strong> {tr('server.help.dual.body_e')} <code style={mono(t)}>BACKEND_URL</code>, <code style={mono(t)}>BACKEND_PORT</code>, <code style={mono(t)}>API_PORT</code>.
              {' '}{tr('server.help.dual.body_f')}
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>{tr('server.help.dual.li_vite')} <code style={mono(t)}>vite.config</code>: <code style={mono(t)}>{'server.proxy: { \'/api\': process.env.BACKEND_URL }'}</code></li>
                <li>{tr('server.help.dual.li_gulp')} <code style={mono(t)}>apiPort: process.env.BACKEND_PORT || 8080</code></li>
                <li>{tr('server.help.dual.li_generic_a')} <code style={mono(t)}>$BACKEND_PORT</code> {tr('server.help.dual.li_generic_b')} <code style={mono(t)}>$BACKEND_URL</code> {tr('server.help.dual.li_generic_c')}</li>
              </ul>
              <div style={{ marginTop: 4, color: t.text3 }}>
                {tr('server.help.dual.fallback')}<code style={mono(t)}>|| 8080</code>{tr('server.help.dual.fallback_post')}
              </div>
            </div>
          )}
        </Glass>
          </>
        )}

        {/* Logs — single pane si no es dual, dos columnas si lo es. En dual,
            cada slot se puede minimizar; cuando uno se minimiza, el otro
            crece para ocupar el espacio. */}
        {dual ? (
          <div style={{
            display: 'flex', gap: 10, marginTop: 16,
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: minFront ? '0 0 auto' : '1 1 0',
              minWidth: minFront ? 220 : 0,
              maxWidth: minFront ? 280 : 'none',
              transition: 'flex 200ms ease, max-width 200ms ease',
            }}>
              <LogsPane
                label="Frontend"
                role="frontend"
                accent={t.accent}
                minimized={minFront}
                onToggle={() => setMin('frontend', !minFront)}
                bubbleId={bubbleId}
                workspace={workspace}
                logSource="frontend"
                visible={visible && !minFront}
              />
            </div>
            <div style={{
              flex: minBack ? '0 0 auto' : '1 1 0',
              minWidth: minBack ? 220 : 0,
              maxWidth: minBack ? 280 : 'none',
              transition: 'flex 200ms ease, max-width 200ms ease',
            }}>
              <LogsPane
                label="Backend"
                role="backend"
                accent={t.warn}
                minimized={minBack}
                onToggle={() => setMin('backend', !minBack)}
                bubbleId={bubbleId}
                workspace={workspace}
                logSource="backend"
                visible={visible && !minBack}
              />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <LogsPane
              label="Logs"
              role="main"
              accent={t.accent}
              bubbleId={bubbleId}
              workspace={workspace}
              logSource="server"
              visible={visible}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ReadonlyCmd({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <div style={{ padding: 10, borderRadius: 10, background: t.bg2, border: `1px solid ${t.glassBorder}` }}>
      <div style={{ fontSize: 11, color: t.text2, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <code style={{
        display: 'block', fontFamily: t.fontMono, fontSize: 12,
        color: value ? t.text0 : t.text3, wordBreak: 'break-all',
      }}>{value || '—'}</code>
    </div>
  );
}

function mono(t: ReturnType<typeof useTokens>) {
  return {
    fontFamily: t.fontMono, fontSize: 10.5,
    padding: '1px 5px', borderRadius: 4,
    background: t.bg3, color: t.text1,
  };
}

function statusColorFor(s: Status, t: ReturnType<typeof useTokens>) {
  return s === 'running' ? t.ok
    : s === 'starting' ? t.warn
    : s === 'error' ? t.err
    : t.text3;
}
function statusLabelFor(s: Status) {
  return s === 'running' ? 'Corriendo'
    : s === 'starting' ? 'Iniciando…'
    : s === 'stopped' ? 'Detenido'
    : s === 'error' ? 'Error'
    : 'Inactivo';
}

function PanelHeader({
  dual, slots, bubbleId, onRestartRole,
}: {
  dual: boolean;
  slots: Record<SlotRole, SlotState>;
  bubbleId: string;
  onRestartRole: (role: SlotRole) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const isDual = dual;
  const visibleRoles: SlotRole[] = isDual ? ['frontend', 'backend'] : ['main'];

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCpu size={20}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text0, marginBottom: 2 }}>
            {isDual ? 'Dev servers (frontend + backend)' : 'Instancia del dev server'}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2 }}>
            {isDual ? 'Dos slots corriendo en paralelo, cada uno con su puerto.' : 'Un proceso, un puerto.'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {visibleRoles.map((role) => {
          const s = slots[role];
          const sColor = statusColorFor(s.status, t);
          return (
            <div key={role} style={{
              flex: '1 1 220px',
              padding: '8px 10px',
              borderRadius: 10,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {isDual && (
                <span style={{
                  fontSize: 10, fontFamily: t.fontMono,
                  color: t.text2, textTransform: 'uppercase', letterSpacing: 0.5,
                  marginRight: 2, fontWeight: 600,
                }}>{role}</span>
              )}
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: sColor,
                boxShadow: s.status === 'starting' || s.status === 'running' ? `0 0 8px ${sColor}` : 'none',
                animation: s.status === 'starting' ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
                flexShrink: 0,
              }}/>
              <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.text2 }}>
                {statusLabelFor(s.status)}
              </span>
              {s.url && (
                <>
                  <span style={{
                    flex: 1, fontFamily: t.fontMono, fontSize: 11,
                    color: t.text2, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{s.url}</span>
                  <button
                    type="button"
                    onClick={() => {
                      // Orden importa: PRIMERO cambiamos de tab para que el
                      // BrowserPanel monte (KeepAliveBrowser lo monta al
                      // volverse visible). DESPUÉS, con un delay, emitimos
                      // el navigate — si lo emitimos antes, el BrowserPanel
                      // todavía no registró su listener `eco:browser_navigate`
                      // y el evento se pierde (bug del "primer click no abre
                      // el URL, el segundo sí").
                      ecoEmit('eco:switch_tab', { tab: 'browser', bubbleId });
                      const url = s.url;
                      window.setTimeout(() => {
                        ecoEmit('eco:browser_navigate', { bubbleId, url });
                      }, 120);
                    }}
                    title={tr('server.action.open_browser')}
                    style={{
                      flexShrink: 0,
                      width: 22, height: 22, padding: 0, borderRadius: 5,
                      border: 0, background: 'transparent',
                      color: t.accent, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <IconGlobe size={12}/>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try { window.open(s.url, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
                    }}
                    title={tr('server.action.open_os')}
                    style={{
                      flexShrink: 0,
                      width: 22, height: 22, padding: 0, borderRadius: 5,
                      border: 0, background: 'transparent',
                      color: t.text2, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <IconExt size={11}/>
                  </button>
                </>
              )}
              {s.actionError && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10.5, color: t.err,
                }} title={s.actionError}>
                  <IconAlert size={11}/>
                </span>
              )}
              {isDual && (s.status === 'running' || s.status === 'starting' || s.status === 'error') && (
                <button
                  type="button"
                  onClick={() => onRestartRole(role)}
                  disabled={!!s.actionBusy}
                  title={`Reiniciar ${role}`}
                  style={{
                    flexShrink: 0,
                    marginLeft: s.url ? 0 : 'auto',
                    width: 22, height: 22, padding: 0, borderRadius: 5,
                    border: 0, background: 'transparent',
                    color: s.actionBusy ? t.text3 : t.text2,
                    cursor: s.actionBusy ? 'default' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => { if (!s.actionBusy) e.currentTarget.style.background = t.bg3; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <IconResume size={12}/>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogsPane({
  label, role, accent, minimized, onToggle,
  bubbleId, workspace, logSource, visible,
}: {
  label: string;
  role: SlotRole;
  accent: string;
  minimized?: boolean;
  onToggle?: () => void;
  bubbleId: string;
  workspace?: string;
  // Etiqueta usada en el prompt enviado a Claude para que sepa de qué pane vino.
  logSource?: 'frontend' | 'backend' | 'server';
  // true cuando este pane está realmente en pantalla (tab Server activa y,
  // en dual, el slot no minimizado). Al pasar a visible, xterm baja al fondo.
  visible?: boolean;
}) {
  const t = useTokens();
  const tr = useT();
  // El buffer de logs ya NO vive en React — xterm es el dueño del stream
  // (ver TerminalLogs). Acá solo guardamos un contador throttled para el
  // header y un handle imperativo al "clear" de la terminal.
  const [logSize, setLogSize] = useState(0);
  const clearRef = useRef<(() => void) | null>(null);

  // Altura del pane, redimensionable arrastrando el handle de abajo.
  // Persistida por (bubbleId, role) para que sobreviva reload / cambio de tab.
  const HEIGHT_KEY = `eco.dev.logheight.${bubbleId}.${role}`;
  const HEIGHT_MIN = 160;
  const HEIGHT_MAX = 1400;
  const [paneHeight, setPaneHeight] = useState<number>(() => {
    try {
      const n = parseInt(window.localStorage.getItem(HEIGHT_KEY) ?? '', 10);
      return Number.isFinite(n) ? Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, n)) : 320;
    } catch { return 320; }
  });

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    // setPointerCapture: el handle sigue recibiendo pointermove aunque el
    // cursor pase por encima del xterm (que si no se traga los eventos).
    try { handle.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const startY = e.clientY;
    const startH = paneHeight;
    let last = startH;
    const onMove = (ev: PointerEvent) => {
      last = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, startH + (ev.clientY - startY)));
      setPaneHeight(last);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      try { window.localStorage.setItem(HEIGHT_KEY, String(last)); } catch { /* noop */ }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${t.glassBorder}`,
      background: '#0c0e14',
      display: 'flex', flexDirection: 'column',
      height: minimized ? 'auto' : paneHeight,
    }}>
      <div style={{
        padding: '6px 10px',
        background: t.bg3,
        borderBottom: minimized ? 'none' : `1px solid ${t.glassBorder}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: accent,
          flexShrink: 0,
        }}/>
        <span style={{
          fontSize: 10.5, fontFamily: t.fontMono, color: t.text2,
          textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
        }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: t.text3, fontFamily: t.fontMono }}>
          {logSize.toLocaleString()} chars
        </span>
        {logSize > 0 && (
          <button
            type="button"
            onClick={() => clearRef.current?.()}
            title={tr('server.logs.clear_tooltip')}
            style={{
              width: 22, height: 22, borderRadius: 5, border: 0,
              background: 'transparent', color: t.text2, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; e.currentTarget.style.color = t.err; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text2; }}>
            <IconTrash size={11}/>
          </button>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={minimized ? 'Expandir' : 'Minimizar'}
            style={{
              width: 22, height: 22, borderRadius: 5, border: 0,
              background: 'transparent', color: t.text2, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            {minimized ? <IconChevR size={11}/> : <IconChevD size={11}/>}
          </button>
        )}
      </div>
      {!minimized && (
        <TerminalLogs
          role={role} accent={accent}
          bubbleId={bubbleId} workspace={workspace} logSource={logSource}
          onSizeChange={setLogSize} clearRef={clearRef} visible={visible}
        />
      )}
      {!minimized && (
        <div
          onPointerDown={startResize}
          title={tr('server.config.resize_tooltip')}
          style={{
            height: 8, flexShrink: 0, cursor: 'ns-resize',
            background: t.bg3, borderTop: `1px solid ${t.glassBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = t.bg3; }}>
          <div style={{ width: 28, height: 3, borderRadius: 2, background: t.text3, opacity: 0.6 }}/>
        </div>
      )}
    </div>
  );
}

// Viewer de logs renderizado con xterm.js — interpreta secuencias ANSI
// (colores, bold, dim, etc.) fielmente como una terminal real. El input
// nativo está deshabilitado: es solo lectura.
//
// xterm es el ÚNICO dueño del buffer de logs: los chunks del stream WS se
// escriben directo a la terminal, sin pasar por React state. Su scrollback
// (10k líneas) es el único cap. Antes el buffer vivía en un string de
// React capado a 60 KB y cada chunk (~12/seg) disparaba un re-render +
// alocaba 60 KB; peor: al llegar al cap, el delta calculado por longitud
// quedaba en 0 y la terminal se congelaba.
//
// Selección: cuando el user selecciona texto (drag con el mouse) aparece
// una mini barra flotante con "Enviar a Claude" que escribe el texto al
// PTY del agente (donde corre Claude CLI).
function TerminalLogs({
  role, accent, bubbleId, workspace, onSizeChange, clearRef, visible,
}: {
  role: SlotRole;
  accent: string;
  bubbleId?: string;
  workspace?: string;
  logSource?: 'frontend' | 'backend' | 'server';
  onSizeChange?: (n: number) => void;
  clearRef?: MutableRefObject<(() => void) | null>;
  visible?: boolean;
}) {
  const t = useTokens();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // "stick to bottom": si el user scrollea arriba para leer, dejamos de
  // arrastrarlo al fondo; cuando vuelve abajo, se reanuda el auto-scroll.
  const stickyRef = useRef(true);
  const sizeRef = useRef(0);
  const [selection, setSelection] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // onSizeChange en un ref para no re-crear el efecto de montaje de xterm.
  const onSizeChangeRef = useRef(onSizeChange);
  useEffect(() => { onSizeChangeRef.current = onSizeChange; }, [onSizeChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const TERMINAL_BG = '#0c0e14';
    const TERMINAL_FG = '#e5e7eb';
    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 11.5,
      lineHeight: 1.3,
      // 10k líneas: suficiente para scrollear el origen de un error aunque el
      // framework haya seguido logueando encima. Cuesta memoria solo mientras
      // el tab Server está montado.
      scrollback: 10_000,
      allowTransparency: false,
      theme: {
        background: TERMINAL_BG,
        foreground: TERMINAL_FG,
        cursor: TERMINAL_BG,
        cursorAccent: TERMINAL_BG,
        selectionBackground: `${accent}55`,
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    try { fit.fit(); } catch { /* noop */ }
    termRef.current = term;
    fitRef.current = fit;

    // Contador de chars para el header — throttled (1 update / 750ms) para
    // que el stream no re-renderice el LogsPane en cada chunk.
    let sizeTimer: number | null = null;
    const pushSize = () => {
      if (sizeTimer != null) return;
      sizeTimer = window.setTimeout(() => {
        sizeTimer = null;
        onSizeChangeRef.current?.(sizeRef.current);
      }, 750);
    };
    const resetSize = () => {
      sizeRef.current = 0;
      if (sizeTimer != null) { clearTimeout(sizeTimer); sizeTimer = null; }
      onSizeChangeRef.current?.(0);
    };

    // El user scrolleó: actualizamos sticky según si quedó pegado al fondo.
    const onScrollDisp = term.onScroll(() => {
      const b = term.buffer.active;
      stickyRef.current = b.viewportY >= b.baseY;
    });

    // Escritura coalescida por requestAnimationFrame: varios eventos WS que
    // caen en el mismo frame se juntan en un solo write() + un solo scroll.
    const pending: string[] = [];
    let raf: number | null = null;
    const flush = () => {
      raf = null;
      if (!pending.length) return;
      const text = pending.join('');
      pending.length = 0;
      // El scroll va en el callback de write() — write() es asíncrono, así que
      // scrollear síncrono justo después usaría el buffer viejo y no bajaría.
      term.write(text, () => {
        if (stickyRef.current) { try { term.scrollToBottom(); } catch { /* noop */ } }
      });
    };
    const enqueue = (chunk: string) => {
      pending.push(chunk);
      sizeRef.current += chunk.length;
      pushSize();
      if (raf == null) raf = requestAnimationFrame(flush);
    };
    const clearTerm = () => {
      pending.length = 0;
      try { term.clear(); } catch { /* noop */ }
      stickyRef.current = true;
      resetSize();
    };

    // Snapshot inicial: GET al ring buffer del backend (1 MB) al montar.
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(`/dev/logs?bubbleId=${encodeURIComponent(bubbleId ?? '')}&role=${role}`);
        if (!r.ok || cancelled) return;
        const text = await r.text();
        if (cancelled || !text) return;
        sizeRef.current += text.length;
        pushSize();
        term.write(text, () => { try { term.scrollToBottom(); } catch { /* noop */ } });
      } catch { /* noop */ }
    })();

    // Stream de chunks por WS (batcheado ~80ms en el backend).
    const offLog = ecoOn('eco:dev_log', (e) => {
      if (e.bubbleId !== bubbleId || e.role !== role) return;
      enqueue(e.chunk);
    });

    // Al (re)iniciar el server limpiamos la pantalla — los logs vienen frescos.
    const offStatus = ecoOn('eco:dev_status', (e) => {
      if (e.bubbleId !== bubbleId || (e.role ?? 'main') !== role) return;
      if (e.status === 'starting') clearTerm();
    });

    // Handle imperativo para el botón "borrar consola" del header.
    if (clearRef) clearRef.current = clearTerm;

    // Cada vez que cambia la selección del usuario, sincronizamos el estado
    // de React para mostrar/esconder la mini barra de acciones.
    const onSel = term.onSelectionChange(() => {
      setSelection(term.getSelection());
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* noop */ }
      if (stickyRef.current) { try { term.scrollToBottom(); } catch { /* noop */ } }
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      offLog();
      offStatus();
      onSel.dispose();
      onScrollDisp.dispose();
      ro.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
      if (sizeTimer != null) clearTimeout(sizeTimer);
      if (clearRef) clearRef.current = null;
      try { term.dispose(); } catch { /* noop */ }
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId, role]);

  // Cada vez que el pane vuelve a ser visible (tab Server activa de nuevo, o
  // se des-minimiza el slot) bajamos al fondo y reanudamos el sticky-scroll.
  // KeepAliveServer oculta la tab con display:none — xterm sigue vivo pero su
  // scroll quedó donde el user lo dejó.
  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    if (!term) return;
    stickyRef.current = true;
    const hardSync = () => {
      if (!stickyRef.current) return;
      // Tras salir de display:none, fit.fit() suele ser no-op (mismas dims) y
      // xterm nunca recomputa su .xterm-scroll-area → la scrollbar queda
      // pegada arriba. Un resize real (toggle de 1 fila y vuelta) lo obliga a
      // resincronizar buffer + render service + viewport.
      try {
        const { cols, rows } = term;
        if (cols > 1 && rows > 0) {
          term.resize(cols, rows + 1);
          term.resize(cols, rows);
        }
      } catch { /* noop */ }
      try { fitRef.current?.fit(); } catch { /* noop */ }
      try { term.scrollToBottom(); } catch { /* noop */ }
      // Y por las dudas, empujamos el div DOM del viewport directo al fondo.
      const vp = containerRef.current?.querySelector('.xterm-viewport') as HTMLElement | null;
      if (vp) vp.scrollTop = vp.scrollHeight;
    };
    // Dos frames: el layout de la tab recién visible necesita asentarse antes
    // de que las dimensiones que lee xterm sean reales.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { hardSync(); raf2 = requestAnimationFrame(hardSync); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [visible]);

  // Auto-clear del feedback después de 2.5s.
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(id);
  }, [feedback]);

  async function sendSelectionToClaude() {
    if (!bubbleId || !workspace) {
      setFeedback({ ok: false, text: 'Falta bubble/workspace' });
      return;
    }
    const text = selection.trim();
    if (!text) return;
    setSending(true);
    // Mandamos el texto PRIMERO, después switcheamos al tab Terminal.
    // El backend del PTY solo permite un WebSocket activo por sesión:
    // si abrimos el tab Terminal antes, su WS toma el control y patea al
    // WS temporal nuestro antes de que escriba. Mandando primero garantizamos
    // que el input llegó al PTY; cuando el tab Terminal se monta, hace
    // "reattach" a la misma sesión y ve el output de Claude procesando.
    const payload = text.replace(/\n/g, '\r') + '\r';
    const r = await writeToBubblePty({
      bubbleId,
      workspace,
      text: payload,
      token: ecoToken(),
    });
    setSending(false);
    if (r.ok) {
      setFeedback({ ok: true, text: 'Enviado a Claude' });
      termRef.current?.clearSelection();
      setSelection('');
      // Ahora sí cambiamos al tab Terminal para que el user vea la respuesta.
      ecoEmit('eco:switch_tab', { tab: 'terminal', bubbleId });
    } else {
      setFeedback({ ok: false, text: r.error });
    }
  }

  const showBar = selection.trim().length > 0;

  return (
    <div ref={wrapperRef} style={{
      flex: 1, minHeight: 0,
      padding: 8,
      background: '#0c0e14',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div ref={containerRef} style={{
        width: '100%', height: '100%',
        overflow: 'hidden',
      }}/>

      {/* Floating action bar — aparece cuando hay texto seleccionado */}
      {showBar && (
        <div style={{
          position: 'absolute', top: 8, right: 12, zIndex: 5,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 999,
          background: t.bg1, border: `1px solid ${t.accent}`,
          boxShadow: `0 6px 18px rgba(0,0,0,0.4)`,
        }}>
          <span style={{
            fontSize: 10.5, color: t.text2, fontFamily: t.fontMono,
            marginRight: 2,
          }}>
            {selection.length} {selection.length === 1 ? 'char' : 'chars'}
          </span>
          <button
            type="button"
            onClick={() => void sendSelectionToClaude()}
            disabled={sending || !bubbleId}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 999, border: 0,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.7 : 1,
            }}>
            {sending ? 'Enviando…' : '↗ Enviar a Claude'}
          </button>
        </div>
      )}

      {/* Feedback transitorio (OK / error) */}
      {feedback && (
        <div style={{
          position: 'absolute', bottom: 10, right: 12, zIndex: 5,
          padding: '6px 12px', borderRadius: 8,
          background: t.bg1,
          border: `1px solid ${feedback.ok ? t.ok : t.err}`,
          color: feedback.ok ? t.ok : t.err,
          fontSize: 11.5, fontFamily: t.fontSans, fontWeight: 500,
          maxWidth: 280,
        }}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}

