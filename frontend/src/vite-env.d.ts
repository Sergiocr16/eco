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
  };
}
