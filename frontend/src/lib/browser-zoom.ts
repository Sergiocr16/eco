import { useEffect, useState } from 'react';

// Zoom del navegador embebido, global: el último que se puso lo usa todo
// navegador que se abra después, de cualquier agente.
const KEY = 'eco.browser.zoom';
const MIN = 0.25;
const MAX = 3;

const listeners = new Set<(z: number) => void>();

function isValid(n: number): boolean {
  return Number.isFinite(n) && n >= MIN && n <= MAX;
}

export function getBrowserZoom(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 1;
    const n = Number(raw);
    return isValid(n) ? n : 1;
  } catch { return 1; }
}

export function setBrowserZoom(next: number): void {
  if (!isValid(next)) return;
  try { localStorage.setItem(KEY, String(next)); } catch { /* noop */ }
  listeners.forEach((fn) => fn(next));
}

export function useBrowserZoom(): [number, (next: number) => void] {
  const [zoom, setZoom] = useState<number>(getBrowserZoom);
  useEffect(() => {
    listeners.add(setZoom);
    return () => { listeners.delete(setZoom); };
  }, []);
  return [zoom, setBrowserZoom];
}
