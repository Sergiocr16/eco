// Detección del runtime en el que corre Eco.
// Esto permite que componentes como el navegador interno usen el mejor
// motor disponible: <webview> en Electron, WKWebView nativo en iOS con
// puente Capacitor, o iframe + proxy en web puro.

export type Runtime = 'web' | 'electron' | 'tauri' | 'capacitor-ios' | 'capacitor-android';

declare global {
  interface Window {
    electronAPI?: unknown;
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

export function runtimeLabel(r: Runtime = detectRuntime()): string {
  switch (r) {
    case 'electron': return 'Electron (escritorio)';
    case 'tauri': return 'Tauri (escritorio)';
    case 'capacitor-ios': return 'iOS (Capacitor)';
    case 'capacitor-android': return 'Android (Capacitor)';
    default: return 'Web (navegador)';
  }
}
