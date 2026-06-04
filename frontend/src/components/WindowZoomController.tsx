// Zoom de toda la UI POR VENTANA. En Electron cada ventana (la principal y las
// satélites "?solo=<id>" de otro monitor) tiene su propio webFrame, así que el
// factor escala solo esa ventana — pensado para calzar la UI en monitores de
// distinta resolución. El factor se persiste por identidad de ventana:
//   - principal  → eco.zoom.main
//   - satélite   → eco.zoom.solo.<bubbleId>
// Atajos: Cmd/Ctrl + (= / +) agranda, Cmd/Ctrl − achica, Cmd/Ctrl 0 resetea.
// Los atajos los registra el menú Vista de Electron (main.cjs) y llegan acá por
// el evento `onZoom` — así no hay doble disparo con los roles built-in.
// No hace nada fuera de Electron (en el navegador el zoom nativo ya existe).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { getSoloBubbleId } from '@/lib/solo';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1.0;

function zoomKey(): string {
  const solo = getSoloBubbleId();
  return solo ? `eco.zoom.solo.${solo}` : 'eco.zoom.main';
}

function clampZoom(n: number): number {
  // Redondeo a 2 decimales para evitar drift de floats al sumar 0.1 repetido.
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
}

function readZoom(key: string): number {
  try {
    const n = Number(window.localStorage.getItem(key));
    if (Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return n;
  } catch { /* noop */ }
  return ZOOM_DEFAULT;
}

export function WindowZoomController() {
  const t = useTokens();
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.setZoomFactor;
  const keyRef = useRef(zoomKey());
  const [zoom, setZoom] = useState<number>(() => readZoom(keyRef.current));
  const zoomRef = useRef(zoom);
  // Indicador transitorio (pill con el %) que aparece al cambiar y se desvanece.
  const [showIndicator, setShowIndicator] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((next: number, flash: boolean) => {
    const clamped = clampZoom(next);
    zoomRef.current = clamped;
    setZoom(clamped);
    try { window.localStorage.setItem(keyRef.current, String(clamped)); } catch { /* noop */ }
    window.electronAPI?.setZoomFactor?.(clamped);
    if (flash) {
      setShowIndicator(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowIndicator(false), 1100);
    }
  }, []);

  // Aplica el factor persistido al montar (sin flash).
  useEffect(() => {
    if (!isElectron) return;
    apply(readZoom(keyRef.current), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  // El menú Vista (Cmd +/−/0) emite 'in' | 'out' | 'reset' a esta ventana.
  useEffect(() => {
    if (!isElectron) return;
    const off = window.electronAPI?.onZoom?.((dir) => {
      if (dir === 'in') apply(zoomRef.current + ZOOM_STEP, true);
      else if (dir === 'out') apply(zoomRef.current - ZOOM_STEP, true);
      else apply(ZOOM_DEFAULT, true);
    });
    return () => { if (off) off(); };
  }, [isElectron, apply]);

  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  if (!isElectron || !showIndicator) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      zIndex: 400, pointerEvents: 'none',
      padding: '7px 14px', borderRadius: 999,
      background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
      boxShadow: t.shadowLg, color: t.text0,
      fontFamily: t.fontMono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums',
      letterSpacing: 0.2,
    }}>
      {Math.round(zoom * 100)}%
    </div>
  );
}
