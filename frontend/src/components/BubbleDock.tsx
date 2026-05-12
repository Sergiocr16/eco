import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import { stateColor, type AgentState } from '@/design/tokens';
import type { Bubble } from '@/lib/types';
import { bubbleLetter } from '@/design/primitives';

type Props = {
  bubbles: Bubble[];
  activeBubbleId: string | null;
  onOpenAgent: (id: string) => void;
};

// Dock vertical en el sidebar de 64px. Estilo macOS — íconos rounded square,
// zoom solo en el ítem hovered (no propaga a vecinos), transform origin a la
// izquierda para que crezca hacia el canvas y no contra el borde.
export function BubbleDock({ bubbles, activeBubbleId, onOpenAgent }: Props) {
  if (bubbles.length === 0) return null;

  const ordered = [...bubbles].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 28 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '4px 0',
        width: '100%',
        overflow: 'visible',
      }}>
      <AnimatePresence initial={false}>
        {ordered.map((b, i) => (
          <DockIcon
            key={b.id}
            bubble={b}
            index={i}
            active={b.id === activeBubbleId}
            onClick={() => onOpenAgent(b.id)}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

const SIZE = 36;

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

  const state = (bubble.status as AgentState) || 'idle';
  const sColor = stateColor(state, t);
  const isActive = state === 'thinking' || state === 'executing' || state === 'running';
  const initial = bubbleLetter(bubble.title);
  const bgAccent = bubble.accent || t.bg3;

  return (
    <div
      onMouseEnter={() => { setHover(true); setTimeout(() => setShowTip(true), 220); }}
      onMouseLeave={() => { setHover(false); setShowTip(false); }}
      style={{
        // Reservamos exactamente SIZE para que el zoom (vía transform) no
        // empuje a los vecinos ni provoque scroll.
        width: SIZE, height: SIZE,
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        initial={{ opacity: 0, scale: 0.6, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.6, y: 8 }}
        whileHover={{ scale: 1.45 }}
        whileTap={{ scale: 0.92 }}
        transition={{
          type: 'spring', stiffness: 380, damping: 26,
          delay: index * 0.02,
        }}
        style={{
          width: SIZE, height: SIZE,
          padding: 0, border: 0, cursor: 'pointer',
          borderRadius: 10,
          background: bgAccent,
          color: t.text0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
          // Crece hacia la derecha (no contra el borde de la app).
          transformOrigin: 'left center',
          boxShadow: active
            ? `0 6px 18px color-mix(in oklch, ${t.accent} 35%, transparent), 0 0 0 1.5px ${t.accent} inset`
            : hover
              ? `0 8px 22px rgba(0,0,0,0.35), 0 1px 1px rgba(255,255,255,0.08) inset`
              : `0 3px 10px rgba(0,0,0,0.22), 0 1px 1px rgba(255,255,255,0.06) inset, 0 0 0 0.5px ${t.glassBorder} inset`,
        }}>
        {/* Highlight superior para look de ícono macOS */}
        <span style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 50%)',
          pointerEvents: 'none',
        }}/>
        <span style={{
          fontFamily: t.fontSans, fontSize: 14, fontWeight: 600, letterSpacing: -0.4,
          color: t.text0, position: 'relative',
        }}>{initial}</span>
        {/* Status dot esquina superior derecha */}
        {(isActive || bubble.ptyOpen) && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            width: 6, height: 6, borderRadius: '50%',
            background: isActive ? sColor : t.accent,
            boxShadow: `0 0 6px ${isActive ? sColor : t.accent}`,
            animation: isActive ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
          }}/>
        )}
      </motion.button>

      {/* Indicador "conectado a Eco" — dot accent al costado derecho del slot */}
      {isActive && (
        <span style={{
          position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)',
          width: 4, height: 4, borderRadius: '50%', background: t.accent,
          boxShadow: `0 0 5px ${t.accent}`,
          pointerEvents: 'none',
        }}/>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {hover && showTip && (
          <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.95 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{
              position: 'absolute', left: 'calc(100% + 22px)', top: '50%',
              transform: 'translateY(-50%)',
              padding: '6px 10px', borderRadius: 8,
              background: t.bg1,
              border: `1px solid ${t.glassBorderHi}`,
              boxShadow: t.shadowLg,
              color: t.text0,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
              zIndex: 100,
            }}>
            {bubble.title || 'Burbuja sin título'}
            {isActive && (
              <span style={{ marginLeft: 6, color: sColor, fontFamily: t.fontMono, fontSize: 10.5 }}>
                · {state}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
