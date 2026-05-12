// Detección del runtime en el que corre Eco.
// Esto permite que componentes como el navegador interno usen el mejor
// motor disponible: <webview> en Electron, WKWebView nativo en iOS con
// puente Capacitor, o iframe + proxy en web puro.

export type Runtime = 'web' | 'electron' | 'tauri' | 'capacitor-ios' | 'capacitor-android';

declare global {
  interface Window {
    __TAURI__?: unknown;
    Capacitor?: { getPlatform?: () => string };
  }
}

export function detectRuntime(): Runtime {
  if (typeof window === 'undefined') return 'web';
  if (window.electronAPI || /Electron/i.test(navigator.userAgent)) return 'electron';
  if (window.__TAURI__) return 'tauri';
  if (window.Capacitor?.getPlatform) {
    const p = window.Capacitor.getPlatform();
    if (p === 'ios') return 'capacitor-ios';
    if (p === 'android') return 'capacitor-android';
  }
  return 'web';
}

export function canEmbedArbitrarySites(): boolean {
  // Solo runtimes con webview real pueden ignorar X-Frame-Options/CSP.
  const r = detectRuntime();
  return r === 'electron' || r === 'tauri';
}

// Espacio reservado arriba de la ventana para que la UI no tape los traffic
// lights de macOS (titleBarStyle: hiddenInset). En Win/Linux Electron y en
// web puro no aplica.
export function getTopInset(r: Runtime = detectRuntime()): number {
  // En Electron SIEMPRE reservamos espacio. En Mac los traffic lights ocupan
  // el área superior izquierda; en Win/Linux el frame del sistema ya cubre,
  // pero los 36px de margen extra no estorban — mejor consistencia.
  if (r === 'electron') return 36;
  // Fallback web: detectar si el UA es Electron (por si falla detectRuntime).
  if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) {
    return 36;
  }
  return 0;
}

export function runtimeLabel(r: Runtime = detectRuntime()): string {
  switch (r) {
    case 'electron': return 'Electron (escritorio)';
    case 'tauri': return 'Tauri (escritorio)';
    case 'capacitor-ios': return 'iOS (Capacitor)';
    case 'capacitor-android': return 'Android (Capacitor)';
    default: return 'Web (navegador)';
  }
}
