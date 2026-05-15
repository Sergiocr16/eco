import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTokens } from '@/design/theme';

type Props = {
  // localStorage key para persistir el ancho elegido. Si null, no persiste.
  storageKey: string | null;
  // Ancho inicial de la columna izquierda en px.
  defaultLeft: number;
  // Límites de drag.
  minLeft?: number;
  maxLeftPercent?: number; // ej. 0.6 → no más del 60% del contenedor
  left: ReactNode;
  right: ReactNode;
};

// Splitter horizontal con drag handle entre dos columnas. Usado en
// ChangesView y HistoryView para que el user balancee el ancho de la
// lista vs el diff (estilo GitHub Desktop).
export function ResizableSplit({
  storageKey, defaultLeft, minLeft = 200, maxLeftPercent = 0.6, left, right,
}: Props) {
  const t = useTokens();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (!storageKey) return defaultLeft;
    try {
      const raw = localStorage.getItem(storageKey);
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n >= minLeft) return n;
    } catch { /* noop */ }
    return defaultLeft;
  });
  const [dragging, setDragging] = useState(false);

  const persist = useCallback((w: number) => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, String(Math.round(w))); } catch { /* noop */ }
  }, [storageKey]);

  // Drag handlers attached al document mientras dragging — sino se pierde
  // el mouseup si soltás fuera del handle.
  useEffect(() => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const max = rect.width * maxLeftPercent;
      const next = Math.max(minLeft, Math.min(max, x));
      setLeftWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      // Persistimos al soltar, no en cada move (evita spam de writes).
      setLeftWidth((w) => { persist(w); return w; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    // Previene seleccionar texto mientras arrastrás.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, minLeft, maxLeftPercent, persist]);

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
      <div style={{ width: leftWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {left}
      </div>
      {/* Handle de drag */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
        onDoubleClick={() => { setLeftWidth(defaultLeft); persist(defaultLeft); }}
        title="Arrastrá para redimensionar · doble click = reset"
        style={{
          width: 6, flexShrink: 0,
          cursor: 'col-resize',
          background: dragging
            ? `color-mix(in oklch, ${t.accent} 40%, transparent)`
            : 'transparent',
          borderLeft: `1px solid ${t.glassBorder}`,
          borderRight: `1px solid ${t.glassBorder}`,
          transition: dragging ? 'none' : 'background 120ms',
          position: 'relative',
          zIndex: 5,
        }}
        onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.background = `color-mix(in oklch, ${t.accent} 20%, transparent)`; }}
        onMouseLeave={(e) => { if (!dragging) e.currentTarget.style.background = 'transparent'; }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        {right}
      </div>
    </div>
  );
}
