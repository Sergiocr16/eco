import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { GradientMesh } from './components/GradientMesh';
import { StatusOrb } from './components/StatusOrb';
import { MessageBubble } from './components/MessageBubble';
import { InputBar } from './components/InputBar';
import { SettingsPanel } from './components/SettingsPanel';
import { useVoice } from './hooks/useVoice';
import { useTTS } from './hooks/useTTS';
import { useEcoSocket } from './hooks/useEcoSocket';
import type { EcoStatus } from './lib/types';

// Backend URL: si VITE_ECO_BACKEND está seteado lo usa; sino usa rutas relativas
// (que en dev son proxyeadas por Vite a localhost:7000, en Tauri van al backend embebido).
const BACKEND = (import.meta.env.VITE_ECO_BACKEND as string) ?? '';
const TOKEN = (import.meta.env.VITE_ECO_TOKEN as string) ?? '';

export function App() {
  const [workspace] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const socket = useEcoSocket({ url: BACKEND, token: TOKEN });
  const voice = useVoice({ language: 'es-419', onCommand: handleVoiceCommand });
  const tts = useTTS();

  const listening = voice.state === 'watching' || voice.state === 'capturing';
  const lastSpokenRef = useRef<string | null>(null);

  const status: EcoStatus = (() => {
    if (socket.status === 'error') return 'error';
    if (voice.state === 'capturing') return 'listening';
    if (socket.executing) return 'executing';
    if (socket.thinking) return 'thinking';
    if (tts.speaking) return 'speaking';
    return 'idle';
  })();

  useEffect(() => {
    if (!tts.enabled) return;
    const last = socket.messages[socket.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.text) return;
    if (socket.thinking || socket.executing) return; // esperar a terminar
    if (lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    tts.speak(last.text);
  }, [socket.messages, socket.thinking, socket.executing, tts]);

  function handleVoiceCommand(text: string) {
    socket.send(text, workspace || undefined);
  }

  function handleSend(text: string) {
    socket.send(text, workspace || undefined);
  }

  function handleMicToggle() {
    if (voice.state === 'off' || voice.state === 'unsupported') voice.start();
    else voice.stop();
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--color-eco-bg-deep)]">
      <GradientMesh />

      {/* Brand + connection state */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="absolute top-6 left-7 z-30 select-none flex items-baseline gap-3"
      >
        <span
          className="text-display text-[15px] text-eco-text/80"
          style={{ letterSpacing: '-0.02em' }}
        >
          Eco
        </span>
        <span className="text-[10px] text-eco-text-faint font-mono tracking-wider uppercase">
          v0.1
        </span>
        <ConnectionPill status={socket.status} />
      </motion.div>

      {socket.error && (
        <div className="absolute top-6 right-7 z-30 glass px-3 py-2 rounded-xl text-[12px] text-eco-text-muted max-w-sm">
          {socket.error}
        </div>
      )}

      {/* Hero: orb + status */}
      <div className="relative z-10 flex flex-col items-center pt-[10vh] pb-[3vh]">
        <StatusOrb status={status} />
      </div>

      {/* Conversation panel */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-[110px]" style={{ height: 'calc(100vh - 38vh)' }}>
        <div className="h-full overflow-y-auto invisible-scroll">
          <div className="flex flex-col gap-5 pb-6">
            {socket.messages.length === 0 ? (
              <EmptyState />
            ) : (
              socket.messages.map((m, i) => (
                <MessageBubble key={m.id} message={m} index={i} />
              ))
            )}
          </div>
        </div>
      </div>

      <InputBar
        workspace={workspace}
        listening={listening}
        interimText={voice.state === 'capturing' ? voice.transcript : ''}
        voiceError={voice.error}
        voiceUnsupported={voice.state === 'unsupported'}
        ttsEnabled={tts.enabled}
        ttsSupported={tts.isSupported}
        ttsSpeaking={tts.speaking}
        onTtsToggle={() => tts.setEnabled(!tts.enabled)}
        onSettingsClick={() => setSettingsOpen(true)}
        onSend={handleSend}
        onMicToggle={handleMicToggle}
        onWorkspaceClick={() => setSettingsOpen(true)}
      />

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        ttsEnabled={tts.enabled}
        ttsSpeaking={tts.speaking}
        ttsVoices={tts.voices}
        ttsSelectedVoiceURI={tts.selectedVoiceURI}
        onTtsToggle={() => tts.setEnabled(!tts.enabled)}
        onTtsVoiceChange={tts.selectVoice}
        onTtsTestVoice={(uri) => {
          const previous = tts.selectedVoiceURI;
          tts.selectVoice(uri);
          const wasEnabled = tts.enabled;
          if (!wasEnabled) tts.setEnabled(true);
          setTimeout(() => tts.speak('Hola, soy Eco. Esta es mi voz.'), 50);
          setTimeout(() => {
            if (!wasEnabled) tts.setEnabled(false);
            if (previous) tts.selectVoice(previous);
          }, 4500);
        }}
        workspaces={[workspace || '/tmp/eco-test']}
      />
    </div>
  );
}

function ConnectionPill({ status }: { status: 'disconnected' | 'connecting' | 'connected' | 'error' }) {
  const map = {
    connected: { color: 'oklch(0.74 0.16 160)', label: 'conectado' },
    connecting: { color: 'oklch(0.78 0.14 80)', label: 'conectando…' },
    disconnected: { color: 'oklch(0.65 0.03 240)', label: 'sin conexión' },
    error: { color: 'oklch(0.68 0.18 25)', label: 'error' },
  } as const;
  const v = map[status];
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-eco-text-faint font-mono uppercase tracking-wider">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: v.color,
          animation: status === 'connecting' ? 'pulse-dot 1.4s ease-in-out infinite' : undefined,
          boxShadow: status === 'connected' ? `0 0 8px ${v.color}` : undefined,
        }}
      />
      {v.label}
    </span>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.5 }}
      className="self-center text-center pt-12"
    >
      <p className="text-eco-text-muted text-[14px] tracking-tight max-w-md">
        Hola. Empezá una conversación escribiendo abajo o
        <br />
        activá el micrófono y decí <span className="text-eco-text">«Eco»</span> seguido de tu pedido.
      </p>
    </motion.div>
  );
}
