import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Sparkles, Volume2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const PREMIUM_HINT = /\(?(premium|enhanced|neural|siri)\)?/i;
const SPANISH = /^es/i;

type Voice = {
  voiceURI: string;
  name: string;
  lang: string;
  isPremium: boolean;
};

type Props = {
  voices: SpeechSynthesisVoice[];
  selectedURI: string | null;
  onSelect: (uri: string) => void;
  onTestVoice: (uri: string) => void;
};

function classify(v: SpeechSynthesisVoice): Voice {
  return {
    voiceURI: v.voiceURI,
    name: v.name,
    lang: v.lang,
    isPremium: PREMIUM_HINT.test(v.name),
  };
}

export function VoiceMenu({ voices, selectedURI, onSelect, onTestVoice }: Props) {
  const [open, setOpen] = useState(false);

  const { spanish, otherLang, hasPremiumSpanish } = useMemo(() => {
    const classified = voices.map(classify);
    const spanish = classified
      .filter((v) => SPANISH.test(v.lang))
      .sort((a, b) => {
        if (a.isPremium && !b.isPremium) return -1;
        if (!a.isPremium && b.isPremium) return 1;
        return a.name.localeCompare(b.name);
      });
    const otherLang = classified
      .filter((v) => !SPANISH.test(v.lang))
      .sort((a, b) => {
        if (a.isPremium && !b.isPremium) return -1;
        if (!a.isPremium && b.isPremium) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
    return {
      spanish,
      otherLang,
      hasPremiumSpanish: spanish.some((v) => v.isPremium),
    };
  }, [voices]);

  const selected = voices.find((v) => v.voiceURI === selectedURI);
  const label = selected?.name?.replace(PREMIUM_HINT, '').trim() ?? 'Voz';

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
          className="z-50 min-w-[280px] max-w-[360px] glass-strong rounded-[16px] p-1.5 overflow-hidden"
          style={{
            background: 'rgba(15, 15, 22, 0.85)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="px-3 py-2 flex items-center gap-2 border-b border-white/[0.06] mb-1">
            <Volume2 size={12} strokeWidth={1.6} className="text-eco-text-muted" />
            <span className="text-[11px] text-eco-text-muted tracking-tight uppercase font-mono">
              Voz de Eco
            </span>
          </div>

          {spanish.length > 0 ? (
            <Section title="Español">
              {spanish.map((v) => (
                <Item
                  key={v.voiceURI}
                  voice={v}
                  selected={v.voiceURI === selectedURI}
                  onSelect={() => onSelect(v.voiceURI)}
                  onTest={() => onTestVoice(v.voiceURI)}
                />
              ))}
            </Section>
          ) : (
            <div className="px-3 py-3 text-[12px] text-eco-text-faint">
              No hay voces en español disponibles.
            </div>
          )}

          {otherLang.length > 0 && (
            <Section title="Otras voces">
              {otherLang.map((v) => (
                <Item
                  key={v.voiceURI}
                  voice={v}
                  selected={v.voiceURI === selectedURI}
                  onSelect={() => onSelect(v.voiceURI)}
                  onTest={() => onTestVoice(v.voiceURI)}
                />
              ))}
            </Section>
          )}

          {!hasPremiumSpanish && (
            <div className="m-1 px-3 py-2.5 rounded-lg bg-[var(--color-eco-accent)]/8 border border-[var(--color-eco-accent)]/15">
              <div className="flex items-start gap-2">
                <Sparkles size={11} strokeWidth={1.8} className="text-[var(--color-eco-accent)] mt-0.5 shrink-0" />
                <div className="text-[11.5px] text-eco-text-muted leading-relaxed">
                  <span className="text-[var(--color-eco-accent)] font-medium">Mejorá la voz.</span>{' '}
                  En tu Mac: <span className="font-mono text-[10.5px]">System Settings → Accessibility → Spoken Content → System Voice → Manage Voices</span> y descargá <span className="font-medium">Mónica (Premium)</span>, <span className="font-medium">Paulina (Premium)</span> o <span className="font-medium">Marisol (Premium)</span>. Después recargá esta página.
                </div>
              </div>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5 py-0.5">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-eco-text-faint font-mono">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Item({
  voice, selected, onSelect, onTest,
}: {
  voice: Voice;
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
        selected ? "bg-[var(--color-eco-accent)]/10" : "hover:bg-white/[0.06]",
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
            {voice.name.replace(PREMIUM_HINT, '').trim()}
            {voice.isPremium && (
              <span className="ml-1.5 text-[9.5px] text-[var(--color-eco-accent)] font-mono uppercase tracking-wider">
                Premium
              </span>
            )}
          </span>
          <span className="text-[10px] text-eco-text-faint font-mono">{voice.lang}</span>
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
