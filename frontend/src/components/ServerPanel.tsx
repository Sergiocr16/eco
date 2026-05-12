// Panel de control del dev server por agente — separado del navegador
// porque son cosas distintas (proceso vs página). Cuando el server arranca,
// el panel Navegador se navega automáticamente a la URL emitida.

import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import {
  IconPlay, IconStop, IconResume, IconSearch, IconX, IconCpu, IconAlert,
} from '@/design/icons';
import { Glass, SectionLabel, Btn } from '@/design/primitives';
import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { useSkills } from '@/hooks/useSkills';

type Status = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

type DevStatusEvent = {
  bubbleId: string;
  status: Status;
  port?: number;
  url?: string;
  command?: string;
  exitCode?: number;
  skill?: string;
};

const SKILL_KEY = (bubbleId: string) => `eco.dev.skill.${bubbleId}`;
const CMD_KEY = (bubbleId: string) => `eco.dev.cmd.${bubbleId}`;

export function ServerPanel({ bubbleId, workspace }: { bubbleId: string; workspace: string }) {
  const t = useTokens();
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [, setCommand] = useState('');
  const [logs, setLogs] = useState('');
  const [activeSkill, setActiveSkill] = useState<string>(() => {
    try { return window.localStorage.getItem(SKILL_KEY(bubbleId)) ?? ''; } catch { return ''; }
  });
  const [customCmd, setCustomCmd] = useState<string>(() => {
    try { return window.localStorage.getItem(CMD_KEY(bubbleId)) ?? ''; } catch { return ''; }
  });
  const [mode, setMode] = useState<'skill' | 'command'>(() => {
    return customCmd ? 'command' : 'skill';
  });
  const [actionBusy, setActionBusy] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const logsRef = useRef<HTMLPreElement | null>(null);

  // Status inicial al montar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(`/dev/status?bubbleId=${encodeURIComponent(bubbleId)}`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        setStatus(data.status);
        setUrl(data.url ?? '');
        setCommand(data.command ?? '');
        if (data.skill && data.skill !== activeSkill) {
          setActiveSkill(data.skill);
          try { window.localStorage.setItem(SKILL_KEY(bubbleId), data.skill); } catch { /* noop */ }
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId]);

  // Stream del estado vía WS — ws-server.ts emite eco:dev_status cuando cambia.
  useEffect(() => {
    return ecoOn('eco:dev_status', (e: DevStatusEvent) => {
      if (e.bubbleId !== bubbleId) return;
      setStatus(e.status);
      setUrl(e.url ?? '');
      setCommand(e.command ?? '');
      if (e.skill && e.skill !== activeSkill) {
        setActiveSkill(e.skill);
        try { window.localStorage.setItem(SKILL_KEY(bubbleId), e.skill); } catch { /* noop */ }
      }
      // Auto-binding: cuando el server arranca con URL, emitimos un evento
      // global para que el BrowserPanel del agente se navegue solo a esa URL.
      if (e.status === 'running' && e.url) {
        ecoEmit('eco:browser_navigate', { bubbleId, url: e.url });
      }
    });
  }, [bubbleId, activeSkill]);

  // Poll de logs cada 1.5s cuando hay actividad (starting / running / error reciente).
  useEffect(() => {
    if (status !== 'starting' && status !== 'running' && status !== 'error') return;
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const r = await apiFetch(`/dev/logs?bubbleId=${encodeURIComponent(bubbleId)}`);
        if (!r.ok || cancelled) return;
        const text = await r.text();
        setLogs(text);
      } catch { /* noop */ }
    };
    void fetchLogs();
    const iv = setInterval(fetchLogs, 1500);
    return () => { cancelled = true; clearInterval(iv); };
  }, [bubbleId, status]);

  // Auto-scroll logs al final.
  useEffect(() => {
    const el = logsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  async function runAction(action: 'up' | 'down' | 'restart') {
    setActionError(null);
    setActionBusy(action === 'up' ? 'start' : action === 'down' ? 'stop' : 'restart');
    try {
      if (mode === 'skill') {
        if (!activeSkill) {
          setActionError('Elegí un skill primero.');
          setActionBusy(null);
          return;
        }
        const r = await apiFetch('/dev/skill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace, bubbleId, skill: activeSkill, action }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.ok === false) setActionError(data.error || data.message || `HTTP ${r.status}`);
      } else {
        // modo comando bash directo
        if (action === 'up') {
          if (!customCmd.trim()) { setActionError('Definí el comando para iniciar.'); setActionBusy(null); return; }
          const r = await apiFetch('/dev/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace, bubbleId, command: customCmd }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.ok === false) setActionError(data.error || data.message || `HTTP ${r.status}`);
        } else if (action === 'down') {
          const r = await apiFetch('/dev/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bubbleId }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.ok === false) setActionError(data.error || data.message || `HTTP ${r.status}`);
        } else {
          const r = await apiFetch('/dev/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bubbleId }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.ok === false) setActionError(data.error || data.message || `HTTP ${r.status}`);
        }
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error de red');
    }
    setActionBusy(null);
  }

  function pickSkill(name: string) {
    setActiveSkill(name);
    try { window.localStorage.setItem(SKILL_KEY(bubbleId), name); } catch { /* noop */ }
    setShowSkillPicker(false);
  }

  function saveCustomCmd(v: string) {
    setCustomCmd(v);
    try {
      if (v) window.localStorage.setItem(CMD_KEY(bubbleId), v);
      else window.localStorage.removeItem(CMD_KEY(bubbleId));
    } catch { /* noop */ }
  }

  const statusColor =
    status === 'running' ? t.ok :
    status === 'starting' ? t.warn :
    status === 'error' ? t.err :
    t.text3;

  const statusLabel =
    status === 'running' ? 'Corriendo' :
    status === 'starting' ? 'Iniciando…' :
    status === 'stopped' ? 'Detenido' :
    status === 'error' ? 'Error' :
    'Inactivo';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* Header con estado */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconCpu size={20}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text0, marginBottom: 2 }}>
              Instancia del dev server
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: statusColor,
                boxShadow: status === 'starting' || status === 'running' ? `0 0 8px ${statusColor}` : 'none',
                animation: status === 'starting' ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
              }}/>
              <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.text2 }}>
                {statusLabel}
              </span>
              {url && (
                <button
                  type="button"
                  onClick={() => ecoEmit('eco:browser_navigate', { bubbleId, url })}
                  title="Abrir en pestaña Navegador"
                  style={{
                    fontFamily: t.fontMono, fontSize: 11,
                    background: 'transparent', border: 0,
                    color: t.accent, cursor: 'pointer', padding: 0,
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}>
                  {url}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <Btn
            kind="primary" size="md"
            onClick={() => void runAction('up')}
            disabled={!!actionBusy || status === 'running' || status === 'starting'}
            icon={IconPlay}>
            {actionBusy === 'start' ? 'Iniciando…' : 'Iniciar'}
          </Btn>
          <Btn
            kind="secondary" size="md"
            onClick={() => void runAction('restart')}
            disabled={!!actionBusy}
            icon={IconResume}>
            {actionBusy === 'restart' ? 'Reiniciando…' : 'Reiniciar'}
          </Btn>
          <Btn
            kind="danger" size="md"
            onClick={() => void runAction('down')}
            disabled={!!actionBusy || status === 'idle' || status === 'stopped'}
            icon={IconStop}>
            {actionBusy === 'stop' ? 'Deteniendo…' : 'Detener'}
          </Btn>
        </div>

        {actionError && (
          <div style={{
            padding: '10px 12px', marginBottom: 16, borderRadius: 8,
            background: t.bg2, border: `1px solid ${t.err}`,
            color: t.err, fontSize: 11.5, fontFamily: t.fontMono,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <IconAlert size={13} style={{ marginTop: 1, flexShrink: 0 }}/>
            <div style={{ flex: 1 }}>{actionError}</div>
          </div>
        )}

        {/* Toggle de modo */}
        <SectionLabel>Cómo se controla este server</SectionLabel>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setMode('skill')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${mode === 'skill' ? t.accent : t.glassBorder}`,
              background: mode === 'skill' ? t.accentFaint : t.bg2,
              color: mode === 'skill' ? t.accent : t.text1,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
              textAlign: 'left',
            }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Skill de Claude</div>
            <div style={{ fontSize: 10.5, color: t.text3, fontWeight: 400 }}>
              Recomendado · el skill define los comandos
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode('command')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${mode === 'command' ? t.accent : t.glassBorder}`,
              background: mode === 'command' ? t.accentFaint : t.bg2,
              color: mode === 'command' ? t.accent : t.text1,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
              textAlign: 'left',
            }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Comando bash directo</div>
            <div style={{ fontSize: 10.5, color: t.text3, fontWeight: 400 }}>
              Vos definís el comando, Eco gestiona el puerto
            </div>
          </button>
        </div>

        {mode === 'skill' ? (
          <SkillModeConfig
            workspace={workspace}
            activeSkill={activeSkill}
            onPick={pickSkill}
            showPicker={showSkillPicker}
            setShowPicker={setShowSkillPicker}
          />
        ) : (
          <CommandModeConfig
            customCmd={customCmd}
            onChange={saveCustomCmd}
          />
        )}

        {/* Descripción de cómo funciona */}
        <Glass radius={10} style={{
          padding: 14, marginTop: 16,
          background: t.bg2,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            fontSize: 11, color: t.accent, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: 0.3,
          }}>
            <IconCpu size={11}/> Cómo funciona
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>
            {mode === 'skill' ? (
              <>Eco invoca el skill <code style={mono(t)}>/{activeSkill || '<skill>'} up|down|restart</code> con <code style={mono(t)}>claude -p</code> dentro del worktree del agente. El skill debe imprimir el comando real envuelto en <code style={mono(t)}>&lt;cmd&gt;...&lt;/cmd&gt;</code>; Eco lo ejecuta con un puerto único asignado por agente (<code style={mono(t)}>$PORT</code>) y reintenta hasta 2 veces parcheando configs hardcoded si detecta conflicto. Al detener, Eco mata el process group entero (no solo el padre) y verifica que el puerto realmente quede libre antes de reportar "detenido".</>
            ) : (
              <>Eco ejecuta tu comando directamente dentro del worktree del agente. Setea <code style={mono(t)}>$PORT</code> a un puerto libre por agente — el comando debe respetarlo (por ej. <code style={mono(t)}>vite --port $PORT</code> o leyendo <code style={mono(t)}>process.env.PORT</code> en config). Al detener, Eco mata el process group entero, libera el puerto y verifica el cleanup con <code style={mono(t)}>lsof</code>.</>
            )}
          </div>
        </Glass>

        {/* Logs del server */}
        {logs && (
          <>
            <SectionLabel>Logs ({logs.length.toLocaleString()} chars)</SectionLabel>
            <pre
              ref={logsRef}
              style={{
                margin: 0, padding: 12, borderRadius: 8,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                fontFamily: t.fontMono, fontSize: 11, lineHeight: 1.5,
                color: t.text1, maxHeight: 320, overflow: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{logs}</pre>
          </>
        )}
      </div>
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

function SkillModeConfig({
  workspace, activeSkill, onPick, showPicker, setShowPicker,
}: {
  workspace: string;
  activeSkill: string;
  onPick: (name: string) => void;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
}) {
  const t = useTokens();
  const { skills } = useSkills(workspace);
  const [query, setQuery] = useState('');
  const filtered = skills
    .filter((sk) => sk.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  return (
    <>
      <div style={{
        padding: 12, borderRadius: 10,
        background: t.bg2, border: `1px solid ${t.glassBorder}`,
      }}>
        <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>Skill activo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{
            flex: 1, fontFamily: t.fontMono, fontSize: 12, color: t.text0,
            padding: '4px 8px', background: t.bg3, borderRadius: 6,
          }}>
            {activeSkill ? `/${activeSkill}` : 'sin seleccionar'}
          </code>
          <Btn kind="secondary" size="sm" onClick={() => setShowPicker(!showPicker)}>
            {activeSkill ? 'Cambiar' : 'Elegir skill'}
          </Btn>
        </div>
      </div>

      {showPicker && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 10,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          maxHeight: 280, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconSearch size={12}/>
            <input
              autoFocus value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar skill…"
              style={{
                flex: 1, padding: '4px 8px', borderRadius: 6,
                border: `1px solid ${t.glassBorder}`, background: t.bg3,
                color: t.text0, outline: 'none',
                fontFamily: t.fontMono, fontSize: 12,
              }}
            />
            <button type="button" onClick={() => setShowPicker(false)}
              style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
              <IconX size={12}/>
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 10, fontSize: 11.5, color: t.text3, textAlign: 'center' }}>
                Sin skills detectados en este workspace.
              </div>
            ) : filtered.map((sk) => (
              <button
                key={`${sk.source}-${sk.name}`}
                type="button"
                onClick={() => onPick(sk.name)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 6, border: 0,
                  background: 'transparent', color: t.text0,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: t.fontSans, fontSize: 12,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = t.bg3}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <code style={{ fontFamily: t.fontMono, fontSize: 11, color: t.accent }}>/{sk.name}</code>
                {sk.description && (
                  <span style={{
                    flex: 1, color: t.text3, fontSize: 11,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{sk.description}</span>
                )}
                <span style={{ fontSize: 9.5, color: t.text3 }}>{sk.source}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CommandModeConfig({
  customCmd, onChange,
}: {
  customCmd: string;
  onChange: (v: string) => void;
}) {
  const t = useTokens();
  const [draft, setDraft] = useState(customCmd);
  useEffect(() => { setDraft(customCmd); }, [customCmd]);
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: t.bg2, border: `1px solid ${t.glassBorder}`,
    }}>
      <div style={{ fontSize: 11, color: t.text2, marginBottom: 6 }}>Comando para iniciar el server</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
          placeholder="npm run dev"
          spellCheck={false}
          autoCorrect="off"
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            border: `1px solid ${t.glassBorder}`, background: t.bg3,
            color: t.text0, outline: 'none',
            fontFamily: t.fontMono, fontSize: 12,
          }}
        />
        <Btn kind="primary" size="sm" onClick={() => onChange(draft)} disabled={draft === customCmd}>
          Guardar
        </Btn>
      </div>
      <div style={{ marginTop: 8, fontSize: 10.5, color: t.text3, lineHeight: 1.5 }}>
        Eco asigna un <code style={mono(t)}>$PORT</code> único por agente y lo pasa en el environment.
        Para que <em>realmente</em> use ese puerto, tu config debe leerlo (ej. <code style={mono(t)}>vite --port $PORT</code>, <code style={mono(t)}>process.env.PORT || 3000</code>, <code style={mono(t)}>-Dserver.port=$PORT</code>).
        Restart y Stop matan el process group entero y verifican el puerto con lsof.
      </div>
    </div>
  );
}
