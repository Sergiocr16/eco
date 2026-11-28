import { cssZoom, useCssZoom } from '@/lib/ui-zoom';
// Panel de control del dev server por agente — separado del navegador
// porque son cosas distintas (proceso vs página). Cuando el server arranca,
// el panel Navegador se navega automáticamente a la URL emitida.
//
// El usuario define el comando bash directo. Eco le pasa un $PORT único.
// Admite "dual" — frontend + backend corriendo en paralelo con logs
// separados, gestionados como dos sesiones independientes vía el rol
// pasado a /dev/start /dev/stop /dev/restart.

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTokens, useTheme } from '@/design/theme';
import { isLightTheme } from '@/design/tokens';
import { buildXtermTheme, terminalBg } from '@/lib/terminal-theme';
import {
  IconPlay, IconStop, IconRotateCw, IconCpu, IconAlert,
  IconTrash, IconSettings, IconChevD, IconChevR, IconExt, IconGlobe,
} from '@/design/icons';

import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useWorkspaceServerDefaults } from '@/hooks/useWorkspaceServerDefaults';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { useT } from '@/hooks/useI18n';
import { useIsPhone, isPhoneNow } from '@/hooks/useMediaQuery';

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
  const isPhone = useIsPhone();
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
          updateSlot(role, { actionError: tr('server.err.no_command'), actionBusy: null, status: 'idle' });
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
      const msg = e instanceof Error ? e.message : tr('server.err.network');
      if (/failed to fetch|network|TypeError/i.test(msg)) {
        updateSlot(role, { actionError: tr('server.err.unreachable') });
      } else if (/aborted|timeout/i.test(msg)) {
        updateSlot(role, { actionError: tr('server.err.timeout') });
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
      <div style={{ flex: 1, overflow: 'auto', padding: isPhone ? 12 : '18px 20px' }}>
       {/* Columna de alto natural: como hijos flex del scroll, los logs se encogerían. */}
       <div className="eco-vstack" style={{ gap: 18 }}>
        {/* Header con estado(s) + acciones globales — corren ambos slots en
            dual. Los tres rótulos en español piden ~430px: envuelven. */}
        <PanelHeader
          dual={dual}
          slots={slots}
          actions={(() => {
            const activeRoles: SlotRole[] = !dual ? ['main'] : ['frontend', 'backend'];
            const anyRunning = activeRoles.some((r) => slots[r].status === 'running' || slots[r].status === 'starting');
            const anyStoppable = activeRoles.some((r) => slots[r].status === 'running' || slots[r].status === 'starting' || slots[r].status === 'error');
            const anyBusy = activeRoles.some((r) => !!slots[r].actionBusy);
            const startLabel = tr('detail.server.start');
            const restartLabel = dual && restartMode === 'frontend' ? tr('server.restart.frontend')
              : dual && restartMode === 'backend' ? tr('server.restart.backend')
              : tr('detail.server.restart');
            const stopLabel = tr('detail.server.stop');
            // Identificamos cuál es la acción en curso (si la hay) para
            // mostrar "Iniciando…/Reiniciando…/Deteniendo…" en el botón
            // correcto en vez de "Trabajando…" en el primero solo.
            const busyAction = activeRoles
              .map((r) => slots[r].actionBusy)
              .find(Boolean) as 'start' | 'stop' | 'restart' | undefined;
            // Como en el diseño: una píldora con solo íconos. Apagado ofrece
            // iniciar; encendido, reiniciar y detener.
            return (
              <div className="eco-ctlpill">
                {!anyStoppable ? (
                  <button type="button" className="eco-iconbtn" style={{ color: t.ok }}
                    disabled={anyBusy || anyRunning}
                    title={busyAction === 'start' ? tr('server.busy.starting') : startLabel}
                    aria-label={startLabel}
                    onClick={() => void runAllAction('up')}><IconPlay size={16}/></button>
                ) : (
                  <>
                    <button type="button" className="eco-iconbtn" disabled={anyBusy}
                      title={busyAction === 'restart' ? tr('server.busy.restarting') : restartLabel}
                      aria-label={restartLabel}
                      onClick={() => void runAllAction('restart')}><IconRotateCw size={16}/></button>
                    <button type="button" className="eco-iconbtn" style={{ color: t.err }} disabled={anyBusy}
                      title={busyAction === 'stop' ? tr('server.busy.stopping') : stopLabel}
                      aria-label={stopLabel}
                      onClick={() => void runAllAction('down')}><IconStop size={14}/></button>
                  </>
                )}
              </div>
            );
          })()}
        />

        {/* Header de la sección de configuración con toggle de colapso */}
        <button
          type="button"
          onClick={() => setConfigCollapsed(!configCollapsed)}
          aria-expanded={!configCollapsed}
          className="eco-btn eco-btn--ghost eco-btn--sm"
          style={{ alignSelf: 'flex-start', padding: '0 10px' }}>
          {configCollapsed ? <IconChevR size={14}/> : <IconChevD size={14}/>}
          <IconSettings size={14}/>
          {tr('server.config.section')}
        </button>

        {!configCollapsed && (
          <div className="eco-pane eco-vstack">
            {/* Config del server: la define el admin por workspace. Read-only acá:
                el member solo inicia/detiene; admin la edita en Settings → Folders. */}
            {(dual ? (cmdFrontend || cmdBackend) : cmdMain) ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {!dual ? (
                    <ReadonlyCmd label={tr('server.cmd.main_label')} value={cmdMain}/>
                  ) : (
                    <>
                      <ReadonlyCmd label="Frontend" value={cmdFrontend}/>
                      <ReadonlyCmd label="Backend" value={cmdBackend}/>
                    </>
                  )}
                </div>
                {Object.keys(wsDefaults.defaults.env).length > 0 && (
                  <div className="eco-inset" style={{ padding: '12px 16px 4px' }}>
                    <div className="eco-hstack" style={{ paddingBottom: 8 }}>
                      <span className="eco-eyebrow eco-grow">{tr('server.cfg.env_label')}</span>
                      <span className="eco-num">{Object.keys(wsDefaults.defaults.env).length}</span>
                    </div>
                    {Object.entries(wsDefaults.defaults.env).map(([k, v]) => (
                      <code key={k} className="eco-mono" style={{
                        display: 'block', fontSize: 12.5, padding: '8px 0',
                        borderTop: `1px solid ${t.line}`,
                        color: t.text1, overflowWrap: 'anywhere',
                      }}><span style={{ color: t.text0, fontWeight: 500 }}>{k}</span>={v}</code>
                    ))}
                  </div>
                )}
                <div className="eco-sub" style={{ padding: '0 4px' }}>
                  {tr('server.cfg.edit_hint')}
                </div>
              </>
            ) : (
              <div className="eco-banner" style={{ background: t.raised }}>
                {tr('server.cfg.none')}
              </div>
            )}

        {/* En dual, picker de qué panel de logs se ve grande por defecto */}
        {dual && (
          <OptionGroup
            title={tr('server.logview.title')}
            sub={tr('server.logview.sub')}
            stacked={isPhone}
            options={[
              { id: 'both',     label: tr('server.opt.both'), sub: tr('server.logview.both_sub') },
              { id: 'frontend', label: 'Frontend',            sub: tr('server.logview.frontend_sub') },
              { id: 'backend',  label: 'Backend',             sub: tr('server.logview.backend_sub') },
            ]}
            value={(!minFront && !minBack) ? 'both' : (minBack && !minFront) ? 'frontend' : (minFront && !minBack) ? 'backend' : null}
            onPick={(id) => {
              if (id === 'both') { setMin('frontend', false); setMin('backend', false); }
              else if (id === 'frontend') { setMin('frontend', false); setMin('backend', true); }
              else { setMin('frontend', true); setMin('backend', false); }
            }}
          />
        )}

        {/* En dual, qué reinicia el botón global "Reiniciar servidor" */}
        {dual && (
          <OptionGroup
            title={tr('server.restartmode.title')}
            sub={tr('server.restartmode.sub')}
            stacked={isPhone}
            options={[
              { id: 'both',     label: tr('server.opt.both'), sub: 'frontend + backend' },
              { id: 'frontend', label: 'Frontend', sub: tr('server.restartmode.frontend_sub') },
              { id: 'backend',  label: 'Backend',  sub: tr('server.restartmode.backend_sub') },
            ]}
            value={restartMode}
            onPick={setRestartMode}
          />
        )}

        {/* Descripción de cómo funciona */}
        <div className="eco-inset" style={{ padding: '14px 16px' }}>
          <div className="eco-hstack" style={{ gap: 7, marginBottom: 6, color: t.accent, fontWeight: 500, fontSize: 12.5 }}>
            <IconCpu size={13}/> {tr('server.help.how_it_works')}
          </div>
          <div className="eco-sub" style={{ color: t.text1, lineHeight: 1.6 }}>
            {tr('server.help.body_a')} <code style={mono(t)}>$PORT</code> {dual ? tr('server.help.body_dual') : tr('server.help.body_single')} {tr('server.help.body_b')} <code style={mono(t)}>vite --port $PORT</code>, <code style={mono(t)}>process.env.PORT</code>{tr('server.help.body_c')} <code style={mono(t)}>lsof</code>.
          </div>
          {dual && (
            <div className="eco-sub" style={{
              marginTop: 10, paddingTop: 10,
              borderTop: `1px solid ${t.line}`,
              color: t.text1, lineHeight: 1.6,
            }}>
              <div className="eco-label" style={{ marginBottom: 4 }}>
                {tr('server.help.dual.title')}
              </div>
              {tr('server.help.dual.body_a')} <strong>{tr('server.help.dual.body_b')}</strong> {tr('server.help.dual.body_c')} <strong>{tr('server.help.dual.body_d')}</strong> {tr('server.help.dual.body_e')} <code style={mono(t)}>BACKEND_URL</code>, <code style={mono(t)}>BACKEND_PORT</code>, <code style={mono(t)}>API_PORT</code>.
              {' '}{tr('server.help.dual.body_f')}
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                <li>{tr('server.help.dual.li_vite')} <code style={mono(t)}>vite.config</code>: <code style={mono(t)}>{'server.proxy: { \'/api\': process.env.BACKEND_URL }'}</code></li>
                <li>{tr('server.help.dual.li_gulp')} <code style={mono(t)}>apiPort: process.env.BACKEND_PORT || 8080</code></li>
                <li>{tr('server.help.dual.li_generic_a')} <code style={mono(t)}>$BACKEND_PORT</code> {tr('server.help.dual.li_generic_b')} <code style={mono(t)}>$BACKEND_URL</code> {tr('server.help.dual.li_generic_c')}</li>
              </ul>
              <div style={{ marginTop: 4, color: t.text3 }}>
                {tr('server.help.dual.fallback')}<code style={mono(t)}>|| 8080</code>{tr('server.help.dual.fallback_post')}
              </div>
            </div>
          )}
        </div>
          </div>
        )}

        {/* Logs — single pane si no es dual, dos columnas si lo es. En dual,
            cada slot se puede minimizar; cuando uno se minimiza, el otro
            crece para ocupar el espacio. */}
        {dual ? (
          <div style={{
            // Dos panes de log lado a lado dan ~160px cada uno en el teléfono:
            // ilegibles. Apilados cada uno usa el ancho completo.
            display: 'flex', flexDirection: isPhone ? 'column' : 'row',
            gap: 16,
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: minFront ? '0 0 auto' : '1 1 0',
              minWidth: minFront ? 220 : 0,
              maxWidth: minFront ? 280 : 'none',
              transition: 'flex 200ms ease, max-width 200ms ease',
            }}>
              <LogsPane
                slot={slots.frontend}
                onRestart={() => void runActionForRole('frontend', 'restart')}
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
                slot={slots.backend}
                onRestart={() => void runActionForRole('backend', 'restart')}
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
          <div>
            <LogsPane
              slot={slots.main}
              label={tr('server.logs.title')}
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
    </div>
  );
}

function ReadonlyCmd({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <div className="eco-inset" style={{ flex: '1 1 260px', minWidth: 0, padding: '12px 16px' }}>
      <div className="eco-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <code className="eco-mono" style={{
        display: 'block', fontSize: 13,
        color: value ? t.text0 : t.text3, overflowWrap: 'anywhere',
      }}>{value || '—'}</code>
    </div>
  );
}

// Selector de tres opciones con descripción (qué log se ve, qué se reinicia).
function OptionGroup<T extends string>({ title, sub, options, value, onPick, stacked }: {
  title: string; sub: string;
  options: Array<{ id: T; label: string; sub: string }>;
  value: T | null;
  onPick: (id: T) => void;
  stacked: boolean;
}) {
  const t = useTokens();
  return (
    <div className="eco-inset" style={{ padding: '14px 16px' }}>
      <div className="eco-label">{title}</div>
      <div className="eco-sub" style={{ marginBottom: 10 }}>{sub}</div>
      <div style={{
        // Tres columnas en 300px dan tarjetas de ~86px para dos líneas
        // de texto; una sola columna se lee.
        display: 'grid',
        gridTemplateColumns: stacked ? '1fr' : 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(opt.id)}
              style={{
                padding: '10px 14px', borderRadius: 14, cursor: 'pointer',
                border: `1px solid ${selected ? t.accentLine : 'transparent'}`,
                background: selected ? t.accentSoft : t.card,
                color: t.text0, font: 'inherit', textAlign: 'left',
              }}>
              <div className="eco-label">{opt.label}</div>
              <div className="eco-sub">{opt.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function mono(t: ReturnType<typeof useTokens>) {
  return {
    fontFamily: t.fontMono, fontSize: 11.5,
    padding: '1px 6px', borderRadius: 6,
    background: t.card, color: t.text0,
  };
}

function statusColorFor(s: Status, t: ReturnType<typeof useTokens>) {
  return s === 'running' ? t.ok
    : s === 'starting' ? t.warn
    : s === 'error' ? t.err
    : t.text3;
}
function statusLabelFor(s: Status, tr: ReturnType<typeof useT>) {
  return s === 'running' ? tr('server.status.running')
    : s === 'starting' ? tr('server.status.starting')
    : s === 'stopped' ? tr('server.status.stopped')
    : s === 'error' ? tr('server.status.error')
    : tr('server.status.idle');
}

function PanelHeader({
  dual, slots, actions,
}: {
  dual: boolean;
  slots: Record<SlotRole, SlotState>;
  actions: ReactNode;
}) {
  const t = useTokens();
  const tr = useT();
  const isPhone = useIsPhone();
  const roles: SlotRole[] = dual ? ['frontend', 'backend'] : ['main'];
  const agg: Status = roles.some((r) => slots[r].status === 'error') ? 'error'
    : roles.some((r) => slots[r].status === 'starting') ? 'starting'
    : roles.some((r) => slots[r].status === 'running') ? 'running' : 'stopped';
  return (
    <div className="eco-card eco-hstack eco-hstack--wrap" style={{ gap: '12px 16px', padding: isPhone ? 16 : '20px 24px' }}>
      <div className="eco-tile eco-tile--lg" title={statusLabelFor(agg, tr)} style={{
        color: agg === 'stopped' ? t.text1 : statusColorFor(agg, t),
        animation: agg === 'starting' ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
      }}>
        <IconCpu size={20}/>
      </div>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: isPhone ? 17 : 22, fontWeight: isPhone ? 500 : 400, letterSpacing: isPhone ? undefined : '-.02em', color: t.text0 }}>
          {dual ? tr('server.header.dual_title') : tr('server.header.single_title')}
        </div>
        <div className="eco-muted">
          {dual ? tr('server.header.dual_sub') : tr('server.header.single_sub')}
        </div>
      </div>
      {actions}
    </div>
  );
}

function LogsPane({
  label, role, accent, minimized, onToggle,
  bubbleId, workspace, logSource, visible, slot, onRestart,
}: {
  slot: SlotState;
  // Solo en dual: reinicia este proceso sin tocar el otro.
  onRestart?: () => void;
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
  const { t, effectiveMode } = useTheme();
  const isLight = isLightTheme(effectiveMode);
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
    // En el teléfono 320px de log dejan el resto del panel fuera de pantalla;
    // el handle de resize ya usa PointerEvents, así que se ajusta al toque.
    const fallback = isPhoneNow() ? 240 : 320;
    try {
      const n = parseInt(window.localStorage.getItem(HEIGHT_KEY) ?? '', 10);
      return Number.isFinite(n) ? Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, n)) : fallback;
    } catch { return fallback; }
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
    <div className="eco-card" style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px 6px',
      height: minimized ? 'auto' : paneHeight + 110, paddingBottom: minimized ? 16 : 6,
    }}>
      <div className="eco-hstack" style={{ gap: 10, minHeight: 28 }}>
        <span className="eco-truncate" style={{ fontSize: 16, fontWeight: 500 }}>{label}</span>
        <span className="eco-chip eco-chip--on-card" style={{ flexShrink: 0 }}>
          <span className="eco-dot" style={{
            background: statusColorFor(slot.status, t),
            animation: slot.status === 'starting' ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
          }}/>
          {statusLabelFor(slot.status, tr)}
        </span>
        {slot.actionError && (
          <span style={{ display: 'inline-flex', color: t.err, flexShrink: 0 }} title={slot.actionError}>
            <IconAlert size={14}/>
          </span>
        )}
        <span className="eco-num" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {logSize.toLocaleString()} chars
        </span>
        {logSize > 0 && (
          <button
            type="button"
            onClick={() => clearRef.current?.()}
            title={tr('server.logs.clear_tooltip')}
            aria-label={tr('server.logs.clear_tooltip')}
            className="eco-iconbtn eco-iconbtn--xs eco-iconbtn--danger">
            <IconTrash size={14}/>
          </button>
        )}
        {onRestart && (slot.status === 'running' || slot.status === 'starting' || slot.status === 'error') && (
          <button type="button" onClick={onRestart} disabled={!!slot.actionBusy}
            title={tr('detail.server.restart')} aria-label={tr('detail.server.restart')}
            className="eco-iconbtn eco-iconbtn--xs">
            <IconRotateCw size={14}/>
          </button>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={tr(minimized ? 'server.logs.expand' : 'server.logs.minimize')}
            aria-label={tr(minimized ? 'server.logs.expand' : 'server.logs.minimize')}
            className="eco-iconbtn eco-iconbtn--xs">
            {minimized ? <IconChevR size={14}/> : <IconChevD size={14}/>}
          </button>
        )}
      </div>
      {slot.url && (
        <div className="eco-hstack" style={{
          gap: 6, minHeight: 38, padding: '0 6px 0 14px', borderRadius: 19, background: t.raised, minWidth: 0, flexShrink: 0,
        }}>
          <span className="eco-mono eco-truncate eco-grow" style={{ fontSize: 12 }}>{slot.url}</span>
          <button
            type="button"
            onClick={() => {
              // Primero el tab (el BrowserPanel monta perezoso) y después el
              // navigate: emitido antes, el listener todavía no existe.
              ecoEmit('eco:switch_tab', { tab: 'browser', bubbleId });
              const url = slot.url;
              window.setTimeout(() => { ecoEmit('eco:browser_navigate', { bubbleId, url }); }, 120);
            }}
            title={tr('server.action.open_browser')} aria-label={tr('server.action.open_browser')}
            className="eco-iconbtn eco-iconbtn--xs" style={{ color: t.accent }}>
            <IconGlobe size={14}/>
          </button>
          <button
            type="button"
            onClick={() => { try { window.open(slot.url, '_blank', 'noopener,noreferrer'); } catch { /* noop */ } }}
            title={tr('server.action.open_os')} aria-label={tr('server.action.open_os')}
            className="eco-iconbtn eco-iconbtn--xs">
            <IconExt size={14}/>
          </button>
        </div>
      )}
      {!minimized && (
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          borderRadius: 14, overflow: 'hidden',
          background: terminalBg(t, isLight),
        }}>
          <TerminalLogs
            role={role} accent={accent}
            bubbleId={bubbleId} workspace={workspace} logSource={logSource}
            onSizeChange={setLogSize} clearRef={clearRef} visible={visible}
          />
        </div>
      )}
      {!minimized && (
        <div
          onPointerDown={startResize}
          title={tr('server.config.resize_tooltip')}
          style={{
            height: 12, flexShrink: 0, cursor: 'ns-resize',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
          }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: t.line2 }}/>
        </div>
      )}
    </div>
  );
}

// Los logs son de solo lectura: acá lo que importa es que entren las columnas
// de un stack trace, no la comodidad de tipear. Se escala por el zoom CSS de
// la UI porque el contenedor se contra-zoomea (misma razón que RealTerminal).
const logFontPx = () => (isPhoneNow() ? 10 : 11.5) * cssZoom();

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
  const { t, effectiveMode } = useTheme();
  const tr = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const isLight = isLightTheme(effectiveMode);
  const xtermTheme = buildXtermTheme(t, isLight, accent);
  const xtermThemeRef = useRef(xtermTheme);
  xtermThemeRef.current = xtermTheme;
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
    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: logFontPx(),
      lineHeight: 1.3,
      // 10k líneas: suficiente para scrollear el origen de un error aunque el
      // framework haya seguido logueando encima. Cuesta memoria solo mientras
      // el tab Server está montado.
      scrollback: 10_000,
      allowTransparency: false,
      // Sin cursor visible: es un visor de logs, no una terminal interactiva.
      theme: { ...xtermThemeRef.current, cursor: xtermThemeRef.current.background },
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

  // El zoom de la UI (web) cambia la fuente efectiva, y el contenedor
  // contra-zoomeado no cambia de tamaño visual: se refitea a mano.
  const cssZ = useCssZoom();
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = logFontPx();
    try { fitRef.current?.fit(); } catch { /* noop */ }
  }, [cssZ]);

  // Cambio de tema en vivo sin recrear el terminal (se perdería el buffer).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = { ...xtermTheme, cursor: xtermTheme.background };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, effectiveMode, accent]);

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
    });
    setSending(false);
    if (r.ok) {
      setFeedback({ ok: true, text: tr('server.logs.sent') });
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
      padding: '10px 12px',
      background: terminalBg(t, isLight),
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div ref={containerRef} style={{
        width: '100%', height: '100%',
        overflow: 'hidden',
        // Contra-zoom bajo zoom CSS (web): xterm mide en px visuales y los
        // aplica como px CSS — ver el mismo style en RealTerminal.
        ...(cssZ !== 1 ? { zoom: 1 / cssZ } : null),
      }}/>

      {/* Floating action bar — aparece cuando hay texto seleccionado */}
      {showBar && (
        <div className="eco-hstack" style={{
          position: 'absolute', top: 8, right: 12, zIndex: 5,
          gap: 8, padding: '4px 4px 4px 12px', borderRadius: 999,
          background: t.bg, border: `1px solid ${t.line2}`,
          boxShadow: t.shadowMd,
        }}>
          <span className="eco-num">
            {selection.length === 1 ? tr('server.logs.chars_one') : tr('server.logs.chars_many', { n: selection.length })}
          </span>
          <button
            type="button"
            onClick={() => void sendSelectionToClaude()}
            disabled={sending || !bubbleId}
            className="eco-btn eco-btn--xs eco-btn--primary">
            {sending ? tr('server.logs.sending') : tr('server.logs.send')}
          </button>
        </div>
      )}

      {/* Feedback transitorio (OK / error) */}
      {feedback && (
        <div style={{
          position: 'absolute', bottom: 10, right: 12, zIndex: 5,
          padding: '6px 12px', borderRadius: 12,
          background: t.bg,
          border: `1px solid ${t.line2}`,
          color: feedback.ok ? t.ok : t.err,
          fontSize: 12.5, fontFamily: t.fontSans, fontWeight: 500,
          maxWidth: 280, boxShadow: t.shadowMd,
        }}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}
