import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTokens } from '@/design/theme';
import { IconArrowL, IconResume, IconGlobe, IconExt, IconX, IconCopy, IconTerminal, IconMore, IconAgent } from '@/design/icons';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { canEmbedArbitrarySites } from '@/lib/platform';
import { SmartBrowserView, type SmartBrowserHandle } from './SmartBrowserView';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { takeBrowserUrl, hasRecentBrowserActivity } from '@/lib/browser-pending';
import { useT } from '@/hooks/useI18n';
import { useIsPhone, useIsPhoneLandscape, isPhoneNow, isPhoneLandscapeNow } from '@/hooks/useMediaQuery';
import { BrowserTabBar } from './BrowserPanel/BrowserTabBar';
import { BrowserMirror } from './BrowserPanel/BrowserMirror';
import { ViewportMenu } from './BrowserPanel/ViewportMenu';
import {
  type BrowserTab, type NewTabMode,
  deviceSpec, genTabId, defaultPartition, isolatedPartition,
} from './BrowserPanel/types';
import { DeviceFrame } from './BrowserPanel/DeviceFrame';

type Props = {
  bubbleId: string;
  workspace?: string;
  // Pantalla completa en el teléfono: el dueño (AgentDetail) esconde su header
  // y acá se esconden las barras. Sin `onToggleImmersive` no se ofrece.
  immersive?: boolean;
  onToggleImmersive?: () => void;
};

const legacyUrlKey  = (id: string) => `eco.browser.url.${id}`;
const tabsKey       = (id: string) => `eco.browser.tabs.${id}`;
const zoomKey       = (id: string) => `eco.browser.zoom.${id}`;

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
  if (/^[\w.-]+(:\d+)?(\/|$)/.test(v)) return `http://${v}`;
  if (/\s/.test(v) || !v.includes('.')) {
    return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
  }
  return `https://${v}`;
}

// Los dos primeros pasos existen para el teléfono: el zoom escala un viewport
// más ancho, así que en 390px un 0.33 renderiza el sitio a ~1180px — ancho de
// escritorio de verdad, entrando entero en la pantalla.
const ZOOM_STEPS = [0.33, 0.4, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

// ─── Persistencia + migración ─────────────────────────────────────────────

type StoredState = { tabs: BrowserTab[]; activeTabId: string };

function loadInitial(bubbleId: string): StoredState {
  try {
    const raw = localStorage.getItem(tabsKey(bubbleId));
    if (raw) {
      const parsed = JSON.parse(raw) as { tabs?: BrowserTab[]; activeTabId?: string };
      const validTabs = Array.isArray(parsed.tabs)
        ? parsed.tabs.filter((t): t is BrowserTab =>
            !!t && typeof t.id === 'string' && typeof t.url === 'string'
            && typeof t.partition === 'string')
        : [];
      if (validTabs.length > 0) {
        const active = validTabs.find((t) => t.id === parsed.activeTabId);
        return {
          tabs: validTabs,
          activeTabId: (active ?? validTabs[0]).id,
        };
      }
    }
    // Migración: si hay URL guardada en el formato viejo, generar primer tab.
    const legacyUrl = localStorage.getItem(legacyUrlKey(bubbleId));
    const firstId = genTabId();
    const first: BrowserTab = {
      id: firstId,
      url: legacyUrl ?? '',
      title: '',
      partition: defaultPartition(bubbleId),
      isolated: false,
      viewport: 'desktop',
    };
    return { tabs: [first], activeTabId: firstId };
  } catch {
    const firstId = genTabId();
    return {
      tabs: [{
        id: firstId, url: '', title: '',
        partition: defaultPartition(bubbleId),
        isolated: false, viewport: 'desktop',
      }],
      activeTabId: firstId,
    };
  }
}

function persistState(bubbleId: string, state: StoredState) {
  try {
    localStorage.setItem(tabsKey(bubbleId), JSON.stringify(state));
  } catch { /* noop */ }
}

// ─── Componente principal ─────────────────────────────────────────────────

export function BrowserPanel({ bubbleId, workspace, immersive = false, onToggleImmersive }: Props) {
  const t = useTokens();
  const tr = useT();
  const isPhone = useIsPhone();
  // Teléfono acostado: una sola fila de controles. La tira de pestañas se
  // abre a demanda desde el contador.
  const compact = useIsPhoneLandscape();
  // Teléfono de pie: una sola fila; lo secundario va detrás del botón "más".
  const narrow = isPhone && !compact;
  const [moreOpen, setMoreOpen] = useState(false);
  const [tabStripOpen, setTabStripOpen] = useState(false);
  const hasNativeDevTools = canEmbedArbitrarySites();
  // Sin <webview> (web / iPad) este panel no es el navegador que maneja el
  // agente: ese vive en la app de escritorio y acá se ve por el espejo.
  const canMirror = !window.electronAPI;
  const [mirror, setMirror] = useState(() => canMirror && hasRecentBrowserActivity(bubbleId));
  const mirrorDismissed = useRef(false);
  useEffect(() => {
    if (!canMirror) return;
    return ecoOn('eco:browser_activity', (d) => {
      if (d.bubbleId === bubbleId && !mirrorDismissed.current) setMirror(true);
    });
  }, [bubbleId, canMirror]);

  const initial = useMemo(() => loadInitial(bubbleId), [bubbleId]);
  const [tabs, setTabs] = useState<BrowserTab[]>(initial.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initial.activeTabId);
  const [draft, setDraft] = useState<string>(() => initial.tabs.find((t) => t.id === initial.activeTabId)?.url ?? '');
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoomState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(zoomKey(bubbleId));
      if (!raw) return 1;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0.25 && n <= 3 ? n : 1;
    } catch { return 1; }
  });
  const setZoom = (next: number) => {
    setZoomState(next);
    try { localStorage.setItem(zoomKey(bubbleId), String(next)); } catch { /* noop */ }
  };

  // Refs por tab — SmartBrowserView expone una API imperativa (reload,
  // back, forward, openDevTools). Necesitamos un ref por tab para que las
  // acciones se apliquen al activo.
  const smartRefs = useRef<Map<string, SmartBrowserHandle | null>>(new Map());

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [tabs, activeTabId]);
  const activeRef = () => smartRefs.current.get(activeTabId) ?? null;

  // Persistir state cada vez que cambia.
  useEffect(() => {
    persistState(bubbleId, { tabs, activeTabId });
  }, [tabs, activeTabId, bubbleId]);

  // Borrar la legacy key una vez migrada (ya pasó por loadInitial).
  useEffect(() => {
    try { localStorage.removeItem(legacyUrlKey(bubbleId)); } catch { /* noop */ }
  }, [bubbleId]);

  // Sincronizar draft (input bar) con la URL del tab activo.
  useEffect(() => {
    setDraft(activeTab?.url ?? '');
  }, [activeTabId, activeTab?.url]);

  // Notificar al resto de la UI si el tab activo tiene URL o no.
  useEffect(() => {
    ecoEmit('eco:browser_url_changed', { bubbleId, hasUrl: !!activeTab?.url });
  }, [activeTab?.url, bubbleId]);

  // Un dispositivo emulado va a su tamaño real y se ajusta solo al panel: el
  // zoom manual no aplica ahí (se conserva para cuando vuelva a escritorio).
  const emulating = !!activeTab && deviceSpec(activeTab) !== null;
  const effectiveZoom = emulating ? 1 : zoom;

  // Aplicar zoom al webview activo cuando cambia.
  useEffect(() => {
    activeRef()?.setZoom(effectiveZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveZoom, activeTabId]);

  // ─── Acciones sobre tabs ────────────────────────────────────────────────
  const updateTab = useCallback((id: string, patch: Partial<BrowserTab>) => {
    setTabs((prev) => prev.map((tab) => tab.id === id ? { ...tab, ...patch } : tab));
  }, []);

  const setActiveUrl = useCallback((rawUrl: string) => {
    const n = normalizeUrl(rawUrl);
    if (!n) return;
    setLoadFailed(false);
    updateTab(activeTabId, { url: n });
  }, [activeTabId, updateTab]);

  const addTab = useCallback((mode: NewTabMode, opts?: { url?: string; id?: string }) => {
    const newId = opts?.id ?? genTabId();
    const currentActive = tabs.find((t) => t.id === activeTabId);
    const partition = mode === 'isolated'
      ? isolatedPartition(bubbleId, newId)
      : (currentActive?.partition ?? defaultPartition(bubbleId));
    const isolated = mode === 'isolated' || (currentActive?.isolated ?? false);
    // El tab nuevo hereda la URL del activo. Esto es lo que permite el
    // use-case principal ("loguearme con otra cuenta en el mismo sitio"):
    // el user clickea + → Sesión nueva → ya está en el mismo URL pero con
    // partition limpia, lista para login con credenciales distintas.
    const inheritedUrl = currentActive?.url ?? '';
    const newTab: BrowserTab = {
      id: newId,
      url: opts?.url ?? inheritedUrl,
      title: '',
      partition,
      isolated,
      viewport: 'desktop',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, [tabs, activeTabId, bubbleId]);

  const closeTab = useCallback((id: string) => {
    // Fuera del updater: React lo invoca dos veces en StrictMode y cada pasada
    // generaba un id distinto, dejando activo un tab que no existía.
    const freshId = genTabId();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      // Si era el activo, elegir adyacente. Si era el último, crear uno vacío.
      if (id === activeTabId) {
        if (next.length === 0) {
          const fresh: BrowserTab = {
            id: freshId, url: '', title: '',
            partition: defaultPartition(bubbleId),
            isolated: false, viewport: 'desktop',
          };
          setActiveTabId(fresh.id);
          return [fresh];
        }
        const nextActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(nextActive.id);
      }
      // Liberar la ref del tab cerrado.
      smartRefs.current.delete(id);
      return next;
    });
  }, [activeTabId, bubbleId]);

  function reload() {
    setLoadFailed(false);
    activeRef()?.reload();
  }

  function openInOs() {
    if (!activeTab?.url) return;
    try { window.open(activeTab.url, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
  }

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  async function copyUrl() {
    if (!activeTab?.url) return;
    try {
      await navigator.clipboard.writeText(activeTab.url);
      setCopyMsg(tr('common.copied'));
    } catch {
      setCopyMsg(tr('common.copy_error'));
    }
    setTimeout(() => setCopyMsg(null), 1500);
  }

  const [sendingToClaude, setSendingToClaude] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  async function sendUrlToClaude() {
    if (!activeTab?.url || sendingToClaude) return;
    if (!workspace) { setSendMsg(tr('browser.send.no_workspace')); setTimeout(() => setSendMsg(null), 2500); return; }
    setSendingToClaude(true);
    setSendMsg(null);
    const r = await writeToBubblePty({
      bubbleId, workspace, text: activeTab.url,
    });
    setSendingToClaude(false);
    if (r.ok) {
      setSendMsg(tr('browser.send.pasted'));
      ecoEmit('eco:switch_tab', { tab: 'terminal', bubbleId });
      setTimeout(() => setSendMsg(null), 1800);
    } else {
      setSendMsg(tr('browser.send.err', { err: r.error ?? '' }));
      setTimeout(() => setSendMsg(null), 3500);
    }
  }

  // ─── Eventos eco-bus ────────────────────────────────────────────────────
  // Auto-navegación al tab ACTIVO cuando el server arranca o un emisor pide.
  const lastNavUrlRef = useRef<string>('');
  useEffect(() => { lastNavUrlRef.current = activeTab?.url ?? ''; }, [activeTab?.url]);

  useEffect(() => {
    return ecoOn('eco:browser_navigate', (d) => {
      if (d.bubbleId !== bubbleId) return;
      takeBrowserUrl(bubbleId);
      if (!d.url) return;
      // Misma URL: se recarga. Si la página había fallado (server todavía
      // levantando), ignorar el pedido la dejaba rota.
      if (d.url === lastNavUrlRef.current) { setLoadFailed(false); activeRef()?.reload(); return; }
      lastNavUrlRef.current = d.url;
      setLoadFailed(false);
      updateTab(activeTabId, { url: d.url });
    });
  }, [bubbleId, activeTabId, updateTab]);

  // URL pedida por el MCP antes de que este panel existiera.
  useEffect(() => {
    const url = takeBrowserUrl(bubbleId);
    if (url) ecoEmit('eco:browser_navigate', { bubbleId, url });
  }, [bubbleId]);

  // Pestañas pedidas por el MCP (browser_tab_new / _select / _close).
  useEffect(() => {
    return ecoOn('eco:browser_tab', (d) => {
      if (d.bubbleId !== bubbleId) return;
      if (d.op === 'new') {
        if (!tabs.some((tab) => tab.id === d.tabId)) addTab(d.isolated ? 'isolated' : 'shared', { url: d.url ?? 'about:blank', id: d.tabId });
      } else if (d.op === 'select') {
        if (tabs.some((tab) => tab.id === d.tabId)) setActiveTabId(d.tabId);
      } else if (d.op === 'close') {
        closeTab(d.tabId);
      }
    });
  }, [bubbleId, tabs, addTab, closeTab]);

  // Comandos de voz / externos para abrir/cerrar tabs.
  useEffect(() => {
    const off1 = ecoOn('eco:browser:new_tab', (d) => {
      if (d.bubbleId !== bubbleId) return;
      addTab(d.mode);
    });
    const off2 = ecoOn('eco:browser:close_tab', (d) => {
      if (d.bubbleId !== bubbleId) return;
      closeTab(activeTabId);
    });
    return () => { off1(); off2(); };
  }, [bubbleId, addTab, closeTab, activeTabId]);

  function bumpZoom(dir: 'in' | 'out' | 'reset') {
    if (dir === 'reset') { setZoom(1); return; }
    const idx = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.001);
    const next = dir === 'in'
      ? ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)]
      : ZOOM_STEPS[Math.max(idx - 1, 0)];
    setZoom(next ?? 1);
  }

  const bumpZoomRef = useRef(bumpZoom);
  bumpZoomRef.current = bumpZoom;
  useEffect(() => window.electronAPI?.onBrowserZoom?.((p) => {
    if (p.bubbleId === bubbleId) bumpZoomRef.current(p.dir);
  }), [bubbleId]);

  const extras = (
    <>
        {canMirror && (
          <button
            type="button"
            onClick={() => { mirrorDismissed.current = false; setMirror(true); }}
            title={tr('browser.mirror.enter')}
            aria-label={tr('browser.mirror.enter')}
            style={navBtnStyle(t)}>
            <IconAgent size={13}/>
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyUrl()}
          disabled={!activeTab?.url}
          title={copyMsg || (activeTab?.url ? tr('browser.copy_url_tooltip', { url: activeTab.url }) : tr('browser.no_url_tooltip'))}
          style={{
            ...navBtnStyle(t),
            opacity: activeTab?.url ? 1 : 0.4,
            color: copyMsg === tr('common.copied') ? t.ok : (copyMsg ? t.err : t.text1),
          }}>
          <IconCopy size={12}/>
        </button>
        <button
          type="button"
          onClick={() => void sendUrlToClaude()}
          disabled={!activeTab?.url || sendingToClaude}
          title={sendMsg || (activeTab?.url ? tr('browser.send_to_claude_tooltip', { url: activeTab.url }) : tr('browser.no_url_tooltip'))}
          style={{
            ...navBtnStyle(t),
            opacity: activeTab?.url ? (sendingToClaude ? 0.6 : 1) : 0.4,
            color: sendMsg?.startsWith('Error') ? t.err : (sendMsg ? t.ok : t.text1),
          }}>
          <IconTerminal size={12}/>
        </button>
        {activeTab && (
          <ViewportMenu
            selection={activeTab}
            onChange={(patch) => updateTab(activeTabId, patch)}
          />
        )}
        {/* El zoom SÍ importa en el teléfono, y más que en escritorio: como se
            aplica escalando un viewport más ancho (no es el pinch del
            sistema), bajarlo hace que el sitio se renderice con ancho de
            desktop y entre entero en la pantalla. */}
        {!emulating && <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
          padding: compact ? '0 2px' : '2px 4px', borderRadius: 6,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          <button type="button" onClick={() => bumpZoom('out')} title={tr('browser.zoom_out')}
            style={{ ...zoomBtnStyle(t) }}>−</button>
          <button type="button" onClick={() => bumpZoom('reset')} title={tr('browser.zoom_reset')}
            style={{
              minWidth: 38, padding: '0 4px', height: 22, border: 0, borderRadius: 4,
              background: 'transparent', color: t.text1, cursor: 'pointer',
              fontFamily: t.fontMono, fontSize: 11,
            }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => bumpZoom('in')} title={tr('browser.zoom_in')}
            style={{ ...zoomBtnStyle(t) }}>+</button>
        </div>}
        {hasNativeDevTools && (
          <button
            type="button"
            onClick={() => activeRef()?.openDevTools()}
            disabled={!activeTab?.url}
            title={tr('browser.devtools_tooltip')}
            style={{
              ...navBtnStyle(t),
              opacity: activeTab?.url ? 1 : 0.4,
              fontFamily: t.fontMono, fontSize: 11, fontWeight: 500,
              width: 32,
            }}>{'{ }'}</button>
        )}
        <button
          type="button"
          onClick={openInOs}
          disabled={!activeTab?.url}
          title={tr('browser.open_in_os')}
          style={{ ...navBtnStyle(t), opacity: activeTab?.url ? 1 : 0.4 }}>
          <IconExt size={11}/>
        </button>
    </>
  );

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      background: t.bg0, position: 'relative',
    }}>
      {mirror && (
        <BrowserMirror bubbleId={bubbleId} onExit={() => { mirrorDismissed.current = true; setMirror(false); }}/>
      )}
      {/* Tab bar */}
      {!immersive && (!isPhone || tabStripOpen) && (
        <BrowserTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={setActiveTabId}
          onClose={closeTab}
          onNewTab={(mode) => addTab(mode)}
        />
      )}

      {/* URL bar. Son ~11 controles en una fila que pide ~600px: en el
          teléfono envuelve, y los que solo tienen sentido en escritorio
          (chip de path, presets de viewport, zoom) no se dibujan. */}
      <div style={{
        display: immersive ? 'none' : 'flex', alignItems: 'center', gap: compact ? 4 : 6,
        padding: compact ? '4px 8px' : narrow ? '6px 8px' : '8px 12px',
        borderBottom: narrow && moreOpen ? 0 : `1px solid ${t.glassBorder}`,
        background: t.bg1,
      }}>
        <button
          type="button"
          onClick={() => activeRef()?.back()}
          title={tr('browser.back')}
          style={navBtnStyle(t)}>
          <IconArrowL size={12}/>
        </button>
        <button
          type="button"
          onClick={reload}
          title={tr('browser.reload')}
          disabled={!activeTab?.url}
          style={{ ...navBtnStyle(t), opacity: activeTab?.url ? 1 : 0.4 }}>
          <IconResume size={12}/>
        </button>
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 8,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          <IconGlobe size={11}/>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setActiveUrl(draft); }}
            placeholder={tr('browser.url_placeholder')}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            enterKeyHint="go"
            style={{
              flex: 1, minWidth: 0,
              background: 'transparent', border: 0, outline: 'none',
              fontFamily: t.fontMono, color: t.text0,
              // 16px evita el auto-zoom de iOS al enfocar la barra.
              fontSize: isPhone ? 16 : 12,
            }}
          />
          {draft && (
            <button type="button" onClick={() => { setDraft(''); }}
              style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
              <IconX size={11}/>
            </button>
          )}
        </div>
        {(() => {
          if (isPhone) return null;
          if (!activeTab?.url) return null;
          let path = '';
          try {
            const u = new URL(activeTab.url);
            path = (u.pathname || '') + (u.search || '') + (u.hash || '');
          } catch { path = ''; }
          return (
            <div title={activeTab.url} style={{
              padding: '2px 10px', borderRadius: 999,
              background: t.bg2,
              color: t.text2,
              fontFamily: t.fontMono, fontSize: 11,
              border: `1px solid ${t.glassBorder}`,
              maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              url: <span style={{ color: t.text0 }}>{path || '/'}</span>
            </div>
          );
        })()}
        {!narrow && <button
          type="button"
          onClick={() => setActiveUrl(draft)}
          disabled={!draft.trim()}
          style={{
            padding: '4px 12px', height: compact ? 32 : 26, flexShrink: 0, borderRadius: 8, border: 0,
            background: t.accent, color: t.accentOn,
            fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            opacity: draft.trim() ? 1 : 0.5,
          }}>{tr('browser.go')}</button>}
        {isPhone && (
          <button
            type="button"
            onClick={() => setTabStripOpen((v) => !v)}
            title={tr('browser.tabs.toggle')}
            aria-label={tr('browser.tabs.toggle')}
            aria-pressed={tabStripOpen}
            style={{
              ...navBtnStyle(t),
              fontFamily: t.fontMono, fontSize: 12, fontWeight: 500,
              color: tabStripOpen ? t.accent : t.text1,
              border: `1.5px solid ${tabStripOpen ? t.accent : t.text3}`,
              background: 'transparent',
            }}>{tabs.length}</button>
        )}
        {!narrow && extras}
        {onToggleImmersive && (
          <button
            type="button"
            onClick={onToggleImmersive}
            title={tr('browser.immersive.enter')}
            aria-label={tr('browser.immersive.enter')}
            style={navBtnStyle(t)}>
            <ImmersiveIcon exit={false}/>
          </button>
        )}
        {narrow && (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            title={tr('browser.more')}
            aria-label={tr('browser.more')}
            aria-expanded={moreOpen}
            style={{ ...navBtnStyle(t), color: moreOpen ? t.accent : t.text1 }}>
            <IconMore size={14}/>
          </button>
        )}
      </div>
      {narrow && moreOpen && !immersive && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
          padding: '0 8px 6px',
          borderBottom: `1px solid ${t.glassBorder}`,
          background: t.bg1,
        }}>
          {extras}
        </div>
      )}

      {/* Contenido: render TODOS los webviews, solo el activo visible */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {tabs.map((tab) => (
            <TabContent
              key={tab.id}
              bubbleId={bubbleId}
              tab={tab}
              visible={tab.id === activeTabId}
              zoom={tab.id === activeTabId ? effectiveZoom : 1}
              onNavigate={(u) => updateTab(tab.id, { url: u })}
              onTitleChange={(title) => updateTab(tab.id, { title })}
              onLoadFail={() => { if (tab.id === activeTabId) setLoadFailed(true); }}
              onLoadSuccess={() => { if (tab.id === activeTabId) setLoadFailed(false); }}
              onShortcutGo={(u) => updateTab(tab.id, { url: u })}
              registerRef={(handle) => {
                if (handle) smartRefs.current.set(tab.id, handle);
                else smartRefs.current.delete(tab.id);
              }}
            />
          ))}
          {immersive && onToggleImmersive && (
            <button
              type="button"
              onClick={onToggleImmersive}
              title={tr('browser.immersive.exit')}
              aria-label={tr('browser.immersive.exit')}
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 11,
                width: 40, height: 40, borderRadius: 20, padding: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(20, 22, 28, 0.55)', color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                cursor: 'pointer',
              }}>
              <ImmersiveIcon exit/>
            </button>
          )}
          {loadFailed && activeTab?.url && (
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '10px 16px', borderRadius: 10,
              background: t.bg1, border: `1px solid ${t.warn}`,
              color: t.text0, fontSize: 13, lineHeight: 1.5,
              maxWidth: 'min(420px, 90%)',
              boxShadow: t.shadowLg, zIndex: 10,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{
                flexShrink: 0, marginTop: 1, color: t.warn, fontSize: 20, lineHeight: 1,
              }}>!</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{tr('browser.blocked.title')}</div>
                <div style={{ fontSize: 12, color: t.text2 }}>
                  {tr('browser.blocked.desc')}
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
        </div>
      </div>
    </div>
  );
}

// Render de un tab: home page si url vacía, sino el webview. Siempre montado
// (visibility controlada por display:none) para preservar state al cambiar
// de tab. El zoom wrapper aplica solo al tab activo.
function TabContent({
  bubbleId, tab, visible, zoom, onNavigate, onTitleChange, onLoadFail, onLoadSuccess, onShortcutGo, registerRef,
}: {
  bubbleId: string;
  tab: BrowserTab;
  visible: boolean;
  zoom: number;
  onNavigate: (url: string) => void;
  onTitleChange: (title: string) => void;
  onLoadFail: () => void;
  onLoadSuccess: () => void;
  onShortcutGo: (url: string) => void;
  registerRef: (handle: SmartBrowserHandle | null) => void;
}) {
  const t = useTokens();
  const tr = useT();
  // Si no hay URL todavía, renderizamos el home (shortcuts).
  if (!tab.url) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: visible ? 'flex' : 'none',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
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
          {tr('browser.home.title')}
        </div>
        <div style={{ fontSize: 12, color: t.text3, textAlign: 'center', maxWidth: 360 }}>
          {tr('browser.home.desc')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          {SHORTCUTS.map((s) => (
            <button
              key={s.url}
              type="button"
              onClick={() => onShortcutGo(s.url)}
              style={{
                padding: '6px 12px', borderRadius: 999,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                color: t.text1, fontFamily: t.fontMono, fontSize: 12,
                cursor: 'pointer',
              }}>{s.label}</button>
          ))}
        </div>
      </div>
    );
  }
  // Escritorio = fluido; cualquier otro preset = dispositivo con marco,
  // escalado para entrar en el panel. En el teléfono siempre fluido: emular
  // una caja de 768x1024 dentro de una pantalla de 390 no sirve para nada, y
  // el selector ni se muestra.
  const spec = deviceSpec(tab);
  return (
    <DeviceFrame spec={spec} visible={visible}>
      <div style={{
        width: `${100 / zoom}%`, height: `${100 / zoom}%`,
        transform: `scale(${zoom})`,
        transformOrigin: '0 0',
        background: 'white',
      }}>
        <SmartBrowserView
          ref={registerRef}
          src={tab.url}
          partition={tab.partition}
          userAgent={spec?.userAgent}
          safeArea={spec?.safeArea}
          nativeHints={spec?.nativeHints}
          automation={{ bubbleId, tabId: tab.id, active: visible }}
          onNavigate={onNavigate}
          onTitleChange={onTitleChange}
          onLoadFail={onLoadFail}
          onLoadSuccess={onLoadSuccess}
        />
      </div>
    </DeviceFrame>
  );
}

function ImmersiveIcon({ exit }: { exit: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {exit
        ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"/>
        : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/>}
    </svg>
  );
}

function zoomBtnStyle(t: ReturnType<typeof useTokens>): CSSProperties {
  const mob = isPhoneNow();
  return {
    width: mob ? 32 : 18, height: mob ? 32 : 22, padding: 0, border: 0, borderRadius: 4,
    background: 'transparent', color: t.text1, cursor: 'pointer',
    fontFamily: t.fontMono, fontSize: 13, lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

function navBtnStyle(t: ReturnType<typeof useTokens>): CSSProperties {
  const size = isPhoneLandscapeNow() ? 32 : isPhoneNow() ? 36 : 26;
  return {
    width: size, height: size, borderRadius: 6, border: 0,
    flexShrink: 0,
    background: t.bg2, color: t.text1, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  };
}
