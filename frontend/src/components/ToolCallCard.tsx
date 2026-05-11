import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, Pencil, Search, FolderTree, ListTree, Globe,
  Loader, CheckCircle2, XCircle, ChevronDown, FileCode,
  Terminal, type LucideIcon,
} from 'lucide-react';
import type { ToolCall } from '@/lib/types';
import { cn } from '@/lib/cn';

const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileText,
  Write: Pencil,
  Edit: Pencil,
  MultiEdit: Pencil,
  NotebookEdit: FileCode,
  Grep: Search,
  Glob: FolderTree,
  LS: ListTree,
  WebFetch: Globe,
  WebSearch: Globe,
  Bash: Terminal,
  TodoWrite: ListTree,
};

function summarize(input: Record<string, unknown>): string {
  if (input.file_path) return String(input.file_path);
  if (input.path) return String(input.path);
  if (input.pattern) return String(input.pattern);
  if (input.command) return String(input.command).slice(0, 70);
  if (input.query) return String(input.query);
  if (input.url) return String(input.url);
  const k = Object.keys(input)[0];
  return k ? `${k}: ${String(input[k]).slice(0, 40)}` : '';
}

export function ToolCallCard({ call, delay = 0 }: { call: ToolCall; delay?: number }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[call.name] ?? FileText;
  const summary = summarize(call.input);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay }}
      className="glass-soft rounded-[var(--radius-card)] overflow-hidden"
    >
      <button
        onClick={() => call.output && setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          call.output && "hover:bg-white/[0.025] cursor-pointer",
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] shrink-0">
          <Icon size={14} strokeWidth={1.5} className="text-eco-text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-eco-text text-[13px] font-medium tracking-tight">
              {call.name}
            </span>
            {summary && (
              <span className="text-eco-text-faint text-[12px] font-mono truncate">
                {summary}
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={call.status} />
        {call.output && (
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <ChevronDown size={14} strokeWidth={1.5} className="text-eco-text-faint" />
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {open && call.output && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-4 py-3">
              <pre className="text-[11.5px] leading-relaxed font-mono text-eco-text-muted whitespace-pre-wrap break-words max-h-64 overflow-auto invisible-scroll">
                {call.output}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: ToolCall['status'] }) {
  if (status === 'running') {
    return <Loader size={13} strokeWidth={1.8} className="text-status-thinking animate-spin shrink-0" />;
  }
  if (status === 'success') {
    return <CheckCircle2 size={13} strokeWidth={1.8} className="text-status-executing shrink-0" />;
  }
  if (status === 'denied' || status === 'error') {
    return <XCircle size={13} strokeWidth={1.8} className="text-status-error shrink-0" />;
  }
  return null;
}
