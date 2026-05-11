import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Mic, FolderOpen, ArrowUp, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/cn';

type Props = {
  workspace: string;
  listening: boolean;
  interimText?: string;
  voiceError?: string | null;
  voiceUnsupported?: boolean;
  ttsEnabled?: boolean;
  ttsSupported?: boolean;
  ttsSpeaking?: boolean;
  onTtsToggle?: () => void;
  onSend: (text: string) => void;
  onMicToggle: () => void;
  onWorkspaceClick: () => void;
};

export function InputBar({
  workspace,
  listening,
  interimText = '',
  voiceError,
  voiceUnsupported,
  ttsEnabled = false,
  ttsSupported = true,
  ttsSpeaking = false,
  onTtsToggle,
  onSend,
  onMicToggle,
  onWorkspaceClick,
}: Props) {
  const [text, setText] = useState('');
  const displayValue = interimText || text;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  const workspaceLabel = workspace.split('/').filter(Boolean).slice(-2).join('/');

  const placeholder = voiceUnsupported
    ? 'Tu navegador no soporta voz · escribí acá'
    : voiceError
      ? voiceError
      : listening
        ? 'Escuchando · decí «Eco» seguido del comando…'
        : 'Escribí o decí «Eco»…';

  return (
    <div className="absolute bottom-0 inset-x-0 z-20 px-6 pb-5 pt-2">
      <motion.form
        onSubmit={handleSubmit}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        className="glass-strong rounded-[20px] flex items-center gap-2.5 pl-2.5 pr-2.5 py-2.5"
      >
        <MicButton listening={listening} onClick={onMicToggle} />

        <input
          value={displayValue}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          readOnly={!!interimText}
          className="flex-1 bg-transparent outline-none text-[14.5px] text-eco-text placeholder:text-eco-text-faint tracking-tight"
          style={{ fontFamily: 'var(--font-text)' }}
          autoFocus
        />

        {ttsSupported && (
          <button
            type="button"
            onClick={onTtsToggle}
            title={ttsEnabled ? 'Voz activada · Eco te habla' : 'Voz desactivada'}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-all",
              ttsEnabled
                ? "bg-[var(--color-eco-accent)]/20 hover:bg-[var(--color-eco-accent)]/30"
                : "bg-white/[0.04] hover:bg-white/[0.08]",
            )}
            aria-label={ttsEnabled ? 'Desactivar voz' : 'Activar voz'}
          >
            {ttsEnabled ? (
              <Volume2
                size={13}
                strokeWidth={1.6}
                className={cn(
                  "text-[var(--color-eco-accent)]",
                  ttsSpeaking && "animate-pulse",
                )}
              />
            ) : (
              <VolumeX size={13} strokeWidth={1.6} className="text-eco-text-faint" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onWorkspaceClick}
          className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
        >
          <FolderOpen size={12} strokeWidth={1.5} className="text-eco-text-faint group-hover:text-eco-text-muted transition-colors" />
          <span className="text-[12px] text-eco-text-muted font-mono tracking-tight max-w-[180px] truncate">
            {workspaceLabel || 'workspace'}
          </span>
        </button>

        <SendButton hasText={text.trim().length > 0} />
      </motion.form>
    </div>
  );
}

function MicButton({ listening, onClick }: { listening: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-500",
        listening
          ? "bg-[var(--color-status-listening)]/30"
          : "bg-white/[0.06] hover:bg-white/[0.1]",
      )}
      aria-label={listening ? 'Detener escucha' : 'Escuchar'}
    >
      {listening && (
        <>
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'var(--color-status-listening)',
              filter: 'blur(12px)',
              opacity: 0.35,
              animation: 'breathing 2.4s ease-in-out infinite',
            }}
          />
          <span
            className="absolute inset-0 rounded-full ring-1 ring-[var(--color-status-listening)]/40"
            style={{ animation: 'breathing 1.6s ease-in-out infinite' }}
          />
        </>
      )}
      <Mic
        size={16}
        strokeWidth={1.5}
        className={cn(
          "relative z-10 transition-colors",
          listening ? "text-white" : "text-eco-text-muted",
        )}
      />
    </button>
  );
}

function SendButton({ hasText }: { hasText: boolean }) {
  return (
    <button
      type="submit"
      disabled={!hasText}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300",
        hasText
          ? "bg-[var(--color-eco-accent)]/80 hover:bg-[var(--color-eco-accent)] hover:scale-105"
          : "bg-white/[0.04] cursor-not-allowed",
      )}
      aria-label="Enviar"
    >
      <ArrowUp
        size={14}
        strokeWidth={2}
        className={cn(
          "transition-colors",
          hasText ? "text-black/80" : "text-eco-text-faint",
        )}
      />
    </button>
  );
}
