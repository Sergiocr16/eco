// Panel de control del dev server por agente — separado del navegador
// porque son cosas distintas (proceso vs página). Cuando el server arranca,
// el panel Navegador se navega automáticamente a la URL emitida.
//
// El usuario define el comando bash directo. Eco le pasa un $PORT único.
// Admite "dual" — frontend + backend corriendo en paralelo con logs
// separados, gestionados como dos sesiones independientes vía el rol
// pasado a /dev/start /dev/stop /dev/restart.

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTokens } from '@/design/theme';
import {
  IconPlay, IconStop, IconResume, IconCpu, IconAlert,
  IconPlus, IconTrash, IconSettings, IconChevD, IconChevR,
} from '@/design/icons';
import { Glass, Btn } from '@/design/primitives';
import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useDevPresets, type PresetRole } from '@/hooks/useDevPresets';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { ecoToken } from '@/lib/eco-config';

type Status = 'idle' | 'starting' | 'running' | 'stopped' | 'error';
type SlotRole = 'main' | 'frontend' | 'backend';

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

const CMD_KEY = (bubbleId: string, role: SlotRole) =>
  role === 'main' ? `eco.dev.cmd.${bubbleId}` : `eco.dev.cmd.${role}.${bubbleId}`;
const DUAL_KEY = (bubbleId: string) => `eco.dev.dual.${bubbleId}`;

type SlotState = {
  status: Status;
  url: string;
  command: string;
  logs: string;
  actionBusy: 'start' | 'stop' | 'restart' | null;
  actionError: string | null;
};

const initSlot = (): SlotState => ({
  status: 'idle', url: '', command: '', logs: '',
  actionBusy: null, actionError: null,
});

export function ServerPanel({ bubbleId, workspace }: { bubbleId: string; workspace: string }) {
  const t = useTokens();
  const [dual, setDual] = useState<boolean>(() => {
    try { return window.localStorage.getItem(DUAL_KEY(bubbleId)) === '1'; }
    catch { return false; }
  });
  const setDualPersist = (v: boolean) => {
    setDual(v);
    try { window.localStorage.setItem(DUAL_KEY(bubbleId), v ? '1' : '0'); } catch { /* noop */ }
  };

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

  // Comandos por rol — persistidos por separado.
  const [cmdMain, setCmdMain] = useState<string>(() => readLs(CMD_KEY(bubbleId, 'main')));
  const [cmdFrontend, setCmdFrontend] = useState<string>(() => readLs(CMD_KEY(bubbleId, 'frontend')));
  const [cmdBackend, setCmdBackend] = useState<string>(() => readLs(CMD_KEY(bubbleId, 'backend')));

  function saveCmd(role: SlotRole, v: string) {
    const key = CMD_KEY(bubbleId, role);
    try {
      if (v) window.localStorage.setItem(key, v);
      else window.localStorage.removeItem(key);
    } catch { /* noop */ }
    if (role === 'main') setCmdMain(v);
    if (role === 'frontend') setCmdFrontend(v);
    if (role === 'backend') setCmdBackend(v);
  }
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

  // Stream de status vía WS.
  useEffect(() => {
    return ecoOn('eco:dev_status', (e: DevStatusEvent) => {
      if (e.bubbleId !== bubbleId) return;
      const role = (e.role ?? 'main') as SlotRole;
      updateSlot(role, {
        status: e.status,
        url: e.url ?? '',
        command: e.command ?? '',
      });
      // Auto-bind del navegador a la URL del frontend (o main si single).
      if (e.status === 'running' && e.url && (role === 'main' || role === 'frontend')) {
        ecoEmit('eco:browser_navigate', { bubbleId, url: e.url });
      }
    });
  }, [bubbleId]);

  // Poll de logs cada 1.5s para los slots activos.
  useEffect(() => {
    const activeRoles: SlotRole[] = !dual ? ['main'] : ['frontend', 'backend'];
    const needsPoll = activeRoles.some((r) => {
      const st = slots[r].status;
      return st === 'starting' || st === 'running' || st === 'error';
    });
    if (!needsPoll) return;
    let cancelled = false;
    const fetchLogs = async () => {
      for (const role of activeRoles) {
        const st = slots[role].status;
        if (st === 'idle' || st === 'stopped') continue;
        try {
          const r = await apiFetch(`/dev/logs?bubbleId=${encodeURIComponent(bubbleId)}&role=${role}`);
          if (!r.ok || cancelled) continue;
          const text = await r.text();
          updateSlot(role, { logs: text });
        } catch { /* noop */ }
      }
    };
    void fetchLogs();
    const iv = setInterval(fetchLogs, 1500);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId, dual, slots.main.status, slots.frontend.status, slots.backend.status]);

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

  async function runActionForRole(role: SlotRole, action: 'up' | 'down' | 'restart') {
    updateSlot(role, {
      actionError: null,
      actionBusy: action === 'up' ? 'start' : action === 'down' ? 'stop' : 'restart',
    });
    try {
      let r: Response;
      if (action === 'up') {
        const cmd = cmdFor(role);
        if (!cmd.trim()) { updateSlot(role, { actionError: 'Definí el comando para iniciar.', actionBusy: null }); return; }
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
    }
    updateSlot(role, { actionBusy: null });
  }

  async function runAllAction(action: 'up' | 'down' | 'restart') {
    if (!dual) { return runActionForRole('main', action); }
    // Dual: corremos en paralelo para que ambos arranquen / se detengan a la vez.
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
        />

        {/* Botones de acción globales — corren ambos slots en dual */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(() => {
            const activeRoles: SlotRole[] = !dual ? ['main'] : ['frontend', 'backend'];
            const anyRunning = activeRoles.some((r) => slots[r].status === 'running' || slots[r].status === 'starting');
            const anyStoppable = activeRoles.some((r) => slots[r].status === 'running' || slots[r].status === 'starting' || slots[r].status === 'error');
            const anyBusy = activeRoles.some((r) => !!slots[r].actionBusy);
            const startLabel = dual ? 'Iniciar ambos' : 'Iniciar';
            const restartLabel = dual ? 'Reiniciar ambos' : 'Reiniciar';
            const stopLabel = dual ? 'Detener ambos' : 'Detener';
            return (
              <>
                <Btn kind="primary" size="md" onClick={() => void runAllAction('up')}
                  disabled={anyBusy || anyRunning} icon={IconPlay}>
                  {anyBusy ? 'Trabajando…' : startLabel}
                </Btn>
                <Btn kind="secondary" size="md" onClick={() => void runAllAction('restart')}
                  disabled={anyBusy} icon={IconResume}>
                  {restartLabel}
                </Btn>
                <Btn kind="danger" size="md" onClick={() => void runAllAction('down')}
                  disabled={anyBusy || !anyStoppable} icon={IconStop}>
                  {stopLabel}
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
            {/* Toggle de dual */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', marginBottom: 12, borderRadius: 10,
              background: t.bg2, border: `1px solid ${dual ? t.accent : t.glassBorder}`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0 }}>
                  Frontend + Backend en paralelo
                </div>
                <div style={{ fontSize: 11, color: t.text2, marginTop: 2, lineHeight: 1.45 }}>
                  Activá si tu proyecto necesita dos servers (ej. Vite + Express). Cada uno tiene su puerto y logs.
                </div>
              </div>
              <Toggle on={dual} onChange={setDualPersist}/>
            </div>

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

        {/* Comando(s) bash */}
        {!dual ? (
          <CommandSlot
            role="main"
            label="Comando para iniciar el server"
            placeholder="npm run dev -- --port $PORT"
            command={cmdMain}
            onChange={(v) => saveCmd('main', v)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <CommandSlot
              role="frontend"
              label="Frontend"
              placeholder="npm run dev -- --port $PORT"
              command={cmdFrontend}
              onChange={(v) => saveCmd('frontend', v)}
            />
            <CommandSlot
              role="backend"
              label="Backend"
              placeholder="PORT=$PORT node server.js"
              command={cmdBackend}
              onChange={(v) => saveCmd('backend', v)}
            />
          </div>
        )}

        {/* Descripción de cómo funciona */}
        <Glass radius={10} style={{ padding: 14, marginTop: 16, background: t.bg2 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            fontSize: 11, color: t.accent, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: 0.3,
          }}>
            <IconCpu size={11}/> Cómo funciona
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>
            Eco ejecuta tu comando dentro del worktree del agente. Setea <code style={mono(t)}>$PORT</code> a un puerto libre {dual ? 'distinto para cada slot (frontend y backend)' : 'por agente'} — el comando debe respetarlo (ej. <code style={mono(t)}>vite --port $PORT</code>, <code style={mono(t)}>process.env.PORT</code>). Al detener, Eco mata el process group entero y verifica el cleanup con <code style={mono(t)}>lsof</code>.
          </div>
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
                logs={slots.frontend.logs}
                accent={t.accent}
                minimized={minFront}
                onToggle={() => setMin('frontend', !minFront)}
                bubbleId={bubbleId}
                workspace={workspace}
                logSource="frontend"
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
                logs={slots.backend.logs}
                accent={t.warn}
                minimized={minBack}
                onToggle={() => setMin('backend', !minBack)}
                bubbleId={bubbleId}
                workspace={workspace}
                logSource="backend"
              />
            </div>
          </div>
        ) : (
          slots.main.logs && (
            <div style={{ marginTop: 16 }}>
              <LogsPane
                label="Logs"
                logs={slots.main.logs}
                accent={t.accent}
                bubbleId={bubbleId}
                workspace={workspace}
                logSource="server"
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

function readLs(key: string): string {
  try { return window.localStorage.getItem(key) ?? ''; } catch { return ''; }
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
  dual, slots, bubbleId,
}: {
  dual: boolean;
  slots: Record<SlotRole, SlotState>;
  bubbleId: string;
}) {
  const t = useTokens();
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
                <button
                  type="button"
                  onClick={() => ecoEmit('eco:browser_navigate', { bubbleId, url: s.url })}
                  title="Abrir en pestaña Navegador"
                  style={{
                    flex: 1, fontFamily: t.fontMono, fontSize: 11,
                    background: 'transparent', border: 0,
                    color: t.accent, cursor: 'pointer', padding: 0,
                    textDecoration: 'underline', textUnderlineOffset: 2,
                    textAlign: 'left', minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {s.url}
                </button>
              )}
              {s.actionError && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10.5, color: t.err,
                }} title={s.actionError}>
                  <IconAlert size={11}/>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const t = useTokens();
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 999, border: 0,
        background: on ? t.accent : t.bg3,
        position: 'relative', cursor: 'pointer',
        transition: 'background 140ms',
        flexShrink: 0,
      }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transition: 'left 140ms',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}/>
    </button>
  );
}

function CommandSlot({
  role, label, placeholder, command, onChange,
}: {
  role: SlotRole;
  label: string;
  placeholder: string;
  command: string;
  onChange: (v: string) => void;
}) {
  const t = useTokens();
  const [draft, setDraft] = useState(command);
  useEffect(() => { setDraft(command); }, [command]);
  const presetRole: PresetRole | undefined = role === 'frontend' ? 'frontend'
    : role === 'backend' ? 'backend'
    : undefined;

  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: t.bg2, border: `1px solid ${t.glassBorder}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, color: t.text1, fontWeight: 600 }}>{label}</div>
        <PresetMenu role={presetRole ?? 'any'} currentCommand={draft}
          onPick={(cmd) => { setDraft(cmd); onChange(cmd); }}
          onSaveAs={(name) => {
            // saved inside PresetMenu via hook
            // also persist current command if name given
            if (!draft.trim()) return;
            return { name, command: draft };
          }}/>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            border: `1px solid ${t.glassBorder}`, background: t.bg3,
            color: t.text0, outline: 'none',
            fontFamily: t.fontMono, fontSize: 12,
          }}
        />
        <Btn kind="primary" size="sm" onClick={() => onChange(draft)} disabled={draft === command}>
          Guardar
        </Btn>
      </div>
    </div>
  );
}

function PresetMenu({
  role, currentCommand, onPick,
}: {
  role: PresetRole;
  currentCommand: string;
  onPick: (command: string) => void;
  onSaveAs?: (name: string) => unknown;
}) {
  const t = useTokens();
  const { forRole, add, remove } = useDevPresets();
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const items = forRole(role);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open && !saveOpen) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false); setSaveOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, saveOpen]);

  function saveAndClose() {
    if (!saveName.trim() || !currentCommand.trim()) return;
    add({ name: saveName.trim(), command: currentCommand.trim(), role });
    setSaveName('');
    setSaveOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button"
          onClick={() => { setOpen((o) => !o); setSaveOpen(false); }}
          style={{
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${t.glassBorder}`,
            background: t.bg3, color: t.text1,
            fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          Usar preset… <span style={{ color: t.text3, fontSize: 10 }}>▾</span>
        </button>
        {currentCommand.trim() && (
          <button type="button"
            title="Guardar comando actual como preset"
            onClick={() => { setSaveOpen((o) => !o); setOpen(false); }}
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: `1px solid ${t.glassBorder}`,
              background: t.bg3, color: t.text2, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconPlus size={12}/>
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          minWidth: 260, maxWidth: 360, zIndex: 20,
          background: t.bg1, border: `1px solid ${t.glassBorder}`,
          borderRadius: 10, padding: 6,
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          {items.length === 0 ? (
            <div style={{ padding: 10, fontSize: 11.5, color: t.text3, textAlign: 'center' }}>
              Sin presets para este rol.
            </div>
          ) : items.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px', borderRadius: 6,
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = t.bg3}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <button type="button"
                onClick={() => { onPick(p.command); setOpen(false); }}
                style={{
                  flex: 1, minWidth: 0, padding: 0, border: 0,
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text0 }}>{p.name}</div>
                <code style={{
                  display: 'block', fontFamily: t.fontMono, fontSize: 10.5,
                  color: t.text3, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.command}</code>
              </button>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                title={p.builtin ? 'Ocultar preset' : 'Borrar preset'}
                style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: 'transparent', border: 0,
                  color: t.text3, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <IconTrash size={11}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {saveOpen && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          width: 260, zIndex: 20,
          background: t.bg1, border: `1px solid ${t.glassBorder}`,
          borderRadius: 10, padding: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>
            Guardar como preset {role !== 'any' && (<span style={{ color: t.accent }}>({role})</span>)}
          </div>
          <input
            autoFocus value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveAndClose(); if (e.key === 'Escape') setSaveOpen(false); }}
            placeholder="Nombre del preset"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '6px 8px', borderRadius: 6,
              border: `1px solid ${t.glassBorder}`, background: t.bg3,
              color: t.text0, outline: 'none',
              fontFamily: t.fontSans, fontSize: 12,
              marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setSaveOpen(false)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'transparent', color: t.text2,
                border: `1px solid ${t.glassBorder}`, cursor: 'pointer',
                fontSize: 11.5,
              }}>Cancelar</button>
            <button type="button" onClick={saveAndClose} disabled={!saveName.trim()}
              style={{
                padding: '4px 10px', borderRadius: 6,
                background: t.accent, color: t.accentOn, border: 0,
                cursor: saveName.trim() ? 'pointer' : 'default',
                fontSize: 11.5, fontWeight: 600,
                opacity: saveName.trim() ? 1 : 0.5,
              }}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogsPane({
  label, logs, accent, minimized, onToggle,
  bubbleId, workspace, logSource,
}: {
  label: string;
  logs: string;
  accent: string;
  minimized?: boolean;
  onToggle?: () => void;
  bubbleId?: string;
  workspace?: string;
  // Etiqueta usada en el prompt enviado a Claude para que sepa de qué pane vino.
  logSource?: 'frontend' | 'backend' | 'server';
}) {
  const t = useTokens();
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${t.glassBorder}`,
      background: '#0c0e14',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      minHeight: minimized ? 'auto' : 320,
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
          {logs.length.toLocaleString()} chars
        </span>
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
          logs={logs} accent={accent}
          bubbleId={bubbleId} workspace={workspace} logSource={logSource}
        />
      )}
    </div>
  );
}

// Viewer de logs renderizado con xterm.js — interpreta secuencias ANSI
// (colores, bold, dim, etc.) fielmente como una terminal real. El input
// nativo está deshabilitado: es solo lectura. En cada update, escribimos
// solo el delta para evitar parpadeo / scroll perdido.
//
// Selección: cuando el user selecciona texto (drag con el mouse) aparece
// una mini barra flotante con "Enviar a Claude" que escribe el texto al
// PTY del agente (donde corre Claude CLI).
function TerminalLogs({
  logs, accent, bubbleId, workspace,
}: {
  logs: string;
  accent: string;
  bubbleId?: string;
  workspace?: string;
  logSource?: 'frontend' | 'backend' | 'server';
}) {
  const t = useTokens();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastLenRef = useRef<number>(0);
  const [selection, setSelection] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

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
      scrollback: 10000,
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

    // Cada vez que cambia la selección del usuario, sincronizamos el estado
    // de React para mostrar/esconder la mini barra de acciones.
    const onSel = term.onSelectionChange(() => {
      setSelection(term.getSelection());
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* noop */ }
    });
    ro.observe(container);

    return () => {
      onSel.dispose();
      ro.disconnect();
      try { term.dispose(); } catch { /* noop */ }
      termRef.current = null;
      fitRef.current = null;
      lastLenRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const prevLen = lastLenRef.current;
    if (logs.length < prevLen) {
      term.clear();
      if (logs) term.write(logs);
      lastLenRef.current = logs.length;
    } else if (logs.length > prevLen) {
      term.write(logs.slice(prevLen));
      lastLenRef.current = logs.length;
    }
  }, [logs]);

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
      ecoEmit('eco:switch_tab', { tab: 'terminal' });
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

