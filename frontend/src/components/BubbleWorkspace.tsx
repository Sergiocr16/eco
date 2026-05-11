import { motion, AnimatePresence } from 'motion/react';
import { Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { BubbleCard, BubbleStage } from './Bubble';
import type { Bubble } from '@/lib/types';

type Props = {
  bubbles: Bubble[];
  activeBubble: Bubble | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCreate: () => void;
};

export function BubbleWorkspace({
  bubbles, activeBubble, onFocus, onClose, onTogglePin, onRename, onCreate,
}: Props) {
  const [stackCollapsed, setStackCollapsed] = useState(false);

  const sorted = [...bubbles].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="relative h-full flex">
      <motion.aside
        animate={{ width: stackCollapsed ? 56 : 248 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative h-full shrink-0 flex flex-col gap-2 px-3 py-4 z-10"
      >
        <button
          onClick={() => setStackCollapsed((c) => !c)}
          className="absolute -right-3 top-6 h-6 w-6 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-md transition-colors z-20"
          aria-label={stackCollapsed ? 'Expandir' : 'Colapsar'}
        >
          {stackCollapsed
            ? <PanelLeftOpen size={11} strokeWidth={1.8} className="text-eco-text-faint" />
            : <PanelLeftClose size={11} strokeWidth={1.8} className="text-eco-text-faint" />}
        </button>

        <button
          onClick={onCreate}
          className="group flex items-center gap-2 px-3 py-2.5 rounded-[14px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all"
        >
          <Plus size={13} strokeWidth={2} className="text-eco-text-muted group-hover:text-eco-text shrink-0 transition-colors" />
          <AnimatePresence>
            {!stackCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                className="text-[12px] text-eco-text-muted tracking-tight whitespace-nowrap"
              >
                Nueva burbuja
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <div className="flex flex-col gap-2 overflow-y-auto invisible-scroll mt-1 pr-1">
          <AnimatePresence>
            {stackCollapsed
              ? sorted.map((b) => (
                  <CollapsedCard
                    key={b.id}
                    bubble={b}
                    active={b.id === activeBubble?.id}
                    onClick={() => onFocus(b.id)}
                  />
                ))
              : sorted.map((b) => (
                  <BubbleCard
                    key={b.id}
                    bubble={b}
                    active={b.id === activeBubble?.id}
                    onFocus={() => onFocus(b.id)}
                    onClose={() => onClose(b.id)}
                    onTogglePin={() => onTogglePin(b.id)}
                    onRename={(t) => onRename(b.id, t)}
                  />
                ))}
          </AnimatePresence>
        </div>
      </motion.aside>

      <div className="flex-1 min-w-0 relative">
        <AnimatePresence mode="wait">
          {activeBubble && (
            <motion.div
              key={activeBubble.id}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <BubbleStage
                bubble={activeBubble}
                emptyHint={`Empezá «${activeBubble.title}» escribiendo abajo o diciendo «Eco».`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CollapsedCard({
  bubble, active, onClick,
}: {
  bubble: Bubble;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      className="relative h-8 w-8 rounded-full flex items-center justify-center mx-auto transition-all"
      style={{
        background: active ? `${bubble.accent}25` : 'rgba(255,255,255,0.04)',
        boxShadow: active
          ? `inset 0 0 0 1px ${bubble.accent}80, 0 0 12px ${bubble.accent}40`
          : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
      title={bubble.title}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: bubble.accent }}
      />
      {bubble.unread > 0 && !active && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
          style={{ background: bubble.accent, boxShadow: `0 0 6px ${bubble.accent}` }}
        />
      )}
    </motion.button>
  );
}
