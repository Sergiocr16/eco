import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconArrowL, IconResume, IconGlobe, IconExt, IconX, IconPlay, IconStop, IconSearch } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { on as ecoOn } from '@/lib/eco-bus';
import { useSkills } from '@/hooks/useSkills';
import { SmartBrowserView, type SmartBrowserHandle } from './SmartBrowserView';

type Props = {
  bubbleId: string;
  workspace: string;
};

type DevStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

const storageKey = (id: string) => `eco.browser.url.${id}`;
// Una pequeña home con shortcuts. Útil cuando todavía no se cargó nada.
const SHORTCUTS = [
  { label: 'localhost:5174', url: 'http://localhost:5174/' },
  { label: 'localhost:7000/health', url: 'http://localhost:7000/health' },
  { label: 'MDN', url: 'https://developer.mozilla.org/' },
  { label: 'Anthropic docs', url: 'https://docs.anthropic.com/' },
];

function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  // Si parece host/path, asumimos http:// (para dev servers).
  if (/^[\w.-]+(:\d+)?(\/|$)/.test(v)) return `http://${v}`;
  // Si tiene espacios o no parece URL, buscamos en Google.
  if (/\s/.test(v) || !v.includes('.')) {
    return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
  }
  return `https://${v}`;
}

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function BrowserPanel({ bubbleId, workspace }: Props) {
  const t = useTokens();
  const iframeRef = useRef<HTMLIFrameElement>(null); // legacy: scrollIntoView solo
  const smartRef = useRef<SmartBrowserHandle | null>(null);
  const [url, setUrl] = useState<string>(() => {
    try { return window.localStorage.getItem(storageKey(bubbleId)) ?? ''; } catch { return ''; }
  });
  const [draft, setDraft] = useState<string>(url);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [devOpen, setDevOpen] = useState(false);
  // Dev server por agente
  const [serverStatus, setServerStatus] = useState<DevStatus>('idle');
  const [serverUrl, setServerUrl] = useState('');
  const [serverCmd, setServerCmd] = useState('');
  const [serverBusy, setServerBusy] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [cmdOverrideOpen, setCmdOverrideOpen] = useState(false);
  const [cmdOverride, setCmdOverride] = useState('');
  const lastAutoNavRef = useRef<string>('');
  // Skill linkeado al server: se elige la 1ra vez y queda guardado en localStorage.
  const skillKey = `eco.dev.skill.${bubbleId}`;
  const [skill, setSkill] = useState<string>(() => {
    try { return window.localStorage.getItem(skillKey) ?? ''; } catch { return ''; }
  });
  const [pickingSkill, setPickingSkill] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const skillsHook = useSkills(workspace);
  type DevEntry = { ts: number; kind: 'log' | 'warn' | 'error' | 'info' | 'net'; text: string };
  const [devLog, setDevLog] = useState<DevEntry[]>([]);
  const [devTab, setDevTab] = useState<'console' | 'elements' | 'server'>('console');
  const [evalInput, setEvalInput] = useState('');
  const [serverLogs, setServerLogs] = useState('');

  useEffect(() => {
    try {
      if (url) window.localStorage.setItem(storageKey(bubbleId), url);
      else window.localStorage.removeItem(storageKey(bubbleId));
    } catch { /* noop */ }
  }, [url, bubbleId]);

  useEffect(() => { setDraft(url); }, [url]);

  function go(raw: string) {
    const n = normalizeUrl(raw);
    if (!n) return;
    setLoadFailed(false);
    setUrl(n);
    setRefreshKey((k) => k + 1);
  }

  function reload() {
    setLoadFailed(false);
    setRefreshKey((k) => k + 1);
  }

  function openInOs() {
    if (!url) return;
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
  }

  // ─── Dev server lifecycle ─────────────────────────────────────────────────
  // Snapshot inicial al montar / cuando cambia el agente.
  useEffect(() => {
    if (!bubbleId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(`/dev/status?bubbleId=${encodeURIComponent(bubbleId)}`);
        if (!r.ok || cancelled) return;
        const d = await r.json() as { status: DevStatus; url: string; command: string };
        setServerStatus(d.status);
        setServerUrl(d.url);
        setServerCmd(d.command);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [bubbleId]);

  // Live updates via eco-bus (App.tsx re-emite dev_status del WS).
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubbleId) return;
      setServerStatus(d.status);
      setServerUrl(d.url);
      setServerCmd(d.command);
      if (d.skill && d.skill !== skill) {
        setSkill(d.skill);
        try { window.localStorage.setItem(skillKey, d.skill); } catch { /* noop */ }
      }
      // Auto-navegamos cuando arranca, una sola vez por arranque.
      if (d.status === 'running' && d.url && lastAutoNavRef.current !== d.url) {
        lastAutoNavRef.current = d.url;
        setLoadFailed(false);
        setUrl(d.url);
        setRefreshKey((k) => k + 1);
      }
      if (d.status === 'stopped' || d.status === 'error') {
        lastAutoNavRef.current = '';
        // Cargamos logs al final del ciclo para que el user los vea siempre.
        (async () => {
          const text = await loadLogs();
          setServerLogs(text);
          if (d.status === 'error') {
            setDevOpen(true);
            setDevTab('server');
          }
        })();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleId]);

  // Mientras esté starting o running, polleamos logs cada 1.5s y mostramos el
  // DevTools panel con la tab Server para que el user siempre vea qué está
  // pasando. Para que no sea molesto, solo abrimos auto la primera vez del
  // ciclo — si el user lo cierra manualmente, respetamos.
  const autoOpenedRef = useRef<string>(''); // status que ya disparó auto-open
  useEffect(() => {
    if (serverStatus !== 'starting' && serverStatus !== 'running') return;
    // Abrir DevTools + tab Server cuando arrancamos, una vez.
    if (serverStatus === 'starting' && autoOpenedRef.current !== 'starting') {
      autoOpenedRef.current = 'starting';
      setDevOpen(true);
      setDevTab('server');
    }
    if (serverStatus !== 'starting') autoOpenedRef.current = '';
    let cancelled = false;
    const tick = async () => {
      const text = await loadLogs();
      if (!cancelled) setServerLogs(text);
    };
    void tick();
    const iv = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverStatus, bubbleId]);

  function chooseSkill(name: string) {
    setSkill(name);
    try { window.localStorage.setItem(skillKey, name); } catch { /* noop */ }
    setPickingSkill(false);
    // Tras elegir, arrancamos automático.
    void skillAction('up', name);
  }

  function clearSkill() {
    setSkill('');
    try { window.localStorage.removeItem(skillKey); } catch { /* noop */ }
    setPickingSkill(true);
  }

  async function skillAction(action: 'up' | 'down' | 'restart' | 'status', overrideSkill?: string) {
    const useSkill = (overrideSkill ?? skill).trim();
    if (!useSkill) { setPickingSkill(true); return; }
    const busyKind: 'start' | 'stop' | 'restart' =
      action === 'down' ? 'stop' : action === 'restart' ? 'restart' : 'start';
    setServerBusy(busyKind); setServerErr(null);
    try {
      const r = await apiFetch('/dev/skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, skill: useSkill, action }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok === false) setServerErr(d.error || `Falló /${useSkill} ${action}`);
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : 'Error');
    } finally { setServerBusy(null); }
  }

  async function startServer(commandOverride?: string) {
    setServerBusy('start'); setServerErr(null);
    try {
      const body: Record<string, unknown> = { workspace, bubbleId };
      const cmd = commandOverride?.trim() ?? cmdOverride.trim();
      if (cmd) body.command = cmd;
      const r = await apiFetch('/dev/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok === false) {
        setServerErr(d.error || 'No se pudo iniciar');
      } else if (d.command) {
        setServerCmd(d.command);
        setCmdOverrideOpen(false);
        setCmdOverride('');
      }
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : 'Error');
    } finally { setServerBusy(null); }
  }

  // (Helpers legacy de stop/restart vía /dev/stop /dev/restart están en el
  // backend para el modo "comando inferido". El flujo principal ahora es por skill.)

  async function loadLogs(): Promise<string> {
    try {
      const r = await apiFetch(`/dev/logs?bubbleId=${encodeURIComponent(bubbleId)}`);
      if (!r.ok) return '';
      return await r.text();
    } catch { return ''; }
  }

  function bumpZoom(dir: 'in' | 'out' | 'reset') {
    if (dir === 'reset') { setZoom(1); return; }
    const idx = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.001);
    const next = dir === 'in'
      ? ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)]
      : ZOOM_STEPS[Math.max(idx - 1, 0)];
    setZoom(next ?? 1);
  }

  // Console capture: en webview de Electron usamos su DevTools nativo (botón
  // derecho → Inspect). En iframe web puro estaríamos limitados por SOP, así
  // que mostramos un hint en lugar del warning anterior.

  function runEval() {
    const code = evalInput.trim();
    if (!code) return;
    setDevLog((prev) => [...prev, { ts: Date.now(), kind: 'info', text: `› ${code}` }]);
    setEvalInput('');
    try {
      const ifr = iframeRef.current;
      const win = ifr?.contentWindow as (Window & { eval: (s: string) => unknown }) | null;
      if (!win) throw new Error('iframe sin contentWindow');
      // eslint-disable-next-line no-eval
      const result = (win.eval)(code);
      const text = (() => { try { return JSON.stringify(result); } catch { return String(result); } })();
      setDevLog((prev) => [...prev, { ts: Date.now(), kind: 'log', text }]);
    } catch (e) {
      setDevLog((prev) => [...prev, {
        ts: Date.now(), kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      }]);
    }
  }

  // Watchdog: si pasaron 6s y nunca disparó onLoad, asumimos que el sitio bloqueó embedding.
  useEffect(() => {
    if (!url) return;
    let loaded = false;
    const iv = setTimeout(() => { if (!loaded) setLoadFailed(true); }, 6000);
    const ifr = iframeRef.current;
    const onLoad = () => { loaded = true; clearTimeout(iv); setLoadFailed(false); };
    ifr?.addEventListener('load', onLoad);
    return () => { clearTimeout(iv); ifr?.removeEventListener('load', onLoad); };
  }, [url, refreshKey]);

  const statusColor = serverStatus === 'running' ? t.ok
    : serverStatus === 'starting' ? t.warn
    : serverStatus === 'error' ? t.err
    : t.text3;
  const statusLabel = serverStatus === 'idle' ? 'sin server'
    : serverStatus === 'starting' ? 'iniciando…'
    : serverStatus === 'running' ? 'corriendo'
    : serverStatus === 'stopped' ? 'detenido'
    : 'error';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      background: t.bg0,
    }}>
      {/* Dev server bar */}
      {workspace && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          borderBottom: `1px solid ${t.glassBorder}`,
          background: t.bg1,
          minHeight: 36, flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 8px', borderRadius: 999,
            background: `color-mix(in oklch, ${statusColor} 14%, transparent)`,
            color: statusColor, fontFamily: t.fontMono, fontSize: 10.5,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusColor,
              animation: serverStatus === 'starting' || serverStatus === 'running'
                ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
              boxShadow: serverStatus === 'running' ? `0 0 6px ${statusColor}` : 'none',
            }}/>
            {statusLabel}
            {serverUrl && <span style={{ marginLeft: 4 }}>· :{new URL(serverUrl).port}</span>}
          </div>
          {serverCmd && (
            <span style={{
              fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
              maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1, minWidth: 0,
            }} title={serverCmd}>{serverCmd}</span>
          )}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
            {skill && (
              <span style={{
                fontFamily: t.fontMono, fontSize: 10.5, color: t.text2,
                padding: '2px 8px', borderRadius: 999,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
              }} title={`Skill: /${skill}`}>
                /{skill}
                <button type="button" onClick={clearSkill}
                  title="Cambiar skill"
                  style={{
                    marginLeft: 6, background: 'transparent', border: 0,
                    color: t.text3, cursor: 'pointer', padding: 0,
                  }}>×</button>
              </span>
            )}
            {serverStatus !== 'running' && serverStatus !== 'starting' ? (
              <button
                type="button"
                onClick={() => skill ? void skillAction('up') : setPickingSkill(true)}
                disabled={!!serverBusy}
                style={{ ...pillBtnStyle(t, false, t.accent), opacity: serverBusy ? 0.6 : 1 }}>
                <IconPlay size={11}/>
                <span style={{ marginLeft: 4 }}>
                  {serverBusy === 'start' ? 'Iniciando…' : (skill ? 'Iniciar' : 'Elegir skill para correr servidor')}
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void skillAction('restart')}
                  disabled={!!serverBusy}
                  title="Reiniciar"
                  style={pillBtnStyle(t)}>
                  <IconResume size={11}/>
                </button>
                <button
                  type="button"
                  onClick={() => void skillAction('down')}
                  disabled={!!serverBusy}
                  style={{ ...pillBtnStyle(t, false, t.err), opacity: serverBusy ? 0.6 : 1 }}>
                  <IconStop size={11}/>
                  <span style={{ marginLeft: 4 }}>Detener</span>
                </button>
              </>
            )}
          </div>
          {pickingSkill && (
            <div style={{
              width: '100%', marginTop: 4, padding: 10, borderRadius: 8,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 11.5, color: t.text1, fontFamily: t.fontSans }}>
                Elegí un skill que sepa levantar el server (con <code style={{ fontFamily: t.fontMono, fontSize: 10.5 }}>/&lt;skill&gt; up · down · restart · status</code>).
                Eco lo invoca con <code style={{ fontFamily: t.fontMono, fontSize: 10.5 }}>claude -p</code> y queda linkeado al agente.
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', borderRadius: 6,
                background: t.bg3, border: `1px solid ${t.glassBorder}`,
              }}>
                <IconSearch size={11}/>
                <input
                  autoFocus
                  value={skillQuery}
                  onChange={(e) => setSkillQuery(e.target.value)}
                  placeholder="Buscar skill por nombre o descripción…"
                  spellCheck={false}
                  autoCorrect="off"
                  style={{
                    flex: 1, minWidth: 0,
                    background: 'transparent', border: 0, outline: 'none',
                    fontFamily: t.fontMono, fontSize: 11.5, color: t.text0,
                  }}
                />
                {skillQuery && (
                  <button type="button" onClick={() => setSkillQuery('')}
                    style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
                    <IconX size={10}/>
                  </button>
                )}
              </div>
              <div style={{
                maxHeight: 360, overflow: 'auto',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                {skillsHook.loading ? (
                  <div style={{ padding: 10, fontSize: 11, color: t.text3, textAlign: 'center' }}>Cargando…</div>
                ) : skillsHook.skills.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 11, color: t.text3 }}>
                    No hay skills disponibles en este workspace. Creá uno en <code>{workspace}/.claude/commands/</code> o <code>~/.claude/commands/</code>.
                  </div>
                ) : (
                  // Ordenamos: project primero (más relevantes), después user, después plugin.
                  // No filtramos por kind — cualquier skill/command/agent puede manejar server lifecycle.
                  (() => {
                    const q = skillQuery.trim().toLowerCase();
                    const matched = q
                      ? skillsHook.skills.filter((s) =>
                          s.name.toLowerCase().includes(q) ||
                          (s.description ?? '').toLowerCase().includes(q),
                        )
                      : skillsHook.skills;
                    return [...matched]
                      .sort((a, b) => {
                        const order = { project: 0, user: 1, plugin: 2 } as const;
                        const oa = order[a.source] ?? 3;
                        const ob = order[b.source] ?? 3;
                        if (oa !== ob) return oa - ob;
                        return a.name.localeCompare(b.name);
                      });
                  })().map((sk) => (
                      <button
                        key={`${sk.source}:${sk.kind}:${sk.name}`}
                        type="button"
                        onClick={() => chooseSkill(sk.name)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '6px 8px', border: 0, borderRadius: 6,
                          background: 'transparent', cursor: 'pointer',
                          color: t.text1, textAlign: 'left',
                          fontFamily: t.fontSans, fontSize: 12,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = t.bg3}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <span style={{
                          fontFamily: t.fontMono, fontSize: 11.5,
                          color: sk.source === 'project' ? t.accent : t.text1,
                          fontWeight: 500, flexShrink: 0,
                        }}>/{sk.name}</span>
                        <span style={{
                          padding: '0 5px', borderRadius: 4, fontSize: 9.5,
                          background: t.bg3, color: t.text3,
                          fontFamily: t.fontMono, flexShrink: 0, marginTop: 1,
                        }}>{sk.kind}</span>
                        <span style={{
                          flex: 1, color: t.text2, fontSize: 11, lineHeight: 1.4,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>{sk.description}</span>
                      </button>
                    ))
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setPickingSkill(false)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 0, cursor: 'pointer',
                    background: t.bg3, color: t.text1,
                    fontFamily: t.fontSans, fontSize: 11,
                  }}>Cancelar</button>
              </div>
            </div>
          )}
          {cmdOverrideOpen && serverStatus !== 'running' && serverStatus !== 'starting' && (
            <div style={{ width: '100%', display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                value={cmdOverride}
                onChange={(e) => setCmdOverride(e.target.value)}
                placeholder="Comando custom (avanzado, sin usar skill)"
                spellCheck={false}
                autoCorrect="off"
                style={{
                  flex: 1,
                  background: t.bg2, border: `1px solid ${t.glassBorder}`,
                  borderRadius: 6, padding: '5px 8px',
                  fontFamily: t.fontMono, fontSize: 11, color: t.text0, outline: 'none',
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') void startServer(); }}
              />
              <button type="button" onClick={() => void startServer()}
                style={{ ...pillBtnStyle(t, false, t.accent), padding: '0 12px' }}>
                <IconPlay size={11}/>
              </button>
            </div>
          )}
          {serverErr && (
            <div style={{
              width: '100%',
              padding: '6px 8px', borderRadius: 6,
              background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
              color: t.err, fontFamily: t.fontMono, fontSize: 10.5,
              whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto',
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <span style={{ flex: 1 }}>{serverErr}</span>
              <button type="button" onClick={() => setServerErr(null)}
                style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}>
                <IconX size={10}/>
              </button>
            </div>
          )}
          {serverStatus === 'error' && (
            <div style={{
              width: '100%',
              padding: '6px 8px', borderRadius: 6,
              background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
              color: t.err, fontFamily: t.fontSans, fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1 }}>
                El server salió con error. Mirá los logs para entender qué pasó.
              </span>
              <button
                type="button"
                onClick={async () => {
                  setServerLogs(await loadLogs());
                  setDevOpen(true);
                  setDevTab('server');
                }}
                style={{
                  padding: '3px 10px', borderRadius: 5, border: 0, cursor: 'pointer',
                  background: t.err, color: t.accentOn,
                  fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
                }}>Ver logs</button>
            </div>
          )}
        </div>
      )}

      {/* URL bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
      }}>
        <button
          type="button"
          onClick={() => smartRef.current?.back()}
          title="Atrás"
          style={navBtnStyle(t)}>
          <IconArrowL size={12}/>
        </button>
        <button
          type="button"
          onClick={reload}
          title="Recargar"
          disabled={!url}
          style={{ ...navBtnStyle(t), opacity: url ? 1 : 0.4 }}>
          <IconResume size={12}/>
        </button>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 8,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          <IconGlobe size={11}/>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go(draft); }}
            placeholder="URL o búsqueda…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              fontFamily: t.fontMono, fontSize: 12, color: t.text0,
            }}
          />
          {draft && (
            <button type="button" onClick={() => { setDraft(''); }}
              style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
              <IconX size={11}/>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => go(draft)}
          disabled={!draft.trim()}
          style={{
            padding: '4px 12px', height: 26, borderRadius: 8, border: 0,
            background: t.accent, color: t.accentOn,
            fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            opacity: draft.trim() ? 1 : 0.5,
          }}>Ir</button>
        {/* Zoom controls */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '2px 4px', borderRadius: 6,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          <button type="button" onClick={() => bumpZoom('out')} title="Zoom out"
            style={{ ...zoomBtnStyle(t) }}>−</button>
          <button type="button" onClick={() => bumpZoom('reset')} title="Reset zoom"
            style={{
              minWidth: 38, padding: '0 4px', height: 22, border: 0, borderRadius: 4,
              background: 'transparent', color: t.text1, cursor: 'pointer',
              fontFamily: t.fontMono, fontSize: 10.5,
            }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => bumpZoom('in')} title="Zoom in"
            style={{ ...zoomBtnStyle(t) }}>+</button>
        </div>
        <button
          type="button"
          onClick={() => setDevOpen((v) => !v)}
          title="DevTools (console + eval)"
          style={{
            ...navBtnStyle(t),
            background: devOpen ? t.accent : t.bg2,
            color: devOpen ? t.accentOn : t.text1,
            fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
            width: 32,
          }}>{'{ }'}</button>
        <button
          type="button"
          onClick={openInOs}
          disabled={!url}
          title="Abrir en navegador del sistema"
          style={{ ...navBtnStyle(t), opacity: url ? 1 : 0.4 }}>
          <IconExt size={11}/>
        </button>
      </div>

      {/* Contenido */}
      <div style={{
        flex: 1, position: 'relative', minHeight: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {!url ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 24, gap: 16,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: t.accentFaint, color: t.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconGlobe size={22}/>
            </div>
            <div style={{ fontSize: 14, color: t.text1, fontWeight: 500 }}>
              Navegá desde la conversación
            </div>
            <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', maxWidth: 360 }}>
              Útil para dev servers locales (ej. localhost:3000) o sitios que permiten embebido.
              Si un sitio bloquea iframes, podés abrirlo en el navegador del sistema con el botón ↗.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
              {SHORTCUTS.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  onClick={() => go(s.url)}
                  style={{
                    padding: '6px 12px', borderRadius: 999,
                    background: t.bg2, border: `1px solid ${t.glassBorder}`,
                    color: t.text1, fontFamily: t.fontMono, fontSize: 11.5,
                    cursor: 'pointer',
                  }}>{s.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div
              key={refreshKey}
              style={{
                // Zoom emulado: escalamos y expandimos el tamaño para que la "ventana
                // virtual" del sitio sea más grande que el contenedor, dando la sensación
                // de zoom Chrome.
                width: `${100 / zoom}%`, height: `${100 / zoom}%`,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                background: 'white',
              }}>
              <SmartBrowserView
                ref={smartRef}
                src={url}
                onLoadFail={() => setLoadFailed(true)}
                onLoadSuccess={() => setLoadFailed(false)}
              />
            </div>
            {loadFailed && (
              <div style={{
                position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                padding: '10px 14px', borderRadius: 10,
                background: t.bg1, border: `1px solid ${t.warn}`,
                color: t.text0, fontSize: 12.5, lineHeight: 1.5,
                maxWidth: 'min(420px, 90%)',
                boxShadow: t.shadowLg,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{
                  flexShrink: 0, marginTop: 1,
                  color: t.warn, fontSize: 18, lineHeight: 1,
                }}>!</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>El sitio bloqueó el embebido</div>
                  <div style={{ fontSize: 11.5, color: t.text2 }}>
                    Muchos sitios (Google, GitHub, banks) impiden cargarse adentro de un iframe.
                    Abrilo en tu navegador con el botón ↗.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLoadFailed(false)}
                  style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
                  <IconX size={12}/>
                </button>
              </div>
            )}
          </>
        )}
        </div>

        {/* DevTools split */}
        {devOpen && (
          <div style={{
            height: 240, minHeight: 120,
            display: 'flex', flexDirection: 'column',
            borderTop: `1px solid ${t.glassBorder}`,
            background: t.bg1,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px',
              borderBottom: `1px solid ${t.glassBorder}`,
              background: t.bg2,
            }}>
              <DevTab active={devTab === 'console'} onClick={() => setDevTab('console')}>Console</DevTab>
              <DevTab active={devTab === 'elements'} onClick={() => setDevTab('elements')}>Elements</DevTab>
              <DevTab active={devTab === 'server'} onClick={async () => {
                setDevTab('server');
                setServerLogs(await loadLogs());
              }}>Server</DevTab>
              <div style={{ flex: 1 }}/>
              <button type="button" onClick={() => setDevLog([])}
                style={{
                  height: 22, padding: '0 8px', borderRadius: 5, border: 0,
                  background: t.bg3, color: t.text2, cursor: 'pointer',
                  fontFamily: t.fontSans, fontSize: 10.5,
                }}>Clear</button>
              <button type="button" onClick={() => setDevOpen(false)}
                style={{
                  width: 22, height: 22, borderRadius: 5, border: 0, padding: 0,
                  background: 'transparent', color: t.text3, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <IconX size={10}/>
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 10px' }}>
              {devTab === 'console' && (
                <>
                  {devLog.length === 0 ? (
                    <div style={{ color: t.text3, fontSize: 11, fontFamily: t.fontMono }}>
                      Para DevTools completos: click derecho en la página → Inspect.
                    </div>
                  ) : devLog.map((e, i) => (
                    <div key={i} style={{
                      fontFamily: t.fontMono, fontSize: 11, lineHeight: 1.5,
                      color: e.kind === 'error' ? t.err
                           : e.kind === 'warn' ? t.warn
                           : e.kind === 'info' ? t.accent
                           : t.text1,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      borderBottom: `1px solid ${t.glassBorder}`,
                      padding: '2px 0',
                    }}>{e.text}</div>
                  ))}
                </>
              )}
              {devTab === 'elements' && (
                <div style={{ color: t.text3, fontSize: 11, fontFamily: t.fontMono, lineHeight: 1.55 }}>
                  Para inspeccionar el DOM, usá DevTools nativos: click derecho en la página → Inspect.
                  O escribí en la consola:
                  <pre style={{ marginTop: 8, padding: 8, background: t.bg2, borderRadius: 6, color: t.text1 }}>
{`document.documentElement.outerHTML.slice(0, 4000)`}
                  </pre>
                </div>
              )}
              {devTab === 'server' && (
                <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <button type="button" onClick={async () => setServerLogs(await loadLogs())}
                      style={{
                        padding: '3px 8px', borderRadius: 5, border: 0, cursor: 'pointer',
                        background: t.bg3, color: t.text1, fontFamily: t.fontSans, fontSize: 10.5,
                      }}>Refrescar</button>
                    <span style={{ color: t.text3, fontSize: 10.5, fontFamily: t.fontMono, alignSelf: 'center' }}>
                      {serverStatus === 'idle' ? 'Sin dev server activo' : `${statusLabel}${serverUrl ? ` · ${serverUrl}` : ''}`}
                    </span>
                  </div>
                  <pre style={{
                    margin: 0,
                    fontFamily: t.fontMono, fontSize: 11, lineHeight: 1.5,
                    color: t.text1, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{serverLogs || '(vacío)'}</pre>
                </div>
              )}
            </div>
            {devTab === 'console' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px',
                borderTop: `1px solid ${t.glassBorder}`,
                background: t.bg2,
              }}>
                <span style={{ color: t.accent, fontFamily: t.fontMono, fontSize: 12 }}>›</span>
                <input
                  value={evalInput}
                  onChange={(e) => setEvalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runEval(); }}
                  placeholder="JS para evaluar en el iframe (Enter para correr)…"
                  spellCheck={false}
                  autoCorrect="off"
                  style={{
                    flex: 1, background: 'transparent', border: 0, outline: 'none',
                    fontFamily: t.fontMono, fontSize: 11.5, color: t.text0,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DevTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 8px', borderRadius: 5, border: 0, cursor: 'pointer',
        background: active ? t.bg3 : 'transparent',
        color: active ? t.accent : t.text2,
        fontFamily: t.fontSans, fontSize: 10.5, fontWeight: 500,
      }}>{children}</button>
  );
}

function zoomBtnStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    width: 18, height: 22, padding: 0, border: 0, borderRadius: 4,
    background: 'transparent', color: t.text1, cursor: 'pointer',
    fontFamily: t.fontMono, fontSize: 13, lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

function pillBtnStyle(
  t: ReturnType<typeof useTokens>,
  active = false,
  bg?: string,
): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: 24, padding: '0 8px', border: 0, borderRadius: 6,
    background: bg ?? (active ? t.accent : t.bg2),
    color: bg ? t.accentOn : (active ? t.accentOn : t.text1),
    cursor: 'pointer',
    fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
  };
}

function navBtnStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6, border: 0,
    background: t.bg2, color: t.text1, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  };
}
