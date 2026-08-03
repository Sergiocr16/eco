// Detección del runtime en el que corre Eco.
// Esto permite que componentes como el navegador interno usen el mejor
// motor disponible: <webview> en Electron, WKWebView nativo en iOS con
// puente Capacitor, o iframe + proxy en web puro.

import { ecoPlatform } from './eco-config';

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
// lights de macOS (titleBarStyle: hiddenInset). SOLO macOS lo necesita: en
// Win/Linux la ventana usa el frame nativo del sistema, así que reservar 36px
// extra deja una franja vacía arriba (se ve como un "borde" y desperdicia
// espacio, sobre todo al maximizar/fullscreen). Por eso ahí devolvemos 0.
export function getTopInset(r: Runtime = detectRuntime()): number {
  const isMac =
    ecoPlatform() === 'darwin'
    || (ecoPlatform() === '' && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || ''));
  if (!isMac) return 0;
  if (r === 'electron') return 36;
  // Fallback web: detectar si el UA es Electron (por si falla detectRuntime).
  if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) {
    return 36;
  }
  return 0;
}

// ¿Corre como app instalada en la pantalla de inicio (standalone)? `navigator.
// standalone` es el camino de iOS; el display-mode cubre al resto.
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

// Safe area de iOS (notch / Dynamic Island arriba, indicador de home abajo).
// Son strings porque los inline styles aceptan cualquier valor CSS:
// `style={{ top: SAFE_TOP }}` y `calc(14px + ${SAFE_BOTTOM})` funcionan igual.
//
// **Solo aplican instalada.** Con `viewport-fit=cover` Safari igual reporta
// ~34px abajo, pero ahí la barra del navegador YA ocupa esa zona: sumarle el
// inset deja un hueco doble al pie de la pantalla. La regla es "los insets
// valen cuando somos dueños de toda la pantalla".
//
// Ojo: esto NO es getTopInset(). Ese reserva espacio para los traffic lights de
// macOS en Electron; esto compensa el hardware del teléfono. Son ortogonales.
const OWNS_FULL_SCREEN = isStandalone();
export const SAFE_TOP = OWNS_FULL_SCREEN ? 'env(safe-area-inset-top, 0px)' : '0px';
export const SAFE_BOTTOM = OWNS_FULL_SCREEN ? 'env(safe-area-inset-bottom, 0px)' : '0px';

export function runtimeLabel(r: Runtime = detectRuntime()): string {
  switch (r) {
    case 'electron': return 'Electron (escritorio)';
    case 'tauri': return 'Tauri (escritorio)';
    case 'capacitor-ios': return 'iOS (Capacitor)';
    case 'capacitor-android': return 'Android (Capacitor)';
    default: return 'Web (navegador)';
  }
}
