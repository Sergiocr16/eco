import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Sparkles, Volume2, Cpu, Globe } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { UnifiedVoice } from '@/hooks/useTTS';

const SPANISH = /^es/i;

type Props = {
  voices: UnifiedVoice[];
  selectedURI: string | null;
  onSelect: (id: string) => void;
  onTestVoice: (id: string) => void;
};

export function VoiceMenu({ voices, selectedURI, onSelect, onTestVoice }: Props) {
  const [open, setOpen] = useState(false);

  const { piperEs, piperOther, browserEs, browserOther } = useMemo(() => {
    const piper = voices.filter((v) => v.kind === 'piper');
    const browser = voices.filter((v) => v.kind === 'browser');
    const sortName = (a: UnifiedVoice, b: UnifiedVoice) => {
      if (a.premium && !b.premium) return -1;
      if (!a.premium && b.premium) return 1;
      return a.name.localeCompare(b.name);
    };
    return {
      piperEs: piper.filter((v) => SPANISH.test(v.language)).sort(sortName),
      piperOther: piper.filter((v) => !SPANISH.test(v.language)).sort(sortName),
      browserEs: browser.filter((v) => SPANISH.test(v.language)).sort(sortName),
      browserOther: browser.filter((v) => !SPANISH.test(v.language)).sort(sortName).slice(0, 6),
    };
  }, [voices]);

  const selected = voices.find((v) => v.id === selectedURI);
  const label = selected?.name ?? 'Voz';

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full hover:bg-white/[0.08] transition-colors"
          aria-label="Elegir voz"
        >
          <span className="text-[11.5px] text-eco-text-muted font-medium tracking-tight max-w-[120px] truncate">
            {label}
          </span>
          <ChevronDown size={11} strokeWidth={1.8} className="text-eco-text-faint" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[300px] max-w-[380px] rounded-[16px] p-1.5 overflow-hidden"
          style={{
            background: 'rgba(15, 15, 22, 0.92)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)',
          }}
        >
          <div className="px-3 py-2 flex items-center gap-2 border-b border-white/[0.06] mb-1">
            <Volume2 size={12} strokeWidth={1.6} className="text-eco-text-muted" />
            <span className="text-[11px] text-eco-text-muted tracking-tight uppercase font-mono">
              Voz de Eco
            </span>
          </div>

          {piperEs.length > 0 && (
            <Section title="Neural local" icon={<Cpu size={10} strokeWidth={2} />}>
              {piperEs.map((v) => (
                <Item key={v.id} voice={v} selected={v.id === selectedURI}
                  onSelect={() => onSelect(v.id)} onTest={() => onTestVoice(v.id)} />
              ))}
            </Section>
          )}

          {piperOther.length > 0 && (
            <Section title="Neural · otros idiomas" icon={<Cpu size={10} strokeWidth={2} />}>
              {piperOther.map((v) => (
                <Item key={v.id} voice={v} selected={v.id === selectedURI}
                  onSelect={() => onSelect(v.id)} onTest={() => onTestVoice(v.id)} />
              ))}
            </Section>
          )}

          {browserEs.length > 0 && (
            <Section title="Sistema · español" icon={<Globe size={10} strokeWidth={2} />}>
              {browserEs.slice(0, 8).map((v) => (
                <Item key={v.id} voice={v} selected={v.id === selectedURI}
                  onSelect={() => onSelect(v.id)} onTest={() => onTestVoice(v.id)} />
              ))}
            </Section>
          )}

          {browserOther.length > 0 && (
            <Section title="Sistema · otros" icon={<Globe size={10} strokeWidth={2} />}>
              {browserOther.map((v) => (
                <Item key={v.id} voice={v} selected={v.id === selectedURI}
                  onSelect={() => onSelect(v.id)} onTest={() => onTestVoice(v.id)} />
              ))}
            </Section>
          )}

          {piperEs.length === 0 && (
            <div className="m-1 px-3 py-2.5 rounded-lg bg-[var(--color-eco-accent)]/8 border border-[var(--color-eco-accent)]/15">
              <div className="flex items-start gap-2">
                <Sparkles size={11} strokeWidth={1.8} className="text-[var(--color-eco-accent)] mt-0.5 shrink-0" />
                <div className="text-[11.5px] text-eco-text-muted leading-relaxed">
                  Las voces neurales locales de Eco no están instaladas todavía.
                  Las del sistema funcionan pero suenan menos naturales.
                </div>
              </div>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-1.5 py-0.5">
      <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-eco-text-faint font-mono">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Item({
  voice, selected, onSelect, onTest,
}: {
  voice: UnifiedVoice;
  selected: boolean;
  onSelect: () => void;
  onTest: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={(e) => { e.preventDefault(); onSelect(); }}
      className={cn(
        "group flex items-center justify-between gap-3 px-2.5 py-2 rounded-md cursor-pointer outline-none",
        "transition-colors",
        selected ? "bg-[var(--color-eco-accent)]/12" : "hover:bg-white/[0.06]",
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            selected ? "bg-[var(--color-eco-accent)]" : "bg-transparent",
          )}
        />
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-[13px] truncate tracking-tight",
            selected ? "text-eco-text" : "text-eco-text-muted",
          )}>
            {voice.name}
            {voice.kind === 'piper' && (
              <span className="ml-1.5 text-[9.5px] text-[var(--color-eco-accent)] font-mono uppercase tracking-wider">
                Neural
              </span>
            )}
            {voice.kind === 'browser' && voice.premium && (
              <span className="ml-1.5 text-[9.5px] text-eco-text-muted font-mono uppercase tracking-wider">
                Premium
              </span>
            )}
          </span>
          <span className="text-[10px] text-eco-text-faint font-mono">{voice.language}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onTest(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-eco-text-faint hover:text-eco-text-muted font-mono px-2"
        aria-label="Probar voz"
      >
        ▸
      </button>
    </DropdownMenu.Item>
  );
}
