import { motion } from 'motion/react';
import type { Message } from '@/lib/types';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '@/lib/cn';

export function MessageBubble({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: index * 0.06 }}
      className={cn(
        "flex flex-col gap-2.5 max-w-[78%]",
        isUser ? "self-end items-end" : "self-start items-start",
      )}
    >
      {message.text && (
        <div
          className={cn(
            "px-5 py-3 rounded-[var(--radius-bubble)]",
            isUser ? "bubble-user" : "bubble-assistant",
          )}
        >
          <p
            className={cn(
              "text-[14.5px] leading-relaxed",
              "text-eco-text tracking-[-0.005em]",
            )}
            style={{
              fontFamily: 'var(--font-text)',
              fontWeight: 400,
            }}
          >
            {message.text}
          </p>
        </div>
      )}

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1.5 w-full min-w-[280px]">
          {message.toolCalls.map((tc, i) => (
            <ToolCallCard key={tc.id} call={tc} delay={i * 0.05} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
