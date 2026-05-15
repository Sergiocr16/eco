import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconArrowL, IconResume, IconGlobe, IconExt, IconX, IconCopy, IconTerminal } from '@/design/icons';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { canEmbedArbitrarySites } from '@/lib/platform';
import { SmartBrowserView, type SmartBrowserHandle } from './SmartBrowserView';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { ecoToken } from '@/lib/eco-config';

type Props = {
  bubbleId: string;
  workspace?: string;
};

const storageKey = (id: string) => `eco.browser.url.${id}`;
const zoomStorageKey = (id: string) => `eco.browser.zoom.${id}`;
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
  // En Electron el <webview> expone los DevTools nativos completos de
  // Chromium (Elements, Network, Sources, Performance, Console…). En web
  // puro (iframe) no hay API equivalente.
  const hasNativeDevTools = canEmbedArbitrarySites();
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
  const lastAutoNavRef = useRef<string>('');

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

  // Copia la URL actual al clipboard.
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMsg('Copiada');
    } catch {
      setCopyMsg('Error al copiar');
    }
    setTimeout(() => setCopyMsg(null), 1500);
  }

  // Envía la URL actual al PTY del agente (donde corre claude CLI) y abre
  // la pestaña Terminal. Solo pega la URL en el prompt — NO presiona enter,
  // así el user puede agregar contexto antes de mandárselo a Claude.
  // Orden: PRIMERO escribimos al PTY, DESPUÉS cambiamos de tab. Si lo
  // hacemos al revés, la nueva RealTerminal monta y compite por la
  // conexión, y el texto se puede perder antes de que el snapshot incluya
  // el echo.
  const [sendingToClaude, setSendingToClaude] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  async function sendUrlToClaude() {
    if (!url || sendingToClaude) return;
    if (!workspace) { setSendMsg('Sin workspace'); setTimeout(() => setSendMsg(null), 2500); return; }
    setSendingToClaude(true);
    setSendMsg(null);
    const r = await writeToBubblePty({
      bubbleId,
      workspace,
      text: url,
      token: ecoToken(),
    });
    setSendingToClaude(false);
    if (r.ok) {
      setSendMsg('Pegada');
      ecoEmit('eco:switch_tab', { tab: 'terminal', bubbleId });
      setTimeout(() => setSendMsg(null), 1800);
    } else {
      setSendMsg(`Error: ${r.error}`);
      setTimeout(() => setSendMsg(null), 3500);
    }
  }

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

  // Live updates via eco-bus (App.tsx re-emite dev_status del WS). El
  // BrowserPanel solo auto-navega al arrancar el dev server; el control y
  // los logs viven en el ServerPanel.
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubbleId) return;
      // Auto-navegamos cuando arranca, una sola vez por arranque.
      if (d.status === 'running' && d.url && lastAutoNavRef.current !== d.url) {
        lastAutoNavRef.current = d.url;
        setLoadFailed(false);
        setUrl(d.url);
      }
      if (d.status === 'stopped' || d.status === 'error') {
        lastAutoNavRef.current = '';
      }
    });
  }, [bubbleId]);

  function bumpZoom(dir: 'in' | 'out' | 'reset') {
    if (dir === 'reset') { setZoom(1); return; }
    const idx = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.001);
    const next = dir === 'in'
      ? ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)]
      : ZOOM_STEPS[Math.max(idx - 1, 0)];
    setZoom(next ?? 1);
  }

  // El SmartBrowserView ya emite onLoadFail/onLoadSuccess vía did-fail-load
  // / did-finish-load del webview, así que no necesitamos watchdog acá.

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
        {/* Pill que muestra la ruta del URL actual (todo lo que va después
            del dominio). Actualiza automáticamente con la navegación interna
            del webview porque `url` está sincronizado con `did-navigate`. */}
        {(() => {
          if (!url) return null;
          let path = '';
          try {
            const u = new URL(url);
            path = (u.pathname || '') + (u.search || '') + (u.hash || '');
          } catch { path = ''; }
          return (
            <div title={url} style={{
              padding: '2px 10px', borderRadius: 999,
              background: t.bg2,
              color: t.text2,
              fontFamily: t.fontMono, fontSize: 10.5,
              border: `1px solid ${t.glassBorder}`,
              maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              url: <span style={{ color: t.text0 }}>{path || '/'}</span>
            </div>
          );
        })()}
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
        {/* Copiar URL actual al clipboard. */}
        <button
          type="button"
          onClick={() => void copyUrl()}
          disabled={!url}
          title={copyMsg || (url ? `Copiar ${url}` : 'Cargá un sitio primero')}
          style={{
            ...navBtnStyle(t),
            opacity: url ? 1 : 0.4,
            color: copyMsg === 'Copiada' ? t.ok : (copyMsg ? t.err : t.text1),
          }}>
          <IconCopy size={12}/>
        </button>
        {/* Enviar URL actual al PTY de Claude y abrir la Terminal. Usamos
            el icono de terminal en lugar de "send" porque comunica mejor
            el destino (la URL va al shell donde corre Claude). */}
        <button
          type="button"
          onClick={() => void sendUrlToClaude()}
          disabled={!url || sendingToClaude}
          title={sendMsg || (url ? `Enviar ${url} a Claude en la terminal` : 'Cargá un sitio primero')}
          style={{
            ...navBtnStyle(t),
            opacity: url ? (sendingToClaude ? 0.6 : 1) : 0.4,
            color: sendMsg?.startsWith('Error') ? t.err : (sendMsg ? t.ok : t.text1),
          }}>
          <IconTerminal size={12}/>
        </button>
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
        {/* DevTools nativos completos de Chromium: Elements, Network,
            Sources, Console, Performance, etc. Solo en Electron — el iframe
            de web puro no expone una API equivalente. */}
        {hasNativeDevTools && (
          <button
            type="button"
            onClick={() => smartRef.current?.openDevTools()}
            disabled={!url}
            title="Abrir DevTools (Elements, Network, Console, Sources…)"
            style={{
              ...navBtnStyle(t),
              opacity: url ? 1 : 0.4,
              fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
              width: 32,
            }}>{'{ }'}</button>
        )}
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
                // Partition única por agente — cookies/localStorage del sitio
                // embebido no se cruzan entre bubbles. Sin esto, login en un
                // agente loguea en todos.
                partition={`persist:eco-${bubbleId}`}
                onNavigate={(u) => setUrl(u)}
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
      </div>
    </div>
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
