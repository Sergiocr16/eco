import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setEcoConfig, readStoredToken } from './lib/eco-config';
import { RootErrorBoundary, bootReloadOnce } from './components/RootErrorBoundary';
import { applyStoredUiZoom } from './lib/ui-zoom';
import './index.css';

async function bootstrap() {
  // Antes del primer render: así el zoom persistido no parpadea a 100%.
  applyStoredUiZoom();

  // En Electron, el preload nos da el token leído de ~/.eco/token y la URL
  // del backend. En web puro, fallback a las env vars de Vite.
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      const cfg = await window.electronAPI.getConfig();
      setEcoConfig({ backend: cfg.backendUrl, token: cfg.token, platform: cfg.platform });
    } catch {
      // si falla el IPC, dejamos los defaults.
    }
  } else {
    setEcoConfig({
      backend: (import.meta.env.VITE_ECO_BACKEND as string) ?? '',
      // Fallback al token pegado por el user (server mode remoto) cuando no
      // hay env de Vite — ver ConnectView en AuthScreen.
      token: (import.meta.env.VITE_ECO_TOKEN as string) || readStoredToken() || '',
    });
  }

  // Import dinámico: App.tsx lee BACKEND/TOKEN del módulo eco-config al
  // evaluarse, así que tiene que evaluarse DESPUÉS de setEcoConfig().
  // En try/catch: si el import o el primer render fallan (asset hash viejo tras
  // un rebuild, IPC caído), recargamos una vez en vez de quedar sin montar nada.
  try {
    const { App } = await import('./App');
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </StrictMode>,
    );
  } catch (e) {
    console.error('[eco] bootstrap falló:', e);
    bootReloadOnce();
  }

  registerServiceWorker();
}

// El SW existe para que iOS instale Eco como app (Compartir → Agregar a
// inicio) y la abra sin la barra de Safari. Solo en web sobre HTTPS: bajo
// file:// (Electron empaquetado) no hay service workers, y sobre http:// el
// navegador rechaza el registro salvo en localhost.
function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (window.electronAPI) return;
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[eco] no se pudo registrar el service worker:', e);
    });
  });
}

void bootstrap();
