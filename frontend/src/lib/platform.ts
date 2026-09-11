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
// **Abajo solo aplica instalada.** Con `viewport-fit=cover` Safari igual
// reporta ~34px abajo, pero ahí la barra del navegador YA ocupa esa zona:
// sumarle el inset deja un hueco doble al pie de la pantalla. Arriba es
// distinto — ver RAW_TOP.
//
// Ojo: esto NO es getTopInset(). Ese reserva espacio para los traffic lights de
// macOS en Electron; esto compensa el hardware del teléfono. Son ortogonales.
const OWNS_FULL_SCREEN = isStandalone();

// iPad incluido: navigator.platform dice "MacIntel" desde iPadOS 13 y lo
// delata el touch.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Arriba el inset vale SIEMPRE, instalada o no: desde iOS 26 el contenido se
// mete debajo de la barra de estado también en Safari, y cuando el navegador
// ya reserva esa franja env() devuelve 0 solo.
//
// Instalada en iOS 26.1+ (verificado en iPadOS 27) hace falta un colchón extra: el sistema esmerila una
// banda progresiva sobre el borde superior del web view (~4× la barra de
// estado) y lo hace con cualquier `apple-mobile-web-app-status-bar-style`,
// opaca incluida — se probó. No hay API que diga cuánto mide. Los 40px salen
// de medir en un iPad 13": la banda se desvanece a ~95pt del borde de la
// pantalla. Debajo queda solo el fondo del shell, y un color plano esmerilado
// no se nota; texto sí.
const IOS_FROST_EXTRA = OWNS_FULL_SCREEN && isIOS() ? ' + 40px' : '';
// Bajo zoom CSS (web) los env() llegan en px visuales; lib/ui-zoom.ts publica
// el factor en --eco-zoom para que el shell no reserve Z veces el inset.
export const SAFE_TOP = `calc((env(safe-area-inset-top, 0px)${IOS_FROST_EXTRA}) / var(--eco-zoom, 1))`;
export const SAFE_BOTTOM = OWNS_FULL_SCREEN
  ? 'calc(env(safe-area-inset-bottom, 0px) / var(--eco-zoom, 1))'
  : '0px';

export function runtimeLabel(r: Runtime = detectRuntime()): string {
  switch (r) {
    case 'electron': return 'Electron (escritorio)';
    case 'tauri': return 'Tauri (escritorio)';
    case 'capacitor-ios': return 'iOS (Capacitor)';
    case 'capacitor-android': return 'Android (Capacitor)';
    default: return 'Web (navegador)';
  }
}
