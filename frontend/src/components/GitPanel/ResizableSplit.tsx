import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { useT } from '@/hooks/useI18n';

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
  // Móvil: qué panel mostrar. Los consumidores que ya saben si hay algo
  // seleccionado (un archivo, un commit, un PR) lo pasan y el cambio de panel
  // es automático; sin la prop queda el toggle manual.
  mobileShow?: 'left' | 'right';
  // Rótulos del toggle. Por defecto "Lista" / "Detalle".
  mobileLeftLabel?: string;
  mobileRightLabel?: string;
};

// El panel derecho nunca baja de esto, pase lo que pase con el ancho
// persistido o con el minLeft del consumidor.
const RIGHT_MIN = 160;

// Splitter horizontal con drag handle entre dos columnas. Usado en
// ChangesView y HistoryView para que el user balancee el ancho de la
// lista vs el diff (estilo GitHub Desktop).
//
// En táctil no hay splitter: los anchos fijos de los consumidores (300/380/360)
// dejarían el panel derecho en cero o en negativo, y el drag es mouse-only.
// Ahí se muestra un panel a la vez con un toggle segmentado arriba.
export function ResizableSplit({
  storageKey, defaultLeft, minLeft = 200, maxLeftPercent = 0.6, left, right,
  mobileShow, mobileLeftLabel, mobileRightLabel,
}: Props) {
  const t = useTokens();
  const tr = useT();
  const isPhone = useIsPhone();
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
  const [pane, setPane] = useState<'left' | 'right'>('left');

  // El consumidor manda: seleccionar un archivo salta al detalle, y limpiar la
  // selección vuelve a la lista. El primer render se saltea a propósito: casi
  // todos persisten la última selección, y abrir el panel directo en el
  // detalle de algo elegido hace tres sesiones desorienta.
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) { firstSyncRef.current = false; return; }
    if (mobileShow) setPane(mobileShow);
  }, [mobileShow]);

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
      // El clamp estaba invertido: en un contenedor angosto,
      // `rect.width * maxLeftPercent` cae por debajo de minLeft y el
      // `Math.max(minLeft, …)` final lo dejaba MÁS ancho que su propio máximo.
      // Acá el techo gana cuando los dos no pueden cumplirse a la vez.
      const max = Math.min(rect.width * maxLeftPercent, Math.max(120, rect.width - RIGHT_MIN));
      const lo = Math.min(minLeft, max);
      const next = Math.max(lo, Math.min(max, x));
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

  if (isPhone) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <div style={{
          display: 'flex', gap: 4, padding: '6px 10px', flexShrink: 0,
          borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <PaneBtn active={pane === 'left'} onClick={() => setPane('left')}>
            {mobileLeftLabel ?? tr('split.list')}
          </PaneBtn>
          <PaneBtn active={pane === 'right'} onClick={() => setPane('right')}>
            {mobileRightLabel ?? tr('split.detail')}
          </PaneBtn>
        </div>
        {/* Los dos quedan montados: desmontar el diff o el editor al cambiar
            de panel perdería scroll y estado, y el árbol de archivos tendría
            que re-fetchear en cada ida y vuelta. */}
        <div style={{
          flex: 1, minHeight: 0, minWidth: 0,
          display: pane === 'left' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden',
        }}>
          {left}
        </div>
        <div style={{
          flex: 1, minHeight: 0, minWidth: 0,
          display: pane === 'right' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden',
        }}>
          {right}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
      <div style={{
        width: leftWidth,
        // Red de seguridad en CSS para el ancho persistido: un 380 guardado en
        // una ventana ancha no puede aplastar el panel derecho en una angosta.
        maxWidth: `calc(100% - ${RIGHT_MIN}px)`,
        flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      }}>
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

function PaneBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, height: 36, borderRadius: 8,
        border: `1px solid ${active ? t.accentDim : 'transparent'}`,
        background: active ? t.accentFaint : t.bg2,
        color: active ? t.accent : t.text2,
        fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
        cursor: 'pointer', transition: 'all 140ms',
      }}>
      {children}
    </button>
  );
}
