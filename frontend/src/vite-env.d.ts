/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ECO_TOKEN: string;
  readonly VITE_ECO_BACKEND: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Expuesta por electron/preload.cjs cuando corremos dentro de Electron.
interface EcoElectronConfig {
  backendUrl: string;
  token: string;
  platform: string;
  appVersion: string;
  isPackaged: boolean;
}

interface Window {
  electronAPI?: {
    getConfig: () => Promise<EcoElectronConfig>;
    log?: (...args: unknown[]) => void;
    pickFolder?: (opts?: { title?: string; defaultPath?: string }) => Promise<{ canceled: boolean; path: string }>;
    onFullscreenChange?: (cb: (isFull: boolean) => void) => () => void;
    setZoomFactor?: (factor: number) => boolean;
    getZoomFactor?: () => number;
    onZoom?: (cb: (dir: 'in' | 'out' | 'reset') => void) => () => void;
    setMenuLabels?: (labels: {
      edit: string; view: string; window: string;
      zoomIn: string; zoomOut: string; zoomActual: string;
    }) => Promise<{ ok: boolean }>;
    notify?: (opts: { title: string; body?: string; bubbleId?: string; silent?: boolean }) => Promise<{ ok: boolean; error?: string }>;
    onNotificationClicked?: (cb: (payload: { bubbleId: string }) => void) => () => void;
    openBubbleWindow?: (bubbleId: string) => Promise<{ ok: boolean; existing?: boolean; error?: string }>;
    closeBubbleWindow?: (bubbleId: string) => Promise<{ ok: boolean }>;
    listBubbleWindows?: () => Promise<string[]>;
    onBubbleWindowChange?: (cb: (payload: { bubbleId: string; open: boolean }) => void) => () => void;
  };
}
