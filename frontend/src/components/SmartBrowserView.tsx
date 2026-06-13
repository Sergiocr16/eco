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
};

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
  addEventListener: (event: string, cb: (e: Event & Record<string, unknown>) => void) => void;
  removeEventListener: (event: string, cb: (e: Event & Record<string, unknown>) => void) => void;
};

export const SmartBrowserView = forwardRef<SmartBrowserHandle, SmartBrowserProps>(
  function SmartBrowserView(
    { src, style, onTitleChange, onNavigate, onLoadFail, onLoadSuccess, partition, visible = true },
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
      wv.setAttribute('useragent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );
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

      container.appendChild(wv);
      webviewRef.current = wv;

      return () => {
        wv.removeEventListener('page-title-updated', onTitle);
        wv.removeEventListener('did-navigate', onNav);
        wv.removeEventListener('did-navigate-in-page', onNav);
        wv.removeEventListener('did-fail-load', onFail);
        wv.removeEventListener('did-finish-load', onFinish);
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

    // Wire eventos del <iframe> (fallback web puro).
    useEffect(() => {
      if (useWebview) return;
      const ifr = iframeRef.current;
      if (!ifr) return;
      const onLoad = () => {
        cbRef.current.onLoadSuccess?.();
        try {
          const t = ifr.contentDocument?.title;
          if (t) cbRef.current.onTitleChange?.(t);
        } catch { /* cross-origin */ }
      };
      ifr.addEventListener('load', onLoad);
      return () => ifr.removeEventListener('load', onLoad);
    }, [useWebview]);

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
          <div style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 380, color: '#9aa3b2' }}>
            {tr('browser.mixed.msg')}
          </div>
          <button
            type="button"
            onClick={() => { try { window.open(src, '_blank', 'noopener'); } catch { /* noop */ } }}
            style={{
              padding: '9px 18px', borderRadius: 10, border: '1px solid #2b3140',
              background: '#1a1d28', color: '#e5e7eb', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tr('browser.mixed.btn')}
          </button>
          <div style={{ fontSize: 11.5, color: '#6b7280', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', maxWidth: 380 }}>
            {src}
          </div>
        </div>
      );
    }

    return (
      <iframe
        ref={iframeRef}
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
