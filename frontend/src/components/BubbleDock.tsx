import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { useTokens } from '@/design/theme';
import { stateColor, type AgentState } from '@/design/tokens';
import type { Bubble } from '@/lib/types';
import { bubbleLetter } from '@/design/primitives';
import { IconCommand } from '@/design/icons';
import { useBubbleBusy } from '@/hooks/usePtyBusyNotifier';

type Props = {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  onOpenAgent: (id: string) => void;
  onGoHome?: () => void;
  atHome?: boolean;
};

// Persistencia del orden custom del dock. Lista plana de bubbleIds — se
// aplica como override del sort default (pinned + updatedAt). Los bubbles
// que NO están en la lista van al final con su sort default.
const ORDER_KEY = 'eco.dock.order';

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
function saveOrder(ids: string[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch { /* noop */ }
}

// Dock estilo macOS — flotante en bottom-center, horizontal, con blur y
// magnificación que crece hacia arriba (sin empujar vecinos). Los iconos
// son reordenables con drag.
export function BubbleDock({ bubbles, activeBubbleId, onOpenAgent, onGoHome, atHome }: Props) {
  const t = useTokens();
  const [customOrder, setCustomOrder] = useState<string[]>(loadOrder);

  if (bubbles.length === 0 && !onGoHome) return null;

  const sortFn = (a: Bubble, b: Bubble) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  };

  // Aplica el orden custom: los bubbles que están en customOrder respetan
  // ese orden; el resto va al final ordenado por sortFn.
  const applyCustomOrder = useCallback((items: Bubble[]) => {
    const indexMap = new Map<string, number>();
    customOrder.forEach((id, i) => indexMap.set(id, i));
    return [...items].sort((a, b) => {
      const ia = indexMap.get(a.id);
      const ib = indexMap.get(b.id);
      if (ia != null && ib != null) return ia - ib;
      if (ia != null) return -1;
      if (ib != null) return 1;
      return sortFn(a, b);
    });
  }, [customOrder]);

  // Si hay más de un workspace en uso, agrupamos los iconos del dock por
  // carpeta — clusters separados por un divisor. Con una sola carpeta es una
  // lista plana.
  const wsGroups = (() => {
    const map = new Map<string, Bubble[]>();
    for (const b of bubbles) {
      const key = b.workspace || '__none__';
      const arr = map.get(key);
      if (arr) arr.push(b);
      else map.set(key, [b]);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: key === '__none__'
        ? 'Sin carpeta'
        : (key.split('/').filter(Boolean).pop() || key),
      items: applyCustomOrder(items),
    }));
  })();
  const grouped = wsGroups.length > 1;
  const ordered = applyCustomOrder(bubbles);

  // Handler de reordenamiento: recibe la nueva lista del grupo y persiste el
  // orden global manteniendo a los bubbles de OTROS grupos en sus posiciones.
  const handleReorder = useCallback((groupKey: string | null, reorderedIds: string[]) => {
    setCustomOrder((prev) => {
      // Construimos el nuevo orden global: para cada bubble, si está en el
      // grupo afectado uso el nuevo orden; si no, mantengo el prev.
      const inGroup = new Set<string>();
      if (groupKey === null) {
        // Sin agrupación: el reorderedIds ES el orden completo.
        for (const id of reorderedIds) inGroup.add(id);
      } else {
        const groupItems = wsGroups.find((g) => g.key === groupKey)?.items ?? [];
        for (const b of groupItems) inGroup.add(b.id);
      }
      // Mantiene el orden global, pero reemplaza las posiciones del grupo
      // con el nuevo orden.
      const next: string[] = [];
      let groupCursor = 0;
      const globalOrder = prev.length > 0 ? prev : bubbles.map((b) => b.id);
      for (const id of globalOrder) {
        if (inGroup.has(id)) {
          // Reemplaza con el siguiente del nuevo orden del grupo.
          if (groupCursor < reorderedIds.length) {
            next.push(reorderedIds[groupCursor]!);
            groupCursor++;
          }
        } else {
          next.push(id);
        }
      }
      // Bubbles del grupo nuevo que aún no estaban en globalOrder van al final.
      for (let i = groupCursor; i < reorderedIds.length; i++) {
        if (!next.includes(reorderedIds[i]!)) next.push(reorderedIds[i]!);
      }
      // Bubbles del bubbles que no aparecen en el orden (nuevos) van al final.
      for (const b of bubbles) {
        if (!next.includes(b.id)) next.push(b.id);
      }
      saveOrder(next);
      return next;
    });
  }, [bubbles, wsGroups]);

  const divider = (
    <span style={{
      width: 1, height: 44, alignSelf: 'center',
      background: t.glassBorder, margin: '0 6px',
    }}/>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 28 }}
      style={{
        position: 'fixed',
        bottom: 14,
        left: 64,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 80,
      }}>
      <div style={{
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        padding: '8px 10px',
        borderRadius: 18,
        background: t.glassBg,
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: `1px solid ${t.glassBorder}`,
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,0.08)',
          '0 8px 32px rgba(0,0,0,0.35)',
          '0 2px 6px rgba(0,0,0,0.2)',
        ].join(', '),
        overflow: 'visible',
        maxWidth: 'calc(100vw - 96px)',
      }}>
        {onGoHome && (
          <>
            <HomeDockIcon active={!!atHome} onClick={onGoHome}/>
            {bubbles.length > 0 && divider}
          </>
        )}
        <div
          className="eco-thin-scroll"
          style={{
            minWidth: 0,
            display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 4,
            overflowX: 'auto', overflowY: 'visible',
            paddingTop: 22, paddingBottom: 8,
            marginTop: -22, marginBottom: -8,
          }}>
          {grouped ? (
            wsGroups.map((g, gi) => (
              <Fragment key={g.key}>
                {gi > 0 && divider}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3,
                }}>
                  <span title={g.label} style={{
                    maxWidth: 'calc(100% - 4px)',
                    fontFamily: t.fontSans, fontSize: 8.5, fontWeight: 700,
                    letterSpacing: 0.4, textTransform: 'uppercase',
                    color: t.text3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    pointerEvents: 'none', userSelect: 'none',
                  }}>{g.label}</span>
                  <Reorder.Group
                    axis="x"
                    values={g.items}
                    onReorder={(newItems) => handleReorder(g.key, newItems.map((b) => b.id))}
                    style={{
                      display: 'flex', flexDirection: 'row',
                      alignItems: 'flex-end', gap: 4,
                      listStyle: 'none', margin: 0, padding: 0,
                    }}>
                    {g.items.map((b, i) => (
                      <DockIcon
                        key={b.id}
                        bubble={b}
                        index={i}
                        active={b.id === activeBubbleId}
                        onClick={() => onOpenAgent(b.id)}
                      />
                    ))}
                  </Reorder.Group>
                </div>
              </Fragment>
            ))
          ) : (
            <Reorder.Group
              axis="x"
              values={ordered}
              onReorder={(newItems) => handleReorder(null, newItems.map((b) => b.id))}
              style={{
                display: 'flex', flexDirection: 'row',
                alignItems: 'flex-end', gap: 4,
                listStyle: 'none', margin: 0, padding: 0,
              }}>
              {ordered.map((b, i) => (
                <DockIcon
                  key={b.id}
                  bubble={b}
                  index={i}
                  active={b.id === activeBubbleId}
                  onClick={() => onOpenAgent(b.id)}
                />
              ))}
            </Reorder.Group>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const SIZE = 40;
const SLOT_WIDTH = 60;

function HomeDockIcon({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  const HOME_SLOT = 48;
  const SLOT_HEIGHT = SIZE + 17;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: HOME_SLOT, height: SLOT_HEIGHT,
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center',
      }}>
      <motion.button
        type="button"
        onClick={onClick}
        title="Ir al inicio"
        whileHover={{ scale: 1.35, y: -6 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        style={{
          width: SIZE, height: SIZE,
          padding: 0, border: 0, cursor: 'pointer',
          borderRadius: 11,
          background: active ? t.bg3 : (hover ? t.bg2 : 'rgba(255,255,255,0.04)'),
          color: active ? t.accent : t.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transformOrigin: 'bottom center',
          transition: 'background 140ms',
          boxShadow: active
            ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${t.accent}33`
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
        <IconCommand size={24} strokeWidth={1.6}/>
      </motion.button>
      {active && (
        <span style={{
          position: 'absolute', bottom: -6, left: '50%',
          transform: 'translateX(-50%)',
          width: 4, height: 4, borderRadius: '50%',
          background: t.accent,
          boxShadow: `0 0 4px ${t.accent}`,
          pointerEvents: 'none',
        }}/>
      )}
    </div>
  );
}

function firstWord(title: string | undefined): string {
  if (!title) return 'sin nombre';
  const trimmed = title.trim();
  if (!trimmed) return 'sin nombre';
  const m = trimmed.match(/^\S+/);
  const word = m ? m[0] : trimmed;
  return word.slice(0, 8);
}

function DockIcon({
  bubble, index, active, onClick,
}: {
  bubble: Bubble;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  const [showTip, setShowTip] = useState(false);
  // Coordenadas absolutas para el tooltip (portal-based). Calculadas desde
  // el ref del wrapper al hacer hover — el portal queda en document.body
  // así no lo afecta el overflow:auto del scroll horizontal del dock.
  const wrapperRef = useRef<HTMLLIElement | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; bottom: number } | null>(null);
  // dragging: durante el drag suprimimos el tooltip y el onClick para no
  // navegar accidentalmente al soltar.
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const state = (bubble.status as AgentState) || 'idle';
  const busy = useBubbleBusy(bubble.id);
  const baseColor = stateColor(state, t);
  const sColor = busy ? t.ok : baseColor;
  const isActive = busy || state === 'thinking' || state === 'executing' || state === 'running';
  const initial = bubbleLetter(bubble.title);
  const accentColor = bubble.accent || t.accent;

  // Cuando se activa showTip, calculamos la posición fija desde el ref del
  // wrapper. Se actualiza si el dock se desplaza o el viewport cambia tamaño.
  useEffect(() => {
    if (!showTip || dragging) { setTipPos(null); return; }
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setTipPos({
        left: r.left + r.width / 2,
        bottom: window.innerHeight - r.top + 14,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showTip, dragging]);

  return (
    <Reorder.Item
      value={bubble}
      ref={wrapperRef}
      onDragStart={(e: PointerEvent | TouchEvent | MouseEvent) => {
        const p = 'clientX' in e ? { x: e.clientX, y: e.clientY }
          : 'touches' in e && e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: 0, y: 0 };
        dragStartRef.current = p;
        setDragging(true);
        setShowTip(false);
      }}
      onDragEnd={() => {
        setDragging(false);
        // Pequeño delay para que el click NO se dispare después de un drag.
        setTimeout(() => { dragStartRef.current = null; }, 50);
      }}
      onMouseEnter={() => {
        if (dragging) return;
        setHover(true);
        setTimeout(() => { if (!dragging) setShowTip(true); }, 220);
      }}
      onMouseLeave={() => { setHover(false); setShowTip(false); }}
      style={{
        width: SLOT_WIDTH, minHeight: SIZE,
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'flex-end',
        listStyle: 'none',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      whileDrag={{ zIndex: 200, scale: 1.1 }}
    >
      <motion.button
        type="button"
        onClick={(e) => {
          // Si veníamos de un drag, suprimir el click.
          if (dragStartRef.current) {
            const dx = Math.abs(e.clientX - dragStartRef.current.x);
            const dy = Math.abs(e.clientY - dragStartRef.current.y);
            if (dx > 4 || dy > 4) { e.preventDefault(); return; }
          }
          onClick();
        }}
        title={bubble.title || 'Burbuja sin título'}
        initial={{ opacity: 0, scale: 0.6, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.6, y: 8 }}
        whileHover={dragging ? undefined : { scale: 1.35, y: -6 }}
        whileTap={dragging ? undefined : { scale: 0.92 }}
        transition={{
          type: 'spring', stiffness: 380, damping: 22,
          delay: index * 0.02,
        }}
        style={{
          width: SIZE, height: SIZE,
          padding: 0, border: 0, cursor: dragging ? 'grabbing' : 'pointer',
          borderRadius: 11,
          background: active ? t.bg3 : (hover ? t.bg2 : 'rgba(255,255,255,0.04)'),
          color: active ? t.accent : t.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transformOrigin: 'bottom center',
          transition: 'background 140ms',
          boxShadow: active
            ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${t.accent}33`
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
        <span style={{
          fontFamily: t.fontSans, fontSize: 15, fontWeight: 600, letterSpacing: -0.3,
          color: active ? t.accent : accentColor,
        }}>{initial}</span>
        {isActive && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7, borderRadius: '50%',
            background: sColor,
            border: `1.5px solid ${t.glassBg}`,
            boxShadow: `0 0 6px ${sColor}`,
            animation: 'eco-shimmer 1.1s ease-in-out infinite',
          }}/>
        )}
      </motion.button>

      <div style={{
        marginTop: 3,
        width: SLOT_WIDTH,
        textAlign: 'center',
        fontFamily: t.fontSans, fontSize: 9.5, fontWeight: 600,
        color: active ? t.accent : t.text3,
        letterSpacing: 0.1,
        lineHeight: 1.1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>{firstWord(bubble.title)}</div>

      {active && (
        <span style={{
          position: 'absolute', bottom: -6, left: '50%',
          transform: 'translateX(-50%)',
          width: 4, height: 4, borderRadius: '50%',
          background: t.accent,
          boxShadow: `0 0 4px ${t.accent}`,
          pointerEvents: 'none',
        }}/>
      )}

      {/* Tooltip via PORTAL — queda fuera del scroll wrapper que tiene
          overflow:auto y se cortaba contra los bubbles vecinos. zIndex muy
          alto para que esté arriba de TODO. */}
      {hover && showTip && tipPos && !dragging && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              left: tipPos.left,
              bottom: tipPos.bottom,
              transform: 'translateX(-50%)',
              padding: '6px 10px', borderRadius: 8,
              background: t.bg1,
              border: `1px solid ${t.glassBorderHi}`,
              boxShadow: t.shadowLg,
              color: t.text0,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
              zIndex: 9999,
            }}>
            {bubble.title || 'Burbuja sin título'}
            {isActive && (
              <span style={{ marginLeft: 6, color: sColor, fontFamily: t.fontMono, fontSize: 10.5 }}>
                · {busy ? 'procesando' : state}
              </span>
            )}
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </Reorder.Item>
  );
}
