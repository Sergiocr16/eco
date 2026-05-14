import { Fragment, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

// Dock estilo macOS — flotante en bottom-center, horizontal, con blur y
// magnificación que crece hacia arriba (sin empujar vecinos).
export function BubbleDock({ bubbles, activeBubbleId, onOpenAgent, onGoHome, atHome }: Props) {
  const t = useTokens();
  // Mostramos el dock si hay agentes O si hay home button (para navegar
  // siempre desde cualquier vista).
  if (bubbles.length === 0 && !onGoHome) return null;

  const sortFn = (a: Bubble, b: Bubble) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  };
  const ordered = [...bubbles].sort(sortFn);

  // Si hay más de un workspace en uso, agrupamos los iconos del dock por
  // carpeta — clusters separados por un divisor. Con una sola carpeta es una
  // lista plana (un divisor sería ruido).
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
      items: [...items].sort(sortFn),
    }));
  })();
  const grouped = wsGroups.length > 1;

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
        // El sidebar izquierdo ocupa 64px fijos. Para centrar el dock en el
        // ÁREA DE CONTENIDO (no en el viewport completo), arrancamos en 64px
        // del borde izquierdo y centramos respecto al espacio restante.
        bottom: 14,
        left: 64,
        right: 0,
        // Centrado respecto al área de contenido — flexbox del contenedor
        // posiciona el pill al centro. Pointer-events none en el contenedor
        // para no bloquear clicks fuera del pill; auto en el pill mismo.
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 80,
      }}>
      <div style={{
        // El pill real — auto pointer-events.
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
        // overflow visible para que la magnificación se "escape" del pill.
        overflow: 'visible',
        // Max width — si hay muchas burbujas, scroll horizontal interno.
        maxWidth: 'calc(100vw - 96px)',
      }}>
        {onGoHome && (
          <>
            <HomeDockIcon active={!!atHome} onClick={onGoHome}/>
            {bubbles.length > 0 && divider}
          </>
        )}
        {/* Wrapper scrolleable — con muchos agentes los iconos se salían del
            pill. `overflowX:auto` les da scroll horizontal. El padding/margin
            negativo da headroom para que la magnificación (que crece hacia
            arriba) y el dot inferior no queden recortados por el overflow. */}
        <div
          className="eco-thin-scroll"
          style={{
            minWidth: 0,
            display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 4,
            overflowX: 'auto', overflowY: 'hidden',
            paddingTop: 22, paddingBottom: 8,
            marginTop: -22, marginBottom: -8,
          }}>
        {grouped ? (
          wsGroups.map((g, gi) => (
            <Fragment key={g.key}>
              {gi > 0 && divider}
              {/* Cluster del workspace — etiqueta de la carpeta arriba +
                  fila de iconos abajo, así se entiende de qué proyecto es. */}
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
                <div style={{
                  display: 'flex', flexDirection: 'row',
                  alignItems: 'flex-end', gap: 4,
                }}>
                  <AnimatePresence initial={false}>
                    {g.items.map((b, i) => (
                      <DockIcon
                        key={b.id}
                        bubble={b}
                        index={i}
                        active={b.id === activeBubbleId}
                        onClick={() => onOpenAgent(b.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </Fragment>
          ))
        ) : (
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
        )}
        </div>
      </div>
    </motion.div>
  );
}

const SIZE = 40;        // Icono cuadrado
const SLOT_WIDTH = 60;  // Ancho del slot (icono + padding para que el label
                        // de hasta 8 chars quepa sin empujar a los vecinos).

function HomeDockIcon({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useTokens();
  const [hover, setHover] = useState(false);
  // Slot un poco más angosto que los de las burbujas (no necesita 60px de label).
  // Mantiene el alto del slot igual que los demás (button + label combined ≈ 54px)
  // y centra el botón verticalmente en ese espacio.
  const HOME_SLOT = 48;
  const SLOT_HEIGHT = SIZE + 17; // 40 + (3 margin + ~14 label) ≈ alto del slot de burbujas
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
        {/* Icono ⌘ command — minimalista y reconocible para "ir al inicio".
            Hereda color del botón (accent cuando activo, text2 cuando no). */}
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

// Primera palabra del título, cortada a 8 chars. Solo separa por
// espacios — "fix-bug-login" se muestra como "fix-bug-" (los primeros 8
// chars de la primera "palabra"), no como "fix". Eso preserva contexto
// útil para títulos tipo TAR-660, jh-prod, eco-test, etc.
function firstWord(title: string | undefined): string {
  if (!title) return 'sin nombre';
  const trimmed = title.trim();
  if (!trimmed) return 'sin nombre';
  // Cortamos solo en el primer espacio — guiones/underscores forman parte
  // del nombre.
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

  const state = (bubble.status as AgentState) || 'idle';
  const busy = useBubbleBusy(bubble.id);
  const baseColor = stateColor(state, t);
  // PTY procesando = listo cuando termine. Pintamos el dot en verde (t.ok)
  // para diferenciarlo del estado de Claude SDK (sColor) y conectar con el
  // mismo color que usa el satélite "Terminal" en la vista de nodos.
  const sColor = busy ? t.ok : baseColor;
  const isActive = busy || state === 'thinking' || state === 'executing' || state === 'running';
  const initial = bubbleLetter(bubble.title);
  const accentColor = bubble.accent || t.accent;

  return (
    <div
      onMouseEnter={() => { setHover(true); setTimeout(() => setShowTip(true), 220); }}
      onMouseLeave={() => { setHover(false); setShowTip(false); }}
      style={{
        // Slot más ancho que el icono para que el label debajo (hasta 8 chars)
        // quepa sin empujar/solapar los vecinos. El zoom del icono al hover
        // transforma sin afectar el layout.
        width: SLOT_WIDTH, minHeight: SIZE,
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        title={bubble.title || 'Burbuja sin título'}
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
        {/* Dot solo cuando Claude está procesando — un PTY abierto solo no
            cuenta como "activo". */}
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

      {/* Label corto debajo del ícono — primera palabra (hasta 8 chars).
          Usa todo el ancho del slot para que se vea bien. */}
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

      {/* Dot indicador "abierta" debajo del label — convención macOS. */}
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
                · {busy ? 'procesando' : state}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
