import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import {
  IconArrowL, IconResume, IconGlobe, IconExt, IconX, IconPlus, IconSearch,
} from '@/design/icons';
import { canEmbedArbitrarySites, detectRuntime, runtimeLabel } from '@/lib/platform';
import { SmartBrowserView, type SmartBrowserHandle } from '@/components/SmartBrowserView';

type Tab = {
  id: string;
  url: string;
  title: string;        // sniffed del último cargado
  proxied?: boolean;    // si está cargando via /proxy/site
};

function proxyUrlFor(url: string): string {
  return `/proxy/site?url=${encodeURIComponent(url)}`;
}

const STORAGE_TABS = 'eco.browser.tabs';
const STORAGE_ACTIVE = 'eco.browser.active';
const STORAGE_BOOKMARKS = 'eco.browser.bookmarks';

// ─────────────────────────── Marcadores
export type Bookmark = { id: string; title: string; url: string };

function readBookmarks(): Bookmark[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_BOOKMARKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b: unknown): b is Bookmark =>
      !!b && typeof (b as Bookmark).id === 'string'
        && typeof (b as Bookmark).url === 'string'
        && typeof (b as Bookmark).title === 'string',
    );
  } catch { return []; }
}
function writeBookmarks(list: Bookmark[]) {
  try { window.localStorage.setItem(STORAGE_BOOKMARKS, JSON.stringify(list)); } catch { /* noop */ }
}

function readTabs(): Tab[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_TABS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t: unknown): t is Tab =>
      !!t && typeof (t as Tab).id === 'string' && typeof (t as Tab).url === 'string',
    );
  } catch { return []; }
}
function writeTabs(tabs: Tab[], activeId: string | null) {
  try {
    window.localStorage.setItem(STORAGE_TABS, JSON.stringify(tabs));
    if (activeId) window.localStorage.setItem(STORAGE_ACTIVE, activeId);
    else window.localStorage.removeItem(STORAGE_ACTIVE);
  } catch { /* noop */ }
}

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

function newTabId(): string {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

const HOME_SHORTCUTS = [
  { label: 'localhost:5174', url: 'http://localhost:5174/' },
  { label: 'localhost:7000/health', url: 'http://localhost:7000/health' },
  { label: 'example.com', url: 'https://example.com/' },
  { label: 'MDN', url: 'https://developer.mozilla.org/' },
];

export function BrowserScreen() {
  const t = useTokens();
  const runtime = detectRuntime();
  const fullBrowser = canEmbedArbitrarySites();
  const [tabs, setTabs] = useState<Tab[]>(() => readTabs());
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_ACTIVE);
      if (saved) return saved;
    } catch { /* noop */ }
    return readTabs()[0]?.id ?? null;
  });
  const [draft, setDraft] = useState('');
  const [refreshTick, setRefreshTick] = useState<Record<string, number>>({});
  const [loadFailed, setLoadFailed] = useState<Record<string, boolean>>({});
  const [loadFailMsg, setLoadFailMsg] = useState<Record<string, string>>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => readBookmarks());
  const browserRefs = useRef<Record<string, SmartBrowserHandle | null>>({});

  // Persist on changes.
  useEffect(() => { writeTabs(tabs, activeId); }, [tabs, activeId]);
  useEffect(() => { writeBookmarks(bookmarks); }, [bookmarks]);

  function addBookmark(url: string, title: string) {
    if (!url) return;
    // Si ya existe, no duplicamos.
    if (bookmarks.some((b) => b.url === url)) return;
    const bm: Bookmark = {
      id: 'bm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      title: (title || hostname(url) || url).slice(0, 60),
      url,
    };
    setBookmarks((prev) => [...prev, bm]);
  }
  function removeBookmark(id: string) {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }

  // Cuando cambia el tab activo, mostrar su URL en la URL bar.
  useEffect(() => {
    const cur = tabs.find((tab) => tab.id === activeId);
    setDraft(cur?.url ?? '');
  }, [activeId, tabs]);

  function addTab(initialUrl?: string) {
    const id = newTabId();
    const tab: Tab = { id, url: initialUrl ?? '', title: initialUrl ? 'Nueva pestaña' : 'Nueva pestaña' };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    setDraft(initialUrl ?? '');
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) {
        // activar el vecino (preferimos derecha, sino izquierda)
        const newActive = next[idx] ?? next[idx - 1] ?? null;
        setActiveId(newActive?.id ?? null);
      }
      return next;
    });
    delete browserRefs.current[id];
  }

  function navigate(targetId: string, raw: string) {
    const url = normalizeUrl(raw);
    if (!url) return;
    setTabs((prev) => prev.map((tab) => tab.id === targetId ? { ...tab, url, title: hostname(url) || 'Cargando…', proxied: false } : tab));
    setLoadFailed((prev) => ({ ...prev, [targetId]: false }));
    setRefreshTick((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? 0) + 1 }));
  }

  function goActive(raw: string) {
    // Si no hay tab activo (o el activeId está stale y no apunta a una tab
    // real), creamos uno con esa URL.
    const exists = activeId && tabs.some((tb) => tb.id === activeId);
    if (!exists) {
      const id = newTabId();
      const url = normalizeUrl(raw);
      if (!url) return;
      setTabs((prev) => [...prev, { id, url, title: hostname(url) || 'Cargando…' }]);
      setActiveId(id);
      setLoadFailed((prev) => ({ ...prev, [id]: false }));
      return;
    }
    navigate(activeId!, raw);
  }

  function reloadActive() {
    if (!activeId) return;
    setLoadFailed((prev) => ({ ...prev, [activeId]: false }));
    setRefreshTick((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }));
  }

  function back() {
    if (!activeId) return;
    browserRefs.current[activeId]?.back();
  }

  function openInOs(url: string) {
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
  }

  // Bridge: cuando el proxy intercepta un click en <a>, postMessage nos avisa
  // y navegamos por proxy también — así los links siguen funcionando dentro
  // del navegador interno en lugar de "salirse" al sitio original.
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as { kind?: string; url?: string } | null;
      if (!data || data.kind !== 'eco-browser:nav' || typeof data.url !== 'string') return;
      if (!activeId) return;
      const cur = tabs.find((tb) => tb.id === activeId);
      if (!cur) return;
      // Mantenemos proxied=true porque el HTML pidió esta navegación desde adentro del proxy.
      setTabs((prev) => prev.map((tb) =>
        tb.id === activeId
          ? { ...tb, url: data.url!, title: hostname(data.url!) || 'Cargando…', proxied: true }
          : tb,
      ));
      setLoadFailed((p) => ({ ...p, [activeId]: false }));
      setRefreshTick((p) => ({ ...p, [activeId]: (p[activeId] ?? 0) + 1 }));
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [activeId, tabs]);

  // Watchdog: si en 6s no llegó load-success ni load-fail, asumimos que
  // el sitio bloqueó embedding (X-Frame-Options/CSP frame-ancestors). En
  // webview de Electron esto rara vez se activa porque los headers se
  // ignoran; en iframe es lo habitual con Google, banks, etc.
  useEffect(() => {
    if (!activeId) return;
    const tab = tabs.find((t) => t.id === activeId);
    if (!tab?.url) return;
    const iv = setTimeout(() => {
      // Solo encendemos el banner si el SmartBrowserView no avisó success.
      setLoadFailed((p) => (p[activeId] === undefined ? { ...p, [activeId]: true } : p));
    }, 6000);
    return () => clearTimeout(iv);
  }, [activeId, refreshTick, tabs]);

  const activeTab = tabs.find((tb) => tb.id === activeId) ?? null;
  const activeFailed = activeId ? loadFailed[activeId] : false;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
      background: t.bg0,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 8px 0',
        background: t.bg1,
        borderBottom: `1px solid ${t.glassBorder}`,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        <AnimatePresence initial={false}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <motion.div
                key={tab.id}
                layout
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(tab.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 30, padding: '0 10px',
                    border: 0, borderRadius: '8px 8px 0 0',
                    background: isActive ? t.bg0 : 'transparent',
                    color: isActive ? t.text0 : t.text2,
                    cursor: 'pointer', maxWidth: 200,
                    borderBottom: isActive ? `2px solid ${t.accent}` : '2px solid transparent',
                    marginBottom: -1,
                    fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
                  }}>
                  <IconGlobe size={11}/>
                  <span style={{
                    flex: 1, minWidth: 0, maxWidth: 140,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{tab.title || 'Nueva pestaña'}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    style={{
                      width: 16, height: 16, padding: 0, border: 0, borderRadius: 4,
                      background: 'transparent', color: t.text3, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = t.bg3}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <IconX size={9}/>
                  </button>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => addTab()}
          title="Nueva pestaña"
          style={{
            width: 28, height: 28, padding: 0, border: 0, borderRadius: 6,
            background: 'transparent', color: t.text2, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: tabs.length > 0 ? 4 : 0, marginBottom: 2,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = t.bg3}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
          <IconPlus size={13}/>
        </button>
      </div>

      {/* URL bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
      }}>
        <button type="button" onClick={back} title="Atrás"
          disabled={!activeTab?.url}
          style={navBtnStyle(t, !activeTab?.url)}>
          <IconArrowL size={12}/>
        </button>
        <button type="button" onClick={reloadActive} title="Recargar"
          disabled={!activeTab?.url}
          style={navBtnStyle(t, !activeTab?.url)}>
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
            onKeyDown={(e) => { if (e.key === 'Enter') goActive(draft); }}
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
            <button type="button" onClick={() => setDraft('')}
              style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
              <IconX size={11}/>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => goActive(draft)}
          disabled={!draft.trim()}
          style={{
            padding: '4px 12px', height: 26, borderRadius: 8, border: 0,
            background: t.accent, color: t.accentOn,
            fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            opacity: draft.trim() ? 1 : 0.5,
          }}>Ir</button>
        {/* Botón ⭐ marcador — guarda el sitio actual o lo quita si ya está */}
        {activeTab?.url && (() => {
          const existing = bookmarks.find((b) => b.url === activeTab.url);
          return (
            <button
              type="button"
              onClick={() => {
                if (existing) removeBookmark(existing.id);
                else addBookmark(activeTab.url, activeTab.title);
              }}
              title={existing ? 'Quitar marcador' : 'Agregar marcador'}
              style={{
                ...navBtnStyle(t, false),
                color: existing ? t.warn : t.text1,
                background: existing ? t.bg3 : t.bg2,
              }}>
              {/* Star icon — filled si está marcado */}
              <svg width="12" height="12" viewBox="0 0 24 24"
                fill={existing ? t.warn : 'none'}
                stroke={existing ? t.warn : 'currentColor'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          );
        })()}
        <button
          type="button"
          onClick={() => activeTab?.url && openInOs(activeTab.url)}
          disabled={!activeTab?.url}
          title="Abrir en navegador del sistema"
          style={navBtnStyle(t, !activeTab?.url)}>
          <IconExt size={11}/>
        </button>
        <span
          title={fullBrowser
            ? `${runtimeLabel(runtime)} — navegación completa, sin restricciones de iframe`
            : `${runtimeLabel(runtime)} — usá «modo proxy» o ↗ para sitios que bloqueen embedding`}
          style={{
            padding: '2px 8px', borderRadius: 999,
            background: fullBrowser ? t.accentFaint : t.bg2,
            color: fullBrowser ? t.accent : t.text3,
            fontFamily: t.fontMono, fontSize: 10, fontWeight: 500,
            border: `1px solid ${fullBrowser ? t.accent : t.glassBorder}`,
            whiteSpace: 'nowrap',
            cursor: 'help',
          }}>
          {runtime === 'electron' || runtime === 'tauri' ? '◆ full' : '○ web'}
        </span>
      </div>

      {/* Barra de marcadores — solo se muestra si hay alguno guardado */}
      {bookmarks.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 12px',
          borderBottom: `1px solid ${t.glassBorder}`,
          background: t.bg1,
          overflowX: 'auto', overflowY: 'hidden',
          whiteSpace: 'nowrap',
        }}>
          {bookmarks.map((bm) => (
            <BookmarkChip
              key={bm.id} bm={bm}
              onClick={() => goActive(bm.url)}
              onRemove={() => removeBookmark(bm.id)}
            />
          ))}
        </div>
      )}

      {/* Contenido — solo la tab activa se renderiza, mismo patrón que el
          BrowserPanel por agente (que sí funciona). Cambiar de tab fuerza
          remount del SmartBrowserView vía key con tab.id; está bien que se
          recargue, igual que un browser real con tabs descartables. */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, background: 'white' }}>
        {!activeTab?.url ? (
          <Home onPick={(url) => {
            // Si hay un tab activo válido, navegá ese tab; si no, creá uno
            // nuevo. activeId puede estar stale (id en localStorage que ya
            // no apunta a ninguna tab) — en ese caso addTab.
            if (activeTab) navigate(activeTab.id, url);
            else addTab(url);
          }}/>
        ) : (() => {
          const src = activeTab.proxied ? proxyUrlFor(activeTab.url) : activeTab.url;
          return (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'white',
            }}>
              <SmartBrowserView
                key={`${activeTab.id}-${refreshTick[activeTab.id] ?? 0}-${activeTab.proxied ? 'p' : 'd'}`}
                ref={(h) => { if (activeId) browserRefs.current[activeId] = h; }}
                src={src}
                onTitleChange={(title) => {
                  setTabs((prev) => prev.map((tb) => tb.id === activeTab.id ? { ...tb, title: title.slice(0, 60) } : tb));
                }}
                onNavigate={(url) => {
                  if (fullBrowser && url && url !== activeTab.url) {
                    setTabs((prev) => prev.map((tb) => tb.id === activeTab.id ? { ...tb, url } : tb));
                  }
                }}
                onLoadFail={(code, desc) => {
                  setLoadFailed((p) => ({ ...p, [activeTab.id]: true }));
                  setLoadFailMsg((p) => ({ ...p, [activeTab.id]: `code=${code} ${desc}` }));
                }}
                onLoadSuccess={() => {
                  setLoadFailed((p) => ({ ...p, [activeTab.id]: false }));
                  setLoadFailMsg((p) => ({ ...p, [activeTab.id]: '' }));
                }}
              />
            </div>
          );
        })()}
        {activeTab?.url && activeFailed && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            padding: '12px 14px', borderRadius: 10,
            background: t.bg1, border: `1px solid ${t.warn}`,
            color: t.text0, fontSize: 12.5, lineHeight: 1.5,
            maxWidth: 'min(460px, 90%)',
            boxShadow: t.shadowLg,
            display: 'flex', flexDirection: 'column', gap: 10,
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flexShrink: 0, marginTop: 1, color: t.warn, fontSize: 18, lineHeight: 1 }}>!</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {activeTab.proxied ? 'El proxy tampoco pudo cargarlo' : 'El sitio bloqueó el embebido'}
                </div>
                <div style={{ fontSize: 11.5, color: t.text2 }}>
                  {activeTab.proxied
                    ? 'Algunos sitios (Google, banks) detectan el contexto y rompen. Abrilo en tu navegador con ↗.'
                    : 'No pudo cargar. Verificá la URL o abrilo en tu navegador con ↗.'}
                </div>
                {activeId && loadFailMsg[activeId] && (
                  <div style={{ marginTop: 6, fontFamily: t.fontMono, fontSize: 10.5, color: t.text3 }}>
                    {loadFailMsg[activeId]}
                  </div>
                )}
              </div>
              <button type="button"
                onClick={() => activeId && setLoadFailed((p) => ({ ...p, [activeId]: false }))}
                style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
                <IconX size={12}/>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {!activeTab.proxied && (
                <button type="button"
                  onClick={() => {
                    if (!activeId) return;
                    setTabs((prev) => prev.map((tb) => tb.id === activeId ? { ...tb, proxied: true } : tb));
                    setLoadFailed((p) => ({ ...p, [activeId]: false }));
                    setRefreshTick((p) => ({ ...p, [activeId]: (p[activeId] ?? 0) + 1 }));
                  }}
                  style={{
                    padding: '5px 12px', borderRadius: 7, border: `1px solid ${t.accent}`,
                    background: t.accentFaint, color: t.accent,
                    fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                  }}>Probar modo proxy</button>
              )}
              <button type="button"
                onClick={() => activeTab.url && openInOs(activeTab.url)}
                style={{
                  padding: '5px 12px', borderRadius: 7, border: 0,
                  background: t.accent, color: t.accentOn,
                  fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>Abrir en sistema <IconExt size={11}/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Home({ onPick }: { onPick: (url: string) => void }) {
  const t = useTokens();
  const [query, setQuery] = useState('');
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 32, gap: 16,
      background: t.bg0,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: t.accentFaint, color: t.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconGlobe size={26}/>
      </div>
      <div style={{ fontSize: 16, color: t.text0, fontWeight: 500 }}>
        Navegador interno
      </div>
      <div style={{ fontSize: 12.5, color: t.text3, textAlign: 'center', maxWidth: 480 }}>
        Las pestañas y la URL activa se guardan automáticamente. Al cerrar y volver a abrir Eco,
        recuperás todo lo que tenías.
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
        width: 'min(460px, 100%)', boxSizing: 'border-box',
      }}>
        <IconSearch size={12}/>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) onPick(query); }}
          placeholder="URL o búsqueda…"
          spellCheck={false}
          autoCorrect="off"
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            fontFamily: t.fontMono, fontSize: 13, color: t.text0,
          }}
        />
        <button type="button" onClick={() => query.trim() && onPick(query)}
          disabled={!query.trim()}
          style={{
            padding: '5px 14px', borderRadius: 7, border: 0,
            background: t.accent, color: t.accentOn,
            cursor: query.trim() ? 'pointer' : 'not-allowed',
            opacity: query.trim() ? 1 : 0.5,
            fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
          }}>Ir</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
        {HOME_SHORTCUTS.map((s) => (
          <button key={s.url} type="button" onClick={() => onPick(s.url)}
            style={{
              padding: '6px 12px', borderRadius: 999,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              color: t.text1, fontFamily: t.fontSans, fontSize: 11.5,
              cursor: 'pointer',
            }}>{s.label}</button>
        ))}
      </div>
    </div>
  );
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function BookmarkChip({
  bm, onClick, onRemove,
}: {
  bm: Bookmark;
  onClick: () => void;
  onRemove: () => void;
}) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 8px 4px 10px',
        borderRadius: 6,
        background: hover ? t.bg3 : 'transparent',
        border: `1px solid ${hover ? t.glassBorderHi : t.glassBorder}`,
        flexShrink: 0,
        transition: 'background 140ms, border-color 140ms',
      }}>
      <button
        type="button"
        onClick={onClick}
        title={bm.url}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
          color: t.text1,
          maxWidth: 180,
          fontFamily: t.fontSans, fontSize: 11.5, fontWeight: 500,
        }}>
        <IconGlobe size={11}/>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{bm.title}</span>
      </button>
      {hover && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Quitar marcador"
          style={{
            width: 16, height: 16, padding: 0, border: 0, borderRadius: 4,
            background: 'transparent', color: t.text3, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <IconX size={9}/>
        </button>
      )}
    </div>
  );
}

function navBtnStyle(t: ReturnType<typeof useTokens>, disabled = false): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6, border: 0,
    background: t.bg2, color: t.text1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
    opacity: disabled ? 0.4 : 1,
  };
}
