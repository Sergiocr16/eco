import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookMarked, Sparkles, Terminal, User } from 'lucide-react';
import { filterSkills, type SkillInfo } from '@/hooks/useSkills';
import { cn } from '@/lib/cn';

type Props = {
  skills: SkillInfo[];
  query: string;
  onSelect: (skill: SkillInfo) => void;
  open: boolean;
};

const KIND_ICON = {
  skill: BookMarked,
  command: Terminal,
  agent: Sparkles,
} as const;

export function SkillAutocomplete({ skills, query, onSelect, open }: Props) {
  const filtered = filterSkills(skills, query, 10);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setActiveIndex(0); }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length === 0) return;
        const target = filtered[activeIndex];
        if (target) {
          e.preventDefault();
          onSelect(target);
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, activeIndex, onSelect]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {open && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="absolute bottom-full left-0 right-0 mb-2 rounded-[16px] overflow-hidden"
          style={{
            background: 'rgba(15, 15, 22, 0.95)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 20px 50px -10px rgba(0,0,0,0.6)',
          }}
        >
          <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
            <span className="text-[10.5px] uppercase tracking-wider text-eco-text-faint font-mono">
              Skills · {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            </span>
            <span className="text-[10px] text-eco-text-faint font-mono">
              ↑↓ navegar · ⏎ usar · esc cancelar
            </span>
          </div>
          <div ref={listRef} className="max-h-[300px] overflow-y-auto invisible-scroll p-1">
            {filtered.map((s, i) => (
              <Item
                key={s.path}
                skill={s}
                active={i === activeIndex}
                index={i}
                onClick={() => onSelect(s)}
                onHover={() => setActiveIndex(i)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Item({
  skill, active, index, onClick, onHover,
}: {
  skill: SkillInfo;
  active: boolean;
  index: number;
  onClick: () => void;
  onHover: () => void;
}) {
  const Icon = KIND_ICON[skill.kind];
  const sourceLabel = skill.kind === 'agent'
    ? 'agent'
    : skill.kind === 'command'
      ? 'command'
      : 'skill';
  const sourceColor = skill.kind === 'skill'
    ? 'var(--color-eco-accent)'
    : skill.kind === 'command'
      ? 'oklch(0.74 0.16 200)'
      : 'oklch(0.7 0.16 320)';

  return (
    <button
      type="button"
      data-idx={index}
      onClick={onClick}
      onMouseEnter={onHover}
      className={cn(
        "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left",
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
      )}
    >
      <div
        className="flex h-6 w-6 items-center justify-center rounded-md shrink-0 mt-0.5"
        style={{ background: `${sourceColor}18`, color: sourceColor }}
      >
        <Icon size={11} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-eco-text font-medium tracking-tight font-mono">
            /{skill.name}
          </span>
          <span className="text-[9.5px] uppercase tracking-wider font-mono" style={{ color: sourceColor }}>
            {sourceLabel}
          </span>
          {skill.plugin && (
            <span className="text-[9.5px] text-eco-text-faint font-mono">
              · {skill.plugin}
            </span>
          )}
          {skill.source === 'user' && !skill.plugin && (
            <span className="flex items-center gap-1 text-[9.5px] text-eco-text-faint font-mono">
              <User size={8} strokeWidth={2} /> tuyo
            </span>
          )}
        </div>
        {skill.description && (
          <p className="text-[11px] text-eco-text-muted leading-snug mt-0.5 line-clamp-2">
            {skill.description}
          </p>
        )}
      </div>
    </button>
  );
}
