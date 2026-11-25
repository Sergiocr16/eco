// Wrapper inteligente: usa <webview> de Electron cuando está disponible
// (Chromium real, sin restricciones de SOP, DevTools propio) o <iframe>
// como fallback en web puro.

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { canEmbedArbitrarySites } from '@/lib/platform';
import { useT } from '@/hooks/useI18n';

// Log que va al stdout del main process via IPC (visible si abrís la .app
// desde terminal). Útil para diagnosticar fallos de carga del webview.
function elog(...args: unknown[]): void {
  const api = (window as unknown as { electronAPI?: { log?: (...a: unknown[]) => void } }).electronAPI;
  if (api?.log) api.log(...args);
}

export type SmartBrowserHandle = {
  reload: () => void;
  back: () => void;
  forward: () => void;
  openDevTools: () => void;
  getURL: () => string;
  setZoom: (factor: number) => void;
};

export type SmartBrowserProps = {
  src: string;
  style?: CSSProperties;
  onTitleChange?: (title: string) => void;
  onNavigate?: (url: string) => void;
  onLoadFail?: (errorCode: number, errorDescription: string) => void;
  onLoadSuccess?: () => void;
  /**
   * Partition de Electron para aislar cookies, localStorage, IndexedDB, etc.
   * Cada agente debe pasar una partition única (ej. `persist:eco-${bubbleId}`)
   * para que la sesión de un sitio en un agente no se cruce con otro. Sin
   * esto, dos agentes con el browser apuntando al mismo sitio comparten
   * cookies — log in en uno te loguea en todos.
   */
  partition?: string;
  /**
   * Si false, el webview/iframe se renderiza con `display: none` para quedar
   * montado pero invisible. Útil para multi-tabs (keep-alive entre tabs sin
   * destruir el webview). Default true.
   */
  visible?: boolean;
  /**
   * Emulación de dispositivo (solo <webview>): user agent y márgenes de
   * env(safe-area-inset-*). Sin `userAgent` se usa el de escritorio. Cambiar
   * el user agent recarga la página; cambiar los márgenes no.
   */
  userAgent?: string;
  safeArea?: { top: number; right: number; bottom: number; left: number };
  /** Clases y variables CSS que la app nativa le pone a <html>. */
  nativeHints?: { rootClasses: Record<string, boolean>; rootVars: Record<string, string> };
  /**
   * Bubble y pestaña dueñas de este webview: lo registra en el main para que
   * las tools browser_* del MCP lo controlen. `active` = pestaña activa.
   */
  automation?: { bubbleId: string; tabId: string; active: boolean };
};

// Aplica `nativeHints` dentro de la página del <webview>.
function nativeHintsScript(hints: NonNullable<SmartBrowserProps['nativeHints']>): string {
  return `(function(h){var r=document.documentElement,k;`
    + `for(k in h.rootClasses)r.classList.toggle(k,!!h.rootClasses[k]);`
    + `for(k in h.rootVars)r.style.setProperty(k,h.rootVars[k]);})(${JSON.stringify(hints)})`;
}

// Mismo prefijo que lee el script del proxy (backend/src/dev-emulation.ts).
const EMULATION_NAME_PREFIX = 'eco-emu:';

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

type ElectronWebview = HTMLElement & {
  src: string;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
  setZoomFactor: (factor: number) => void;
  setUserAgent: (userAgent: string) => void;
  getWebContentsId: () => number;
  executeJavaScript: (code: string) => Promise<unknown>;
  addEventListener: (event: string, cb: (e: Event & Record<string, unknown>) => void) => void;
  removeEventListener: (event: string, cb: (e: Event & Record<string, unknown>) => void) => void;
};

export const SmartBrowserView = forwardRef<SmartBrowserHandle, SmartBrowserProps>(
  function SmartBrowserView(
    { src, style, onTitleChange, onNavigate, onLoadFail, onLoadSuccess, partition, visible = true, userAgent, safeArea, nativeHints, automation },
    handleRef,
  ) {
    const tr = useT();
    const useWebview = canEmbedArbitrarySites();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const webviewRef = useRef<ElectronWebview | null>(null);

    // Guardamos los callbacks en refs para que cambios de identidad de las
    // funciones (típico cuando el caller las pasa inline) NO recreen el
    // webview. Sin esto, cualquier re-render del padre destruye y vuelve a
    // crear el webview, causando reloads constantes.
    const cbRef = useRef({ onTitleChange, onNavigate, onLoadFail, onLoadSuccess });
    useEffect(() => {
      cbRef.current = { onTitleChange, onNavigate, onLoadFail, onLoadSuccess };
    }, [onTitleChange, onNavigate, onLoadFail, onLoadSuccess]);

    // Emulación de dispositivo. Se aplica al crear el webview (atributo
    // `useragent`), en cada dom-ready y cuando cambian las props.
    const ua = userAgent || DESKTOP_USER_AGENT;
    const insetsKey = safeArea ? `${safeArea.top},${safeArea.right},${safeArea.bottom},${safeArea.left}` : '';
    const hintsKey = nativeHints ? JSON.stringify(nativeHints) : '';
    const emulationRef = useRef({ userAgent: ua, safeArea, nativeHints });
    emulationRef.current = { userAgent: ua, safeArea, nativeHints };
    const readyRef = useRef(false);
    const appliedUaRef = useRef(ua);
    const applyEmulationRef = useRef(() => {});
    applyEmulationRef.current = () => {
      const wv = webviewRef.current;
      if (!wv || !readyRef.current) return;
      const want = emulationRef.current;
      try {
        const api = (window as unknown as { electronAPI?: {
          setWebviewSafeArea?: (id: number, insets: SmartBrowserProps['safeArea'] | null) => Promise<{ ok: boolean; error?: string }>;
        } }).electronAPI;
        void api?.setWebviewSafeArea?.(wv.getWebContentsId(), want.safeArea ?? null)
          .then((r) => { if (!r.ok) elog('[webview] safe area', r.error); })
          .catch((e: unknown) => elog('[webview] safe area', String(e)));
        if (appliedUaRef.current !== want.userAgent) {
          appliedUaRef.current = want.userAgent;
          wv.setUserAgent(want.userAgent);
          // El user agent solo rige desde la siguiente carga; su dom-ready
          // vuelve a pasar por acá y aplica las pistas nativas.
          wv.reload();
        } else if (want.nativeHints) {
          void wv.executeJavaScript(nativeHintsScript(want.nativeHints))
            .catch((e: unknown) => elog('[webview] native hints', String(e)));
        }
      } catch (e) {
        elog('[webview] emulation', String(e));
      }
    };
    useEffect(() => { applyEmulationRef.current(); }, [ua, insetsKey, hintsKey]);

    // Registro para las tools browser_*. El id del webContents solo existe tras
    // el primer dom-ready; se re-registra en cada uno (idempotente en el main).
    const automationRef = useRef(automation);
    automationRef.current = automation;
    const registeredRef = useRef<{ wcId: number; bubbleId: string; tabId: string } | null>(null);
    const registerAutomationRef = useRef(() => {});
    registerAutomationRef.current = () => {
      const wv = webviewRef.current;
      const a = automationRef.current;
      const api = window.electronAPI;
      if (!wv || !readyRef.current || !a || !api?.setBrowserTarget) return;
      try {
        const wcId = wv.getWebContentsId();
        registeredRef.current = { wcId, bubbleId: a.bubbleId, tabId: a.tabId };
        void api.setBrowserTarget({ webContentsId: wcId, bubbleId: a.bubbleId, tabId: a.tabId, active: a.active })
          .then((r) => { if (!r.ok) elog('[webview] automation', r.error); })
          .catch((e: unknown) => elog('[webview] automation', String(e)));
      } catch (e) {
        elog('[webview] automation', String(e));
      }
    };
    const automationKey = automation ? `${automation.bubbleId}:${automation.tabId}:${automation.active}` : '';
    useEffect(() => { registerAutomationRef.current(); }, [automationKey]);

    useImperativeHandle(handleRef, () => ({
      reload: () => {
        if (useWebview) webviewRef.current?.reload();
        else if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
      },
      back: () => {
        if (useWebview && webviewRef.current?.canGoBack()) webviewRef.current.goBack();
        else try { iframeRef.current?.contentWindow?.history.back(); } catch { /* noop */ }
      },
      forward: () => {
        if (useWebview && webviewRef.current?.canGoForward()) webviewRef.current.goForward();
        else try { iframeRef.current?.contentWindow?.history.forward(); } catch { /* noop */ }
      },
      openDevTools: () => {
        if (!useWebview) return;
        const wv = webviewRef.current;
        if (!wv) return;
        // El DevTools del <webview> vive en una ventana aparte. Si ya está
        // abierto pero quedó detrás de Eco, reabrir es un no-op en Electron y
        // el usuario no lo recupera. Lo cerramos y reabrimos para forzar que
        // vuelva al frente cada vez que se toca el botón.
        try {
          if (wv.isDevToolsOpened()) {
            wv.closeDevTools();
            setTimeout(() => { try { wv.openDevTools(); } catch { /* noop */ } }, 50);
          } else {
            wv.openDevTools();
          }
        } catch {
          try { wv.openDevTools(); } catch { /* noop */ }
        }
      },
      getURL: () => {
        if (useWebview) return webviewRef.current?.getURL() ?? src;
        return iframeRef.current?.src ?? src;
      },
      setZoom: (factor: number) => {
        if (useWebview) {
          try { webviewRef.current?.setZoomFactor(factor); } catch { /* webview no listo todavía */ }
        }
        // En modo iframe el "zoom" lo aplica el wrapper CSS del caller —
        // no hay API estándar para iframe.contentWindow.setZoom.
      },
    }), [useWebview, src]);

    // Crear <webview> imperativamente UNA SOLA VEZ. Cuando cambia src, en
    // lugar de destruir y recrear el webview (que causa reload visible), le
    // pedimos al webview existente que navegue. Así el webview persiste
    // mientras el componente esté montado, sin importar cuántas veces el
    // padre re-renderice o cambie la URL.
    useEffect(() => {
      if (!useWebview) return;
      const container = containerRef.current;
      if (!container) return;
      // Si ya existe, no creamos otro. El effect de navegación abajo se
      // encarga de actualizar la src.
      if (webviewRef.current) return;

      const wv = document.createElement('webview') as ElectronWebview;
      wv.setAttribute('allowpopups', '');
      // Partition por agente: aisla cookies / localStorage / IndexedDB para
      // que dos agentes apuntando al mismo sitio no compartan sesión. Si el
      // caller no pasa una, caemos a la histórica `persist:eco-browser`.
      wv.setAttribute('partition', partition || 'persist:eco-browser');
      wv.setAttribute('useragent', emulationRef.current.userAgent);
      appliedUaRef.current = emulationRef.current.userAgent;
      wv.style.cssText = 'display:inline-flex;width:100%;height:100%;border:0;background:white;';
      // Si tenemos src inicial, lo seteamos ANTES de appendChild — Electron
      // monta el WebContents cuando detecta el elemento con src ya presente.
      if (src) wv.setAttribute('src', src);

      const onTitle = (e: Event & Record<string, unknown>) => {
        const title = (e as unknown as { title?: string }).title;
        if (title) cbRef.current.onTitleChange?.(title);
      };
      const onNav = (e: Event & Record<string, unknown>) => {
        const url = (e as unknown as { url?: string }).url;
        if (url) cbRef.current.onNavigate?.(url);
      };
      const onFail = (e: Event & Record<string, unknown>) => {
        const code = Number((e as { errorCode?: unknown }).errorCode ?? -1);
        const desc = String((e as { errorDescription?: unknown }).errorDescription ?? '');
        const url = String((e as { validatedURL?: unknown }).validatedURL ?? '');
        elog('[webview] did-fail-load', { code, desc, url });
        if (code === -3) return; // ERR_ABORTED — navegación cancelada por nueva nav
        cbRef.current.onLoadFail?.(code, desc);
      };
      const onFinish = () => {
        cbRef.current.onLoadSuccess?.();
      };
      wv.addEventListener('page-title-updated', onTitle);
      wv.addEventListener('did-navigate', onNav);
      wv.addEventListener('did-navigate-in-page', onNav);
      wv.addEventListener('did-fail-load', onFail);
      wv.addEventListener('did-finish-load', onFinish);
      // Los métodos del webview solo existen tras el primer dom-ready.
      const onReady = () => { readyRef.current = true; applyEmulationRef.current(); registerAutomationRef.current(); };
      wv.addEventListener('dom-ready', onReady);

      container.appendChild(wv);
      webviewRef.current = wv;

      return () => {
        wv.removeEventListener('page-title-updated', onTitle);
        wv.removeEventListener('did-navigate', onNav);
        wv.removeEventListener('did-navigate-in-page', onNav);
        wv.removeEventListener('did-fail-load', onFail);
        wv.removeEventListener('did-finish-load', onFinish);
        wv.removeEventListener('dom-ready', onReady);
        readyRef.current = false;
        const reg = registeredRef.current;
        if (reg) {
          registeredRef.current = null;
          void window.electronAPI?.setBrowserTarget?.({ webContentsId: reg.wcId, bubbleId: reg.bubbleId, tabId: reg.tabId, remove: true })
            .catch(() => { /* el main ya lo limpia al destruirse el webContents */ });
        }
        try { container.removeChild(wv); } catch { /* noop */ }
        webviewRef.current = null;
      };
    }, [useWebview]);

    // Navegación: cuando cambia src, actualizamos el webview existente sin
    // recrearlo. loadURL respeta history; setAttribute('src', ...) también
    // funciona pero loadURL es más explícito.
    useEffect(() => {
      if (!useWebview) return;
      const wv = webviewRef.current;
      if (!wv) return;
      if (!src) return;
      try {
        if (wv.getURL() !== src) wv.setAttribute('src', src);
      } catch {
        // Si el webview todavía no terminó de montar, simplemente seteamos src.
        wv.setAttribute('src', src);
      }
    }, [useWebview, src]);

    // En el <iframe> la emulación la hace el proxy de previews del backend
    // (dev-emulation.ts): la página lee la configuración de `window.name`, que
    // sale del atributo `name`, y los cambios de márgenes le llegan por
    // postMessage. Fuera del proxy (otro sitio, dev server local) no tiene efecto.
    const frameName = userAgent || safeArea ? `${EMULATION_NAME_PREFIX}${JSON.stringify({ userAgent, safeArea, nativeHints })}` : undefined;
    const postEmulationRef = useRef(() => {});
    postEmulationRef.current = () => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        target.postMessage({ type: 'eco-emulation', safeArea: safeArea ?? null, nativeHints: nativeHints ?? null }, new URL(src, window.location.href).origin);
      } catch { /* src todavía no es una URL válida */ }
    };
    useEffect(() => { if (!useWebview) postEmulationRef.current(); }, [useWebview, insetsKey, hintsKey]);

    // Wire eventos del <iframe> (fallback web puro).
    useEffect(() => {
      if (useWebview) return;
      const ifr = iframeRef.current;
      if (!ifr) return;
      const onLoad = () => {
        postEmulationRef.current();
        cbRef.current.onLoadSuccess?.();
        try {
          const t = ifr.contentDocument?.title;
          if (t) cbRef.current.onTitleChange?.(t);
        } catch { /* cross-origin */ }
      };
      ifr.addEventListener('load', onLoad);
      return () => ifr.removeEventListener('load', onLoad);
      // El iframe se recrea (key) cuando cambia el user agent.
    }, [useWebview, ua]);

    if (useWebview) {
      return (
        <div
          ref={containerRef}
          style={{
            width: '100%', height: '100%', position: 'relative', background: 'white',
            ...style,
            display: visible ? (style?.display ?? 'block') : 'none',
          }}
        />
      );
    }

    // Mixed content: si la app está en HTTPS (modo server vía Tailscale) y el
    // dev server es HTTP, el navegador bloquea el iframe. No hay forma de
    // embeberlo — ofrecemos abrirlo en pestaña nueva (top-level no es mixed).
    const isMixed = typeof window !== 'undefined'
      && window.location.protocol === 'https:'
      && /^http:\/\//i.test(src);
    if (isMixed) {
      return (
        <div
          style={{
            width: '100%', height: '100%',
            ...style,
            display: visible ? (style?.display ?? 'flex') : 'none',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: 24, textAlign: 'center',
            background: '#0c0e14', color: '#e5e7eb',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <div style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 380, color: '#9aa3b2' }}>
            {tr('browser.mixed.msg')}
          </div>
          <button
            type="button"
            onClick={() => { try { window.open(src, '_blank', 'noopener'); } catch { /* noop */ } }}
            style={{
              padding: '8px 20px', borderRadius: 10, border: '1px solid #2b3140',
              background: '#1a1d28', color: '#e5e7eb', fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {tr('browser.mixed.btn')}
          </button>
          <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', maxWidth: 380 }}>
            {src}
          </div>
        </div>
      );
    }

    return (
      <iframe
        // El user agent se lee una sola vez al cargar: cambiarlo exige un
        // iframe nuevo, con su `name` ya puesto.
        key={ua}
        ref={iframeRef}
        name={frameName}
        src={src}
        style={{
          width: '100%', height: '100%', border: 0, background: 'white',
          ...style,
          display: visible ? (style?.display ?? 'block') : 'none',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  },
);
