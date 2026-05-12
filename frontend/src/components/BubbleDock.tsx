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

const SIZE = 44;

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
  const accentColor = bubble.accent || t.accent;

  // Recortamos el título para mostrar bajo el ícono (máx ~7 chars, palabras enteras si caben).
  const shortLabel = (() => {
    const title = (bubble.title ?? '').trim();
    if (!title) return '';
    if (title.length <= 7) return title;
    const firstWord = title.split(/\s+/)[0] ?? title;
    if (firstWord.length <= 7) return firstWord;
    return firstWord.slice(0, 6) + '…';
  })();

  return (
    <div
      onMouseEnter={() => { setHover(true); setTimeout(() => setShowTip(true), 220); }}
      onMouseLeave={() => { setHover(false); setShowTip(false); }}
      style={{
        // Reservamos espacio para ícono + label. El zoom transforma sin empujar vecinos.
        width: SIZE + 8, minHeight: SIZE + 14,
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        gap: 1,
      }}
    >
      {/* Barra accent a la izquierda cuando active — mismo look que los nav icons */}
      {active && (
        <span style={{
          position: 'absolute', left: -8, top: SIZE / 2 - 10, // alineado al centro del ícono
          width: 3, height: 20, borderRadius: 999, background: t.accent,
          pointerEvents: 'none', zIndex: 1,
        }}/>
      )}
      <motion.button
        type="button"
        onClick={onClick}
        initial={{ opacity: 0, scale: 0.6, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.6, y: 8 }}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.92 }}
        transition={{
          type: 'spring', stiffness: 380, damping: 26,
          delay: index * 0.02,
        }}
        style={{
          width: SIZE, height: SIZE,
          padding: 0, border: 0, cursor: 'pointer',
          borderRadius: 12,
          background: active ? t.bg3 : (hover ? t.bg2 : 'transparent'),
          color: active ? t.accent : t.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transformOrigin: 'left center',
          transition: 'background 140ms',
        }}>
        <span style={{
          fontFamily: t.fontSans, fontSize: 16, fontWeight: 600, letterSpacing: -0.3,
          // Color de la inicial = accent del agente, así cada uno se diferencia.
          color: active ? t.accent : accentColor,
        }}>{initial}</span>
        {/* Status dot esquina superior derecha */}
        {(isActive || bubble.ptyOpen) && (
          <span style={{
            position: 'absolute', top: 6, right: 6,
            width: 7, height: 7, borderRadius: '50%',
            background: isActive ? sColor : t.accent,
            border: `1.5px solid ${t.windowBg}`,
            boxShadow: `0 0 6px ${isActive ? sColor : t.accent}`,
            animation: isActive ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
          }}/>
        )}
      </motion.button>

      {/* Label corto debajo del ícono — primera palabra del título o "Xxx…" */}
      <span style={{
        maxWidth: SIZE + 4,
        fontFamily: t.fontSans, fontSize: 9, fontWeight: 500,
        color: active ? t.accent : t.text3,
        textAlign: 'center',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        pointerEvents: 'none',
        letterSpacing: -0.1,
        lineHeight: 1.1,
      }}>{shortLabel}</span>

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
