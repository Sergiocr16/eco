import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { GradientMesh } from './components/GradientMesh';
import { StatusOrb } from './components/StatusOrb';
import { BubbleWorkspace } from './components/BubbleWorkspace';
import { InputBar } from './components/InputBar';
import { SettingsPanel } from './components/SettingsPanel';
import { useVoice } from './hooks/useVoice';
import { useTTS } from './hooks/useTTS';
import { useBubbles } from './hooks/useBubbles';
import { useEcoSocket } from './hooks/useEcoSocket';
import { useSkills } from './hooks/useSkills';
import type { EcoStatus, Message, ToolCall } from './lib/types';

const BACKEND = (import.meta.env.VITE_ECO_BACKEND as string) ?? '';
const TOKEN = (import.meta.env.VITE_ECO_TOKEN as string) ?? '';

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const bubbles = useBubbles('');
  const tts = useTTS();
  const skillsHook = useSkills(bubbles.activeBubble?.workspace);

  const socket = useEcoSocket({
    url: BACKEND,
    token: TOKEN,
    handlers: {
      onSessionStarted: (bubbleId, sessionId) => {
        bubbles.setBubbleSessionId(bubbleId, sessionId);
      },
      onAssistantTextDelta: (bubbleId, assistantMessageId, text) => {
        bubbles.setBubbleMessages(bubbleId, (msgs) => {
          const idx = msgs.findIndex((m) => m.id === assistantMessageId);
          if (idx >= 0) {
            return msgs.map((m, i) =>
              i === idx ? { ...m, text: m.text + text } : m,
            );
          }
          const newMsg: Message = {
            id: assistantMessageId,
            role: 'assistant',
            text,
            toolCalls: [],
            createdAt: Date.now(),
          };
          return [...msgs, newMsg];
        });
      },
      onToolUse: (bubbleId, assistantMessageId, toolCall) => {
        bubbles.setBubbleMessages(bubbleId, (msgs) => {
          const idx = msgs.findIndex((m) => m.id === assistantMessageId);
          if (idx >= 0) {
            return msgs.map((m, i) => i === idx ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] } : m);
          }
          const newMsg: Message = {
            id: assistantMessageId,
            role: 'assistant',
            text: '',
            toolCalls: [toolCall],
            createdAt: Date.now(),
          };
          return [...msgs, newMsg];
        });
      },
      onToolResult: (bubbleId, toolUseId, output, status) => {
        bubbles.setBubbleMessages(bubbleId, (msgs) =>
          msgs.map((m) => ({
            ...m,
            toolCalls: m.toolCalls?.map((t: ToolCall) =>
              t.id === toolUseId ? { ...t, output, status } : t,
            ),
          })),
        );
      },
      onThinkingChange: (bubbleId, thinking) => {
        bubbles.setBubbleStatus(bubbleId, thinking ? 'thinking' : 'idle');
      },
      onExecutingChange: (bubbleId, executing) => {
        bubbles.setBubbleStatus(bubbleId, executing ? 'executing' : 'idle');
      },
      onDone: (bubbleId) => {
        bubbles.setBubbleStatus(bubbleId, 'idle');
      },
      onError: (_bubbleId, _message) => {
        // ya manejado en error state del socket
      },
      onClientAction: (sourceBubbleId, action) => {
        if (action.kind === 'open_bubble') {
          bubbles.createBubble({ title: action.title, focus: action.focus });
        } else if (action.kind === 'rename_bubble') {
          bubbles.renameBubble(sourceBubbleId, action.title);
        } else if (action.kind === 'close_bubble') {
          bubbles.removeBubble(sourceBubbleId);
        }
      },
    },
  });

  const voice = useVoice({ language: 'es-419', onCommand: handleVoiceCommand });

  const listening = voice.state === 'watching' || voice.state === 'capturing';
  const activeBubble = bubbles.activeBubble;

  const lastSpokenRef = useRef<string | null>(null);

  const status: EcoStatus = useMemo(() => {
    if (socket.status === 'error') return 'error';
    if (voice.state === 'capturing') return 'listening';
    if (activeBubble?.status === 'executing') return 'executing';
    if (activeBubble?.status === 'thinking') return 'thinking';
    if (tts.speaking) return 'speaking';
    return 'idle';
  }, [socket.status, voice.state, activeBubble?.status, tts.speaking]);

  useEffect(() => {
    if (!tts.enabled) return;
    if (!activeBubble) return;
    if (activeBubble.status !== 'idle') return; // esperar que termine
    const last = activeBubble.messages[activeBubble.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.text) return;
    const key = `${activeBubble.id}:${last.id}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    tts.speak(last.text);
  }, [activeBubble, tts]);

  function handleVoiceCommand(text: string) {
    handleSend(text);
  }

  function handleSend(text: string) {
    if (!activeBubble) return;
    appendAndSend(activeBubble.id, text);
  }

  function appendAndSend(bubbleId: string, text: string) {
    const bubble = bubbles.bubbles.find((b) => b.id === bubbleId);
    if (!bubble) return;
    bubbles.appendMessage(bubbleId, {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text,
      createdAt: Date.now(),
    });
    socket.send({
      bubbleId,
      text,
      workspace: bubble.workspace || undefined,
      resumeSessionId: bubble.sessionId,
    });
  }

  function handleMicToggle() {
    if (voice.state === 'off' || voice.state === 'unsupported') voice.start();
    else voice.stop();
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--color-eco-bg-deep)]">
      <GradientMesh />

      {/* Brand + connection */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="absolute top-5 left-7 z-30 select-none flex items-baseline gap-3"
      >
        <span className="text-display text-[15px] text-eco-text/80" style={{ letterSpacing: '-0.02em' }}>
          Eco
        </span>
        <span className="text-[10px] text-eco-text-faint font-mono tracking-wider uppercase">v0.1</span>
        <ConnectionPill status={socket.status} />
      </motion.div>

      {socket.error && (
        <div className="absolute top-5 right-7 z-30 glass px-3 py-2 rounded-xl text-[12px] text-eco-text-muted max-w-sm">
          {socket.error}
        </div>
      )}

      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <StatusOrbCompact status={status} />
      </div>

      {/* Workspace: burbujas en stage manager */}
      <div className="absolute inset-0 top-[80px] bottom-[100px]">
        <BubbleWorkspace
          bubbles={bubbles.bubbles}
          activeBubble={activeBubble}
          onFocus={bubbles.focusBubble}
          onClose={bubbles.removeBubble}
          onTogglePin={bubbles.togglePin}
          onRename={bubbles.renameBubble}
          onCreate={() => bubbles.createBubble({ focus: true })}
        />
      </div>

      <InputBar
        workspace={activeBubble?.workspace ?? ''}
        listening={listening}
        interimText={voice.state === 'capturing' ? voice.transcript : ''}
        voiceError={voice.error}
        voiceUnsupported={voice.state === 'unsupported'}
        ttsEnabled={tts.enabled}
        ttsSupported={tts.isSupported}
        ttsSpeaking={tts.speaking}
        skills={skillsHook.skills}
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
        workspaces={[activeBubble?.workspace || '/tmp/eco-test']}
      />
    </div>
  );
}

function StatusOrbCompact({ status }: { status: EcoStatus }) {
  return (
    <div className="pointer-events-auto">
      <StatusOrb status={status} />
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
