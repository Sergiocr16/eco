import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconArrowL, IconResume, IconGlobe, IconExt, IconX } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { SmartBrowserView, type SmartBrowserHandle } from './SmartBrowserView';

type Props = {
  bubbleId: string;
  // workspace queda como prop por compat con el callsite, pero ya no se usa
  // adentro — el control del server se movió al ServerPanel.
  workspace?: string;
};

type DevStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

const storageKey = (id: string) => `eco.browser.url.${id}`;
const zoomStorageKey = (id: string) => `eco.browser.zoom.${id}`;
// Cap del buffer de logs del server panel — evita crecimiento sin cota con
// frameworks ruidosos. xterm internal scrollback se encarga del scroll.
const SERVER_LOGS_MAX = 200_000;
// Cap del historial de entradas en la console del DevTools panel.
const DEVLOG_MAX = 200;
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

export function BrowserPanel({ bubbleId }: Props) {
  const t = useTokens();
  const iframeRef = useRef<HTMLIFrameElement>(null); // legacy: scrollIntoView solo
  const smartRef = useRef<SmartBrowserHandle | null>(null);
  const [url, setUrl] = useState<string>(() => {
    try { return window.localStorage.getItem(storageKey(bubbleId)) ?? ''; } catch { return ''; }
  });
  const [draft, setDraft] = useState<string>(url);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoomState] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(zoomStorageKey(bubbleId));
      if (!raw) return 1;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0.25 && n <= 3 ? n : 1;
    } catch { return 1; }
  });
  // Wrap setZoom para que CADA cambio escriba a LS inmediatamente — más
  // robusto que un useEffect aparte, que puede no dispararse en HMR /
  // unmount rápido y deja el valor sin persistir.
  const setZoom = (next: number) => {
    setZoomState(next);
    try { window.localStorage.setItem(zoomStorageKey(bubbleId), String(next)); }
    catch { /* noop */ }
  };
  const [devOpen, setDevOpen] = useState(false);
  // Estado del dev server por agente — solo para mostrar logs/URL en el panel
  // DevTools, ya NO se controla desde acá (eso vive en el ServerPanel).
  const [serverStatus, setServerStatus] = useState<DevStatus>('idle');
  const [serverUrl, setServerUrl] = useState('');
  const lastAutoNavRef = useRef<string>('');
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
    // Notificar al resto de la UI (useBubbleActive, Dashboard) sin que tengan
    // que pollear localStorage. El storage event no dispara en la misma tab,
    // por eso usamos eco-bus.
    ecoEmit('eco:browser_url_changed', { bubbleId, hasUrl: !!url });
  }, [url, bubbleId]);

  useEffect(() => { setDraft(url); }, [url]);

  function go(raw: string) {
    const n = normalizeUrl(raw);
    if (!n) return;
    setLoadFailed(false);
    setUrl(n);
  }

  function reload() {
    setLoadFailed(false);
    // Reload imperativo del webview existente — sin recrearlo.
    smartRef.current?.reload();
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
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [bubbleId]);

  // Auto-navigate desde el ServerPanel cuando el user clickea la URL del
  // server. Guardamos contra mismo-URL para evitar recrear el webview si
  // alguien emite el evento repetido (defensa en profundidad).
  const lastNavUrlRef = useRef<string>('');
  useEffect(() => { lastNavUrlRef.current = url; }, [url]);
  useEffect(() => {
    return ecoOn('eco:browser_navigate', (d) => {
      if (d.bubbleId !== bubbleId) return;
      if (!d.url) return;
      if (d.url === lastNavUrlRef.current) return;
      lastNavUrlRef.current = d.url;
      setLoadFailed(false);
      setUrl(d.url);
    });
  }, [bubbleId]);

  // Live updates via eco-bus (App.tsx re-emite dev_status del WS).
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubbleId) return;
      setServerStatus(d.status);
      setServerUrl(d.url);
      // Auto-navegamos cuando arranca, una sola vez por arranque.
      if (d.status === 'running' && d.url && lastAutoNavRef.current !== d.url) {
        lastAutoNavRef.current = d.url;
        setLoadFailed(false);
        setUrl(d.url);
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

  // Auto-open del DevTools panel con la tab Server cuando arranca el server,
  // una sola vez por ciclo. Los logs se streamean por WS — no hay polling.
  const autoOpenedRef = useRef<string>('');
  useEffect(() => {
    if (serverStatus === 'starting' && autoOpenedRef.current !== 'starting') {
      autoOpenedRef.current = 'starting';
      setDevOpen(true);
      setDevTab('server');
    }
    if (serverStatus !== 'starting') autoOpenedRef.current = '';
    // Snapshot inicial al cambiar de status starting/running — siembra el
    // viewer con lo que ya esté acumulado en el ring buffer del backend.
    if (serverStatus === 'starting' || serverStatus === 'running') {
      void (async () => {
        const text = await loadLogs();
        setServerLogs(text);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverStatus, bubbleId]);

  // Stream de log chunks por WS — reemplaza el polling cada 1.5s.
  useEffect(() => {
    return ecoOn('eco:dev_log', (e) => {
      if (e.bubbleId !== bubbleId) return;
      // BrowserPanel ve los logs del rol 'main' (single server). El dual mode
      // muestra logs por rol en el ServerPanel.
      if (e.role !== 'main') return;
      setServerLogs((prev) => (prev + e.chunk).slice(-SERVER_LOGS_MAX));
    });
  }, [bubbleId]);

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
    setDevLog((prev) => [...prev.slice(-(DEVLOG_MAX - 1)), { ts: Date.now(), kind: 'info', text: `› ${code}` }]);
    setEvalInput('');
    try {
      const ifr = iframeRef.current;
      const win = ifr?.contentWindow as (Window & { eval: (s: string) => unknown }) | null;
      if (!win) throw new Error('iframe sin contentWindow');
      // eslint-disable-next-line no-eval
      const result = (win.eval)(code);
      const text = (() => { try { return JSON.stringify(result); } catch { return String(result); } })();
      setDevLog((prev) => [...prev.slice(-(DEVLOG_MAX - 1)), { ts: Date.now(), kind: 'log', text }]);
    } catch (e) {
      setDevLog((prev) => [...prev.slice(-(DEVLOG_MAX - 1)), {
        ts: Date.now(), kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      }]);
    }
  }

  // El SmartBrowserView ya emite onLoadFail/onLoadSuccess vía did-fail-load
  // / did-finish-load del webview, así que no necesitamos watchdog acá.

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

function navBtnStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6, border: 0,
    background: t.bg2, color: t.text1, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  };
}
