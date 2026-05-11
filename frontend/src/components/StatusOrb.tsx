import { motion } from 'motion/react';
import type { EcoStatus } from '@/lib/types';
import { cn } from '@/lib/cn';

const STATUS_LABELS: Record<EcoStatus, string> = {
  idle: "Listo · decí «Eco» para empezar",
  listening: "Escuchando…",
  thinking: "Pensando…",
  executing: "Ejecutando…",
  speaking: "Hablando…",
  error: "Algo salió mal",
};

const STATUS_GLOW: Record<EcoStatus, string> = {
  idle: 'glow-idle',
  listening: 'glow-listening',
  thinking: 'glow-thinking',
  executing: 'glow-executing',
  speaking: 'glow-thinking',
  error: 'glow-listening',
};

const STATUS_DOT: Record<EcoStatus, string> = {
  idle: 'bg-[var(--color-status-idle)]',
  listening: 'bg-[var(--color-status-listening)]',
  thinking: 'bg-[var(--color-status-thinking)]',
  executing: 'bg-[var(--color-status-executing)]',
  speaking: 'bg-[var(--color-status-thinking)]',
  error: 'bg-[var(--color-status-error)]',
};

export function StatusOrb({ status }: { status: EcoStatus }) {
  return (
    <div className="flex flex-col items-center gap-7 select-none">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        {/* Outer orbital ring */}
        <div
          className="absolute inset-0 rounded-full opacity-60"
          style={{
            background:
              'conic-gradient(from 0deg, transparent, oklch(0.78 0.14 80 / 0.6), transparent 60%)',
            animation: 'breathing 9s ease-in-out infinite',
            filter: 'blur(8px)',
          }}
        />
        {/* Glass orb */}
        <div
          className={cn(
            'relative h-[160px] w-[160px] rounded-full glass',
            STATUS_GLOW[status],
          )}
          style={{
            background:
              'radial-gradient(circle at 30% 25%, oklch(1 0 0 / 0.18), oklch(1 0 0 / 0.04) 40%, oklch(0.6 0.18 280 / 0.12) 100%)',
            transition: 'box-shadow 1.2s var(--ease-glass)',
          }}
        >
          {/* Inner shimmer dome */}
          <div
            className="absolute inset-3 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, oklch(1 0 0 / 0.32), transparent 50%)',
              animation: 'breathing 6s ease-in-out infinite',
            }}
          />
          {/* Core */}
          <div
            className="absolute inset-[28%] rounded-full"
            style={{
              background:
                'radial-gradient(circle, oklch(0.85 0.16 80 / 0.5), oklch(0.4 0.2 280 / 0.25) 70%)',
              filter: 'blur(4px)',
              animation: 'breathing 4.5s ease-in-out infinite',
            }}
          />
        </div>
      </motion.div>

      <motion.div
        key={status}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-3"
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])}
          style={{ animation: 'pulse-dot 1.6s ease-in-out infinite' }}
        />
        <span className="text-eco-text-muted text-[13.5px] tracking-tight">
          {STATUS_LABELS[status]}
        </span>
      </motion.div>
    </div>
  );
}
