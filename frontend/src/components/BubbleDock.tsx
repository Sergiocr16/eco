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

// Dock estilo macOS — flotante en bottom-center, horizontal, con blur y
// magnificación que crece hacia arriba (sin empujar vecinos).
export function BubbleDock({ bubbles, activeBubbleId, onOpenAgent }: Props) {
  const t = useTokens();
  if (bubbles.length === 0) return null;

  const ordered = [...bubbles].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 28 }}
      style={{
        position: 'fixed',
        bottom: 14, left: '50%',
        transform: 'translateX(-50%)',
        // El dock pill: pequeño padding lateral, blur de cristal, border sutil.
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
        zIndex: 80,
        // overflow visible para que la magnificación se "escape" del pill.
        overflow: 'visible',
        // Max width — si hay muchas burbujas, scroll horizontal interno.
        maxWidth: '92vw',
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

const SIZE = 40;

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

  return (
    <div
      onMouseEnter={() => { setHover(true); setTimeout(() => setShowTip(true), 220); }}
      onMouseLeave={() => { setHover(false); setShowTip(false); }}
      style={{
        // Reservamos espacio fijo — el zoom transforma sin empujar vecinos.
        width: SIZE, minHeight: SIZE,
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        initial={{ opacity: 0, scale: 0.6, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.6, y: 8 }}
        whileHover={{ scale: 1.35, y: -6 }}
        whileTap={{ scale: 0.92 }}
        transition={{
          type: 'spring', stiffness: 380, damping: 22,
          delay: index * 0.02,
        }}
        style={{
          width: SIZE, height: SIZE,
          padding: 0, border: 0, cursor: 'pointer',
          borderRadius: 11,
          background: active ? t.bg3 : (hover ? t.bg2 : 'rgba(255,255,255,0.04)'),
          color: active ? t.accent : t.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          // Magnificación hacia arriba (bottom origin) — estilo dock macOS.
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
        {/* Status dot esquina superior derecha */}
        {(isActive || bubble.ptyOpen) && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7, borderRadius: '50%',
            background: isActive ? sColor : t.accent,
            border: `1.5px solid ${t.glassBg}`,
            boxShadow: `0 0 6px ${isActive ? sColor : t.accent}`,
            animation: isActive ? 'eco-shimmer 1.1s ease-in-out infinite' : 'none',
          }}/>
        )}
      </motion.button>

      {/* Dot indicador "abierta" abajo del ícono — convención macOS. */}
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

      {/* Tooltip arriba */}
      <AnimatePresence>
        {hover && showTip && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{
              position: 'absolute', bottom: 'calc(100% + 18px)', left: '50%',
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
