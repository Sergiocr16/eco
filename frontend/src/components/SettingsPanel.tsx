import * as Dialog from '@radix-ui/react-dialog';
import { X, Cpu, Globe, Sparkles, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/cn';
import type { UnifiedVoice } from '@/hooks/useTTS';

const SPANISH = /^es/i;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ttsEnabled: boolean;
  ttsSpeaking: boolean;
  ttsVoices: UnifiedVoice[];
  ttsSelectedVoiceURI: string | null;
  onTtsToggle: () => void;
  onTtsVoiceChange: (id: string) => void;
  onTtsTestVoice: (id: string) => void;
  workspaces: string[];
};

export function SettingsPanel(props: Props) {
  const { open, onOpenChange } = props;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="fixed top-[8vh] left-1/2 -translate-x-1/2 z-50 w-[min(560px,92vw)] max-h-[84vh] rounded-[22px] overflow-hidden flex flex-col"
                style={{
                  background: 'rgba(15, 15, 22, 0.92)',
                  backdropFilter: 'blur(48px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(48px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.18), 0 30px 80px -10px rgba(0,0,0,0.7)',
                }}
              >
                <Header onClose={() => onOpenChange(false)} />
                <div className="overflow-y-auto invisible-scroll px-6 py-5 flex flex-col gap-7">
                  <VoiceSection {...props} />
                  <WorkspaceSection workspaces={props.workspaces} />
                  <AboutSection />
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]"
      style={{ background: 'rgba(255,255,255,0.015)' }}
    >
      <div className="flex flex-col">
        <Dialog.Title className="text-display text-[16px] text-eco-text tracking-tight">
          Ajustes
        </Dialog.Title>
        <Dialog.Description className="text-[11.5px] text-eco-text-faint tracking-tight mt-0.5">
          Voz, workspaces e info de Eco.
        </Dialog.Description>
      </div>
      <button
        onClick={onClose}
        className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition-colors"
        aria-label="Cerrar"
      >
        <X size={14} strokeWidth={1.6} className="text-eco-text-muted" />
      </button>
    </div>
  );
}

function VoiceSection({
  ttsEnabled, ttsSpeaking, ttsVoices, ttsSelectedVoiceURI,
  onTtsToggle, onTtsVoiceChange, onTtsTestVoice,
}: Props) {
  const piperEs = ttsVoices.filter((v) => v.kind === 'piper' && SPANISH.test(v.language));
  const piperOther = ttsVoices.filter((v) => v.kind === 'piper' && !SPANISH.test(v.language));
  const browserEs = ttsVoices.filter((v) => v.kind === 'browser' && SPANISH.test(v.language));
  const browserOther = ttsVoices.filter((v) => v.kind === 'browser' && !SPANISH.test(v.language)).slice(0, 6);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Voz" icon={<Volume2 size={12} strokeWidth={1.8} />} />
      <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-white/[0.025] border border-white/[0.04]">
        <div className="flex flex-col">
          <span className="text-[13px] text-eco-text tracking-tight">Eco te habla en voz alta</span>
          <span className="text-[11px] text-eco-text-faint tracking-tight">
            Cuando recibas una respuesta, se reproduce.
          </span>
        </div>
        <Toggle on={ttsEnabled} onClick={onTtsToggle} pulse={ttsSpeaking} />
      </div>

      <div className="flex flex-col gap-3 mt-1">
        <span className="text-[10.5px] uppercase tracking-wider text-eco-text-faint font-mono px-1">
          Voz seleccionada
        </span>

        {piperEs.length > 0 && (
          <VoiceGroup title="Neural local" icon={<Cpu size={10} strokeWidth={2} />}
            voices={piperEs} selectedURI={ttsSelectedVoiceURI}
            onSelect={onTtsVoiceChange} onTest={onTtsTestVoice} />
        )}
        {piperOther.length > 0 && (
          <VoiceGroup title="Neural · otros idiomas" icon={<Cpu size={10} strokeWidth={2} />}
            voices={piperOther} selectedURI={ttsSelectedVoiceURI}
            onSelect={onTtsVoiceChange} onTest={onTtsTestVoice} />
        )}
        {browserEs.length > 0 && (
          <VoiceGroup title="Sistema · español" icon={<Globe size={10} strokeWidth={2} />}
            voices={browserEs.slice(0, 8)} selectedURI={ttsSelectedVoiceURI}
            onSelect={onTtsVoiceChange} onTest={onTtsTestVoice} />
        )}
        {browserOther.length > 0 && (
          <VoiceGroup title="Sistema · otros" icon={<Globe size={10} strokeWidth={2} />}
            voices={browserOther} selectedURI={ttsSelectedVoiceURI}
            onSelect={onTtsVoiceChange} onTest={onTtsTestVoice} />
        )}

        {piperEs.length === 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-eco-accent)]/8 border border-[var(--color-eco-accent)]/15">
            <Sparkles size={11} strokeWidth={1.8} className="text-[var(--color-eco-accent)] mt-0.5 shrink-0" />
            <div className="text-[11.5px] text-eco-text-muted leading-relaxed">
              No hay voces neurales locales instaladas. Las del sistema funcionan pero suenan menos naturales.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function VoiceGroup({
  title, icon, voices, selectedURI, onSelect, onTest,
}: {
  title: string;
  icon?: React.ReactNode;
  voices: UnifiedVoice[];
  selectedURI: string | null;
  onSelect: (id: string) => void;
  onTest: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="px-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-eco-text-faint font-mono">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-0.5">
        {voices.map((v) => (
          <VoiceItem key={v.id}
            voice={v}
            selected={v.id === selectedURI}
            onSelect={() => onSelect(v.id)}
            onTest={() => onTest(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

function VoiceItem({
  voice, selected, onSelect, onTest,
}: {
  voice: UnifiedVoice;
  selected: boolean;
  onSelect: () => void;
  onTest: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-colors text-left",
        selected ? "bg-[var(--color-eco-accent)]/12" : "hover:bg-white/[0.05]",
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          selected ? "bg-[var(--color-eco-accent)]" : "bg-transparent",
        )} />
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
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onTest(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onTest(); } }}
        className="text-[11px] text-eco-text-faint hover:text-eco-text-muted font-mono px-2 cursor-pointer"
        aria-label="Probar voz"
      >
        ▸ Probar
      </span>
    </button>
  );
}

function WorkspaceSection({ workspaces }: { workspaces: string[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Workspaces" />
      <div className="flex flex-col gap-1">
        {workspaces.length === 0 ? (
          <p className="text-[12px] text-eco-text-faint">Sin workspaces configurados.</p>
        ) : (
          workspaces.map((w) => (
            <div key={w} className="px-3 py-2 rounded-lg bg-white/[0.025] border border-white/[0.04] text-[12px] font-mono text-eco-text-muted tracking-tight truncate">
              {w}
            </div>
          ))
        )}
        <p className="text-[10.5px] text-eco-text-faint mt-1 px-1">
          Configurá los workspaces permitidos en <span className="font-mono">backend/.env</span> (variable <span className="font-mono">ECO_WORKSPACES</span>).
        </p>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Eco" />
      <div className="text-[11.5px] text-eco-text-muted leading-relaxed">
        Asistente local para Mac potenciado por Claude.
        <span className="text-eco-text-faint"> Voz, archivos y código sin que nada salga de tu computadora (excepto las llamadas a la API de Claude).</span>
      </div>
      <div className="text-[10.5px] text-eco-text-faint font-mono mt-1">v0.1 · build dev</div>
    </section>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      {icon && <span className="text-eco-text-muted">{icon}</span>}
      <span className="text-[13.5px] text-eco-text font-medium tracking-tight">{title}</span>
    </div>
  );
}

function Toggle({ on, onClick, pulse }: { on: boolean; onClick: () => void; pulse?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors duration-300",
        on ? "bg-[var(--color-eco-accent)]" : "bg-white/[0.1]",
      )}
      aria-label={on ? 'Desactivar' : 'Activar'}
    >
      <motion.div
        animate={{ x: on ? 22 : 2 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white",
          pulse && on && "animate-pulse",
        )}
      />
    </button>
  );
}
