// Wrapper inteligente: usa <webview> de Electron cuando está disponible
// (Chromium real, sin restricciones de SOP, DevTools propio) o <iframe>
// como fallback en web puro.

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { canEmbedArbitrarySites } from '@/lib/platform';

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
};

export type SmartBrowserProps = {
  src: string;
  style?: CSSProperties;
  onTitleChange?: (title: string) => void;
  onNavigate?: (url: string) => void;
  onLoadFail?: (errorCode: number, errorDescription: string) => void;
  onLoadSuccess?: () => void;
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
  addEventListener: (event: string, cb: (e: Event & Record<string, unknown>) => void) => void;
  removeEventListener: (event: string, cb: (e: Event & Record<string, unknown>) => void) => void;
};

export const SmartBrowserView = forwardRef<SmartBrowserHandle, SmartBrowserProps>(
  function SmartBrowserView(
    { src, style, onTitleChange, onNavigate, onLoadFail, onLoadSuccess },
    handleRef,
  ) {
    const useWebview = canEmbedArbitrarySites();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const webviewRef = useRef<ElectronWebview | null>(null);

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
        if (useWebview) webviewRef.current?.openDevTools();
      },
      getURL: () => {
        if (useWebview) return webviewRef.current?.getURL() ?? src;
        return iframeRef.current?.src ?? src;
      },
    }), [useWebview, src]);

    // Crear <webview> imperativamente. Electron monta el WebContents cuando
    // detecta el elemento en el DOM con `src` ya presente — por eso es CLAVE
    // setear todos los atributos ANTES de hacer appendChild.
    useEffect(() => {
      if (!useWebview) return;
      const container = containerRef.current;
      if (!container) return;
      if (!src) return;

      const wv = document.createElement('webview') as ElectronWebview;
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('partition', 'persist:eco-browser');
      // User-Agent de Chrome estándar — sin "Electron" en el string, así
      // sitios como Google no nos redirigen a /sorry/index detectando
      // automatización. Mantenemos versión Chrome alta y reciente.
      wv.setAttribute('useragent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );
      wv.style.cssText = 'display:inline-flex;width:100%;height:100%;border:0;background:white;';
      wv.setAttribute('src', src);

      const onTitle = (e: Event & Record<string, unknown>) => {
        const title = (e as unknown as { title?: string }).title;
        if (title) onTitleChange?.(title);
      };
      const onNav = (e: Event & Record<string, unknown>) => {
        const url = (e as unknown as { url?: string }).url;
        if (url) onNavigate?.(url);
      };
      const onFail = (e: Event & Record<string, unknown>) => {
        const code = Number((e as { errorCode?: unknown }).errorCode ?? -1);
        const desc = String((e as { errorDescription?: unknown }).errorDescription ?? '');
        const url = String((e as { validatedURL?: unknown }).validatedURL ?? '');
        elog('[webview] did-fail-load', { code, desc, url });
        if (code === -3) return; // ERR_ABORTED — navegación cancelada por nueva nav
        onLoadFail?.(code, desc);
      };
      const onFinish = () => {
        elog('[webview] did-finish-load', src);
        onLoadSuccess?.();
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
    }, [useWebview, src, onTitleChange, onNavigate, onLoadFail, onLoadSuccess]);

    // Wire eventos del <iframe> (fallback web puro).
    useEffect(() => {
      if (useWebview) return;
      const ifr = iframeRef.current;
      if (!ifr) return;
      const onLoad = () => {
        onLoadSuccess?.();
        try {
          const t = ifr.contentDocument?.title;
          if (t) onTitleChange?.(t);
        } catch { /* cross-origin */ }
      };
      ifr.addEventListener('load', onLoad);
      return () => ifr.removeEventListener('load', onLoad);
    }, [useWebview, onTitleChange, onLoadSuccess]);

    if (useWebview) {
      return (
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', position: 'relative', background: 'white', ...style }}
        />
      );
    }

    return (
      <iframe
        ref={iframeRef}
        src={src}
        style={{ width: '100%', height: '100%', border: 0, background: 'white', ...style }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  },
);
