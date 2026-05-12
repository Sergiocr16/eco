import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setEcoConfig } from './lib/eco-config';
import './index.css';

async function bootstrap() {
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
      token: (import.meta.env.VITE_ECO_TOKEN as string) ?? '',
    });
  }

  // Import dinámico: App.tsx lee BACKEND/TOKEN del módulo eco-config al
  // evaluarse, así que tiene que evaluarse DESPUÉS de setEcoConfig().
  const { App } = await import('./App');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
