import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, MoreHorizontal, Pencil } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Bubble as BubbleType, Message } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

type BubbleCardProps = {
  bubble: BubbleType;
  active: boolean;
  onFocus: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => void;
};

export function BubbleCard({ bubble, active, onFocus, onClose, onTogglePin, onRename }: BubbleCardProps) {
  const [renaming, setRenaming] = useState(false);
  const lastMsg = bubble.messages[bubble.messages.length - 1];
  const preview = lastMsg?.text?.slice(0, 90) ?? '';

  return (
    <motion.div
      layout
      onClick={onFocus}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, scale: 0.96 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: active ? 1 : 1.015 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "group relative cursor-pointer rounded-[18px] overflow-hidden",
        "transition-shadow duration-500",
        active ? "ring-1 ring-white/15" : "",
      )}
      style={{
        background: active
          ? 'rgba(255,255,255,0.045)'
          : 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        boxShadow: active
          ? `inset 0 0 0 1px ${bubble.accent}40, inset 0 1px 0 ${bubble.accent}30, 0 8px 32px -10px rgba(0,0,0,0.5), 0 0 24px -8px ${bubble.accent}25`
          : 'inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 20px -8px rgba(0,0,0,0.4)',
      }}
    >
      {/* Accent gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(80% 60% at 0% 0%, ${bubble.accent}18, transparent 70%)`,
        }}
      />

      <div className="relative p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: bubble.accent }}
          />
          {renaming ? (
            <input
              autoFocus
              defaultValue={bubble.title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { onRename(e.target.value); setRenaming(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onRename((e.target as HTMLInputElement).value); setRenaming(false); }
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-eco-text tracking-tight"
            />
          ) : (
            <span className="text-[13px] text-eco-text font-medium tracking-tight truncate flex-1">
              {bubble.title}
            </span>
          )}
          {bubble.pinned && <Pin size={9} strokeWidth={2} className="text-eco-text-faint shrink-0" />}
          {bubble.unread > 0 && !active && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full shrink-0" style={{ background: bubble.accent }} />
          )}
        </div>

        {preview && (
          <p className="text-[11px] text-eco-text-faint leading-relaxed line-clamp-2 tracking-tight">
            {preview}
          </p>
        )}

        <div className="flex items-center justify-between mt-1 opacity-60">
          <span className="text-[9.5px] text-eco-text-faint font-mono tracking-wider uppercase">
            {bubble.messages.length} msg
            {bubble.status === 'thinking' && ' · pensando'}
            {bubble.status === 'executing' && ' · ejecutando'}
          </span>
          <BubbleMenu
            pinned={bubble.pinned}
            onTogglePin={onTogglePin}
            onRename={() => setRenaming(true)}
            onClose={onClose}
          />
        </div>
      </div>

      {/* Animated status bar (when thinking/executing) */}
      <AnimatePresence>
        {bubble.status !== 'idle' && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 h-[1.5px] origin-left"
            style={{ background: bubble.accent }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BubbleMenu({
  pinned, onTogglePin, onRename, onClose,
}: {
  pinned: boolean;
  onTogglePin: () => void;
  onRename: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded-full flex items-center justify-center hover:bg-white/[0.06] transition-all"
        aria-label="Acciones"
      >
        <MoreHorizontal size={10} strokeWidth={1.8} className="text-eco-text-faint" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-6 z-20 min-w-[140px] rounded-lg p-1 flex flex-col"
            style={{
              background: 'rgba(20, 20, 28, 0.95)',
              backdropFilter: 'blur(28px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 10px 30px -10px rgba(0,0,0,0.6)',
            }}
          >
            <button onClick={() => { onRename(); setOpen(false); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-[12px] text-eco-text-muted tracking-tight">
              <Pencil size={10} strokeWidth={1.6} />Renombrar
            </button>
            <button onClick={() => { onTogglePin(); setOpen(false); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] text-[12px] text-eco-text-muted tracking-tight">
              {pinned ? <PinOff size={10} strokeWidth={1.6} /> : <Pin size={10} strokeWidth={1.6} />}
              {pinned ? 'Despinear' : 'Pinear'}
            </button>
            <button onClick={() => { onClose(); setOpen(false); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--color-status-error)]/15 text-[12px] text-status-error tracking-tight">
              <X size={10} strokeWidth={1.6} />Cerrar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type StageProps = {
  bubble: BubbleType;
  emptyHint: string;
};

export function BubbleStage({ bubble, emptyHint }: StageProps) {
  return (
    <div className="relative h-full flex flex-col">
      <StageHeader bubble={bubble} />
      <div className="flex-1 overflow-y-auto invisible-scroll px-6 pb-6">
        <Conversation bubble={bubble} emptyHint={emptyHint} />
      </div>
    </div>
  );
}

function StageHeader({ bubble }: { bubble: BubbleType }) {
  return (
    <motion.div
      key={bubble.id}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 px-6 py-4"
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{
          background: bubble.accent,
          boxShadow: `0 0 12px ${bubble.accent}`,
        }}
      />
      <span className="text-display text-[15px] text-eco-text tracking-tight truncate">
        {bubble.title}
      </span>
      {bubble.workspace && (
        <span className="text-[10.5px] text-eco-text-faint font-mono tracking-wider truncate ml-2">
          {bubble.workspace.split('/').filter(Boolean).slice(-2).join('/')}
        </span>
      )}
      <span className="ml-auto text-[10px] text-eco-text-faint font-mono uppercase tracking-wider">
        {bubble.messages.length} mensajes
      </span>
    </motion.div>
  );
}

function Conversation({ bubble, emptyHint }: { bubble: BubbleType; emptyHint: string }) {
  if (bubble.messages.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="flex flex-col items-center justify-center h-full text-center"
      >
        <p className="text-eco-text-muted text-[14px] tracking-tight max-w-md">
          {emptyHint}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto pt-2">
      {bubble.messages.map((m: Message, i: number) => (
        <MessageBubble key={m.id} message={m} index={i} />
      ))}
    </div>
  );
}
