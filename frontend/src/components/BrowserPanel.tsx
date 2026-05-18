import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTokens } from '@/design/theme';
import { IconArrowL, IconResume, IconGlobe, IconExt, IconX, IconCopy, IconTerminal } from '@/design/icons';
import { on as ecoOn, emit as ecoEmit } from '@/lib/eco-bus';
import { canEmbedArbitrarySites } from '@/lib/platform';
import { SmartBrowserView, type SmartBrowserHandle } from './SmartBrowserView';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { ecoToken } from '@/lib/eco-config';
import { useT } from '@/hooks/useI18n';
import { BrowserTabBar } from './BrowserPanel/BrowserTabBar';
import { ViewportMenu } from './BrowserPanel/ViewportMenu';
import {
  type BrowserTab, type NewTabMode,
  viewportDims, genTabId, defaultPartition, isolatedPartition,
} from './BrowserPanel/types';

type Props = {
  bubbleId: string;
  workspace?: string;
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

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

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

export function BrowserPanel({ bubbleId, workspace }: Props) {
  const t = useTokens();
  const tr = useT();
  const hasNativeDevTools = canEmbedArbitrarySites();

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

  // Aplicar zoom al webview activo cuando cambia.
  useEffect(() => {
    activeRef()?.setZoom(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, activeTabId]);

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

  const addTab = useCallback((mode: NewTabMode, opts?: { url?: string }) => {
    const newId = genTabId();
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
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      // Si era el activo, elegir adyacente. Si era el último, crear uno vacío.
      if (id === activeTabId) {
        if (next.length === 0) {
          const fresh: BrowserTab = {
            id: genTabId(), url: '', title: '',
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
      bubbleId, workspace, text: activeTab.url, token: ecoToken(),
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
      if (!d.url) return;
      if (d.url === lastNavUrlRef.current) return;
      lastNavUrlRef.current = d.url;
      setLoadFailed(false);
      updateTab(activeTabId, { url: d.url });
    });
  }, [bubbleId, activeTabId, updateTab]);

  const lastAutoNavRef = useRef<string>('');
  useEffect(() => {
    return ecoOn('eco:dev_status', (d) => {
      if (d.bubbleId !== bubbleId) return;
      if (d.status === 'running' && d.url && lastAutoNavRef.current !== d.url) {
        lastAutoNavRef.current = d.url;
        setLoadFailed(false);
        updateTab(activeTabId, { url: d.url });
      }
      if (d.status === 'stopped' || d.status === 'error') {
        lastAutoNavRef.current = '';
      }
    });
  }, [bubbleId, activeTabId, updateTab]);

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

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      background: t.bg0,
    }}>
      {/* Tab bar */}
      <BrowserTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={setActiveTabId}
        onClose={closeTab}
        onNewTab={(mode) => addTab(mode)}
      />

      {/* URL bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        borderBottom: `1px solid ${t.glassBorder}`,
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
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
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
        {(() => {
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
          onClick={() => setActiveUrl(draft)}
          disabled={!draft.trim()}
          style={{
            padding: '4px 12px', height: 26, borderRadius: 8, border: 0,
            background: t.accent, color: t.accentOn,
            fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            opacity: draft.trim() ? 1 : 0.5,
          }}>{tr('browser.go')}</button>
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
            viewport={activeTab.viewport}
            customViewport={activeTab.customViewport}
            onChange={(next, custom) => updateTab(activeTabId, {
              viewport: next,
              customViewport: next === 'custom' ? custom : activeTab.customViewport,
            })}
            onRotate={() => {
              const dim = viewportDims(activeTab.viewport, activeTab.customViewport);
              if (!dim) return;
              const swapped = { width: dim.height, height: dim.width };
              updateTab(activeTabId, {
                viewport: 'custom',
                customViewport: swapped,
              });
            }}
          />
        )}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '2px 4px', borderRadius: 6,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          <button type="button" onClick={() => bumpZoom('out')} title={tr('browser.zoom_out')}
            style={{ ...zoomBtnStyle(t) }}>−</button>
          <button type="button" onClick={() => bumpZoom('reset')} title={tr('browser.zoom_reset')}
            style={{
              minWidth: 38, padding: '0 4px', height: 22, border: 0, borderRadius: 4,
              background: 'transparent', color: t.text1, cursor: 'pointer',
              fontFamily: t.fontMono, fontSize: 10.5,
            }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => bumpZoom('in')} title={tr('browser.zoom_in')}
            style={{ ...zoomBtnStyle(t) }}>+</button>
        </div>
        {hasNativeDevTools && (
          <button
            type="button"
            onClick={() => activeRef()?.openDevTools()}
            disabled={!activeTab?.url}
            title={tr('browser.devtools_tooltip')}
            style={{
              ...navBtnStyle(t),
              opacity: activeTab?.url ? 1 : 0.4,
              fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
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
      </div>

      {/* Contenido: render TODOS los webviews, solo el activo visible */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {tabs.map((tab) => (
            <TabContent
              key={tab.id}
              tab={tab}
              visible={tab.id === activeTabId}
              zoom={tab.id === activeTabId ? zoom : 1}
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
          {loadFailed && activeTab?.url && (
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '10px 14px', borderRadius: 10,
              background: t.bg1, border: `1px solid ${t.warn}`,
              color: t.text0, fontSize: 12.5, lineHeight: 1.5,
              maxWidth: 'min(420px, 90%)',
              boxShadow: t.shadowLg, zIndex: 10,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{
                flexShrink: 0, marginTop: 1, color: t.warn, fontSize: 18, lineHeight: 1,
              }}>!</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{tr('browser.blocked.title')}</div>
                <div style={{ fontSize: 11.5, color: t.text2 }}>
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
  tab, visible, zoom, onNavigate, onTitleChange, onLoadFail, onLoadSuccess, onShortcutGo, registerRef,
}: {
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
                color: t.text1, fontFamily: t.fontMono, fontSize: 11.5,
                cursor: 'pointer',
              }}>{s.label}</button>
          ))}
        </div>
      </div>
    );
  }
  // Viewport wrapper — desktop = fluid, otro = caja centrada con sombra.
  const dim = viewportDims(tab.viewport, tab.customViewport);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: visible ? 'flex' : 'none',
      alignItems: dim ? 'center' : 'stretch',
      justifyContent: dim ? 'center' : 'stretch',
      background: dim ? t.bg1 : 'transparent',
      overflow: dim ? 'auto' : 'hidden',
    }}>
      <div style={dim ? {
        width: dim.width, height: dim.height,
        maxWidth: '100%', maxHeight: '100%',
        boxShadow: t.shadowLg,
        borderRadius: t.r2,
        overflow: 'hidden',
        background: 'white',
      } : { flex: 1, height: '100%', width: '100%' }}>
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
            onNavigate={onNavigate}
            onTitleChange={onTitleChange}
            onLoadFail={onLoadFail}
            onLoadSuccess={onLoadSuccess}
          />
        </div>
      </div>
    </div>
  );
}

function zoomBtnStyle(t: ReturnType<typeof useTokens>): CSSProperties {
  return {
    width: 18, height: 22, padding: 0, border: 0, borderRadius: 4,
    background: 'transparent', color: t.text1, cursor: 'pointer',
    fontFamily: t.fontMono, fontSize: 13, lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

function navBtnStyle(t: ReturnType<typeof useTokens>): CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6, border: 0,
    background: t.bg2, color: t.text1, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  };
}
