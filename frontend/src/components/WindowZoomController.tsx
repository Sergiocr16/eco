// Indicador transitorio del zoom (pill con el %) + atajos del menú Vista de
// Electron: Cmd/Ctrl + (= / +) agranda, Cmd/Ctrl − achica, Cmd/Ctrl 0 resetea.
// Los registra main.cjs y llegan por `onZoom` — así no hay doble disparo con
// los roles built-in. El estado vive en lib/ui-zoom.ts, compartido con
// Settings → Apariencia; en web no hay atajos (el navegador tiene los suyos)
// y el zoom se cambia desde ahí.

import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { getUiZoom, setUiZoom, subscribeUiZoom, ZOOM_DEFAULT, ZOOM_STEP } from '@/lib/ui-zoom';

export function WindowZoomController() {
  const t = useTokens();
  const [zoom, setZoom] = useState<number>(getUiZoom());
  const [showIndicator, setShowIndicator] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeUiZoom((z) => {
    setZoom(z);
    setShowIndicator(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowIndicator(false), 1100);
  }), []);

  useEffect(() => {
    const off = window.electronAPI?.onZoom?.((dir) => {
      if (dir === 'in') setUiZoom(getUiZoom() + ZOOM_STEP);
      else if (dir === 'out') setUiZoom(getUiZoom() - ZOOM_STEP);
      else setUiZoom(ZOOM_DEFAULT);
    });
    return () => { if (off) off(); };
  }, []);

  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  if (!showIndicator) return null;

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
