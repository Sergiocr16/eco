// Zoom de toda la UI. Dos motores según el runtime:
//   - Electron: webFrame.setZoomFactor — zoom nativo de Chromium, POR VENTANA
//     (la principal y cada satélite ?solo=<id> escalan por separado). Es el
//     mismo camino que Cmd +/−/0 del menú Vista.
//   - Web/PWA: `zoom` CSS sobre <html>. Es la única opción cuando no hay
//     atajos del navegador (iPad/iPhone instalada). Bajo zoom CSS, Chromium y
//     WebKit devuelven px VISUALES en getBoundingClientRect/clientX, así que
//     todo lo que mida en píxeles y lo aplique como estilo divide por cssZoom().
// Persistido por identidad de ventana: eco.zoom.main / eco.zoom.solo.<id>.

import { useEffect, useState } from 'react';
import { getSoloBubbleId } from './solo';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.0;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1.0;

function zoomKey(): string {
  const solo = getSoloBubbleId();
  return solo ? `eco.zoom.solo.${solo}` : 'eco.zoom.main';
}

// Redondeo a 2 decimales para evitar drift de floats al sumar 0.1 repetido.
export function clampZoom(n: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
}

function readZoom(): number {
  try {
    const n = Number(window.localStorage.getItem(zoomKey()));
    if (Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return n;
  } catch { /* noop */ }
  return ZOOM_DEFAULT;
}

export function hasNativeZoom(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.setZoomFactor;
}

let current = typeof window !== 'undefined' ? readZoom() : ZOOM_DEFAULT;
const subs = new Set<(z: number) => void>();

export function getUiZoom(): number {
  return current;
}

// Factor del zoom CSS vigente: 1 en Electron, donde el zoom es nativo y el
// DOM no se entera. Sirve para convertir px visuales → px CSS del documento.
export function cssZoom(): number {
  return hasNativeZoom() ? 1 : current;
}

function applyZoom(z: number): void {
  if (typeof document === 'undefined') return;
  if (hasNativeZoom()) {
    window.electronAPI?.setZoomFactor?.(z);
    return;
  }
  const root = document.documentElement;
  if (z === 1) root.style.removeProperty('zoom');
  else root.style.setProperty('zoom', String(z));
  // Los env(safe-area-inset-*) llegan en px visuales: platform.ts los divide
  // por esta variable para que el shell no reserve Z veces el inset.
  root.style.setProperty('--eco-zoom', String(z));
  // Las unidades de viewport también se escalan con el documento (100vh bajo
  // zoom 1.3 mide 130% del viewport): los helpers vh()/vw()/dvh() leen estas
  // variables en vez de la unidad cruda.
  for (const u of ['vh', 'vw', 'dvh'] as const) {
    if (z === 1) root.style.removeProperty(`--eco-${u}`);
    else root.style.setProperty(`--eco-${u}`, `calc(1${u} / ${z})`);
  }
}

// Unidades de viewport corregidas por zoom, para usar en estilos inline en vez
// de '85vh' / 'calc(100vw - 48px)'. En Electron (zoom nativo) y a 100% las
// variables no existen y el fallback es la unidad tal cual.
export const vh = (n: number): string => `calc(${n} * var(--eco-vh, 1vh))`;
export const vw = (n: number): string => `calc(${n} * var(--eco-vw, 1vw))`;
export const dvh = (n: number): string => `calc(${n} * var(--eco-dvh, 1dvh))`;

export function setUiZoom(next: number): number {
  const z = clampZoom(next);
  current = z;
  try { window.localStorage.setItem(zoomKey(), String(z)); } catch { /* noop */ }
  applyZoom(z);
  subs.forEach((fn) => fn(z));
  return z;
}

// Aplica el factor persistido antes del primer render, sin avisar a nadie:
// así no hay flash a 100% ni indicador al arrancar.
export function applyStoredUiZoom(): void {
  applyZoom(current);
}

export function subscribeUiZoom(fn: (z: number) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function useUiZoom(): number {
  const [z, setZ] = useState(current);
  useEffect(() => subscribeUiZoom(setZ), []);
  return z;
}

// Versión reactiva de cssZoom() para los componentes que contra-zoomean.
export function useCssZoom(): number {
  const z = useUiZoom();
  return hasNativeZoom() ? 1 : z;
}
