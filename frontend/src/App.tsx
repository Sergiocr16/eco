import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, useTokens } from './design/theme';
import { MacWindow } from './components/MacWindow';
import { AppSidebar, type Screen } from './components/AppSidebar';
import { Dashboard } from './screens/Dashboard';
import { AgentDetail } from './screens/AgentDetail';
import { Settings } from './screens/Settings';
import { FileExplorer } from './screens/FileExplorer';
import { useVoice } from './hooks/useVoice';
import { useTTS } from './hooks/useTTS';
import { useBubbles } from './hooks/useBubbles';
import { useEcoSocket } from './hooks/useEcoSocket';
import type { Bubble, BubbleStatus, Message, ToolCall, VoiceState } from './lib/types';

const BACKEND = (import.meta.env.VITE_ECO_BACKEND as string) ?? '';
const TOKEN = (import.meta.env.VITE_ECO_TOKEN as string) ?? '';

export function App() {
  return (
    <ThemeProvider>
      <Shell/>
    </ThemeProvider>
  );
}

function Shell() {
  const t = useTokens();
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [detailBubbleId, setDetailBubbleId] = useState<string | null>(null);

  const bubbles = useBubbles('');
  const tts = useTTS();
  const lastSpokenRef = useRef<string | null>(null);

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
            return msgs.map((m, i) => i === idx ? { ...m, text: m.text + text } : m);
          }
          const newMsg: Message = {
            id: assistantMessageId,
            role: 'assistant', text, toolCalls: [], createdAt: Date.now(),
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
            id: assistantMessageId, role: 'assistant', text: '',
            toolCalls: [toolCall], createdAt: Date.now(),
          };
          return [...msgs, newMsg];
        });
      },
      onToolResult: (bubbleId, toolUseId, output, status) => {
        bubbles.setBubbleMessages(bubbleId, (msgs) =>
          msgs.map((m) => ({
            ...m,
            toolCalls: m.toolCalls?.map((tc: ToolCall) =>
              tc.id === toolUseId ? { ...tc, output, status } : tc,
            ),
          })),
        );
      },
      onThinkingChange: (bubbleId, thinking) => {
        const status: BubbleStatus = thinking ? 'thinking' : 'idle';
        bubbles.setBubbleStatus(bubbleId, status);
      },
      onExecutingChange: (bubbleId, executing) => {
        const status: BubbleStatus = executing ? 'executing' : 'idle';
        bubbles.setBubbleStatus(bubbleId, status);
      },
      onDone: (bubbleId) => bubbles.setBubbleStatus(bubbleId, 'idle'),
      onError: () => { /* ya manejado en socket.error */ },
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

  const voice = useVoice({
    language: 'es-419',
    onCommand: (text: string) => {
      const target = detailBubbleId || bubbles.activeBubbleId;
      if (!target) return;
      sendTo(target, text);
    },
  });

  function sendTo(bubbleId: string, text: string) {
    const bubble = bubbles.bubbles.find((b) => b.id === bubbleId);
    if (!bubble) return;
    bubbles.appendMessage(bubbleId, {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user', text, createdAt: Date.now(),
    });
    socket.send({
      bubbleId, text,
      workspace: bubble.workspace || undefined,
      resumeSessionId: bubble.sessionId,
    });
  }

  const detailBubble: Bubble | null = detailBubbleId
    ? bubbles.bubbles.find((b) => b.id === detailBubbleId) ?? null
    : null;

  // TTS automático del último mensaje del assistant cuando termina
  useEffect(() => {
    if (!tts.enabled) return;
    const focusBubble = detailBubble ?? bubbles.activeBubble;
    if (!focusBubble) return;
    if (focusBubble.status !== 'idle') return;
    const last = focusBubble.messages[focusBubble.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.text) return;
    const key = `${focusBubble.id}:${last.id}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    tts.speak(last.text);
  }, [detailBubble, bubbles.activeBubble, tts]);

  // Voice state derivado para el orbe
  const focusBubble = detailBubble ?? bubbles.activeBubble;
  const voiceStateForOrb: VoiceState = (() => {
    if (voice.state === 'capturing') return 'listening';
    if (focusBubble?.status === 'executing') return 'executing';
    if (focusBubble?.status === 'thinking') return 'thinking';
    if (tts.speaking) return 'speaking';
    if (voice.state === 'watching') return 'listening';
    return 'idle';
  })();

  function handleScreenChange(s: Screen) {
    if (s === 'dashboard') setDetailBubbleId(null);
    setScreen(s);
  }

  function handleOpenAgent(id: string) {
    setDetailBubbleId(id);
    bubbles.focusBubble(id);
    setScreen('detail');
  }

  function handleBackFromDetail() {
    setDetailBubbleId(null);
    setScreen('dashboard');
  }

  function handleMicToggle() {
    if (voice.state === 'off' || voice.state === 'unsupported') voice.start();
    else voice.stop();
  }

  function handleDashboardSend(text: string) {
    if (!bubbles.activeBubble) {
      const fresh = bubbles.createBubble({ focus: true });
      sendTo(fresh.id, text);
    } else {
      sendTo(bubbles.activeBubble.id, text);
    }
  }

  function handleAgentDetailSend(text: string) {
    if (!detailBubbleId) return;
    sendTo(detailBubbleId, text);
  }

  function handleCreateAgent(title?: string) {
    const fresh = bubbles.createBubble({ title, focus: true });
    handleOpenAgent(fresh.id);
  }

  const activeCount = bubbles.bubbles.filter((b) =>
    ['running', 'thinking', 'executing', 'waiting'].includes(b.status as string),
  ).length;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: t.desktopBg,
      }}/>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ width: '100%', height: '100%', maxWidth: 1480, maxHeight: 940 }}>
          <MacWindow title={titleFor(screen, detailBubble?.title)}>
            <div style={{ display: 'flex', height: '100%' }}>
              <AppSidebar
                screen={screen === 'detail' ? 'dashboard' : screen}
                onScreenChange={handleScreenChange}
                agentCount={activeCount}
              />
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <ScreenError error={socket.error}/>
                {screen === 'detail' && detailBubble ? (
                  <AgentDetail
                    bubble={detailBubble}
                    onBack={handleBackFromDetail}
                    onSend={handleAgentDetailSend}
                    onRename={(title) => bubbles.renameBubble(detailBubble.id, title)}
                  />
                ) : screen === 'files' ? (
                  <FileExplorer bubbles={bubbles.bubbles}/>
                ) : screen === 'settings' ? (
                  <Settings/>
                ) : screen === 'history' ? (
                  <HistoryScreen bubbles={bubbles.bubbles} onOpen={handleOpenAgent}/>
                ) : (
                  <Dashboard
                    bubbles={bubbles.bubbles}
                    activeBubbleId={bubbles.activeBubbleId}
                    voiceState={voiceStateForOrb}
                    listening={voice.state === 'watching' || voice.state === 'capturing'}
                    interimText={voice.state === 'capturing' ? voice.transcript : ''}
                    voiceError={voice.error}
                    onSend={handleDashboardSend}
                    onMicToggle={handleMicToggle}
                    onOpenAgent={handleOpenAgent}
                    onCreateAgent={handleCreateAgent}
                    onFocus={(id) => bubbles.focusBubble(id)}
                    onRename={(id, title) => bubbles.renameBubble(id, title)}
                    onRemove={(id) => bubbles.removeBubble(id)}
                  />
                )}
              </div>
            </div>
          </MacWindow>
        </div>
      </div>
    </>
  );
}

function titleFor(screen: Screen, detailTitle?: string): string {
  if (screen === 'detail' && detailTitle) return `Eco — ${detailTitle}`;
  if (screen === 'files') return 'Eco — Archivos';
  if (screen === 'history') return 'Eco — Historial';
  if (screen === 'settings') return 'Eco — Ajustes';
  return 'Eco — Centro de control';
}

function ScreenError({ error }: { error: string | null }) {
  const t = useTokens();
  if (!error) return null;
  return (
    <div style={{
      position: 'absolute', top: 12, right: 24, zIndex: 30,
      background: `color-mix(in oklch, ${t.err} 14%, ${t.bg1})`,
      border: `1px solid color-mix(in oklch, ${t.err} 30%, transparent)`,
      color: t.err, padding: '8px 12px', borderRadius: 10,
      fontSize: 12, fontFamily: t.fontSans,
    }}>{error}</div>
  );
}

function HistoryScreen({ bubbles, onOpen }: { bubbles: Bubble[]; onOpen: (id: string) => void }) {
  const t = useTokens();
  const allMsgs: Array<{ bubble: Bubble; msg: Message }> = [];
  for (const b of bubbles) {
    for (const m of b.messages) allMsgs.push({ bubble: b, msg: m });
  }
  allMsgs.sort((a, b) => b.msg.createdAt - a.msg.createdAt);
  return (
    <div style={{ padding: '28px 32px', overflow: 'auto', height: '100%' }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>
        Historial
      </h2>
      <p style={{ margin: '4px 0 22px', fontSize: 13, color: t.text2 }}>
        Mensajes de todas las burbujas, ordenados por fecha.
      </p>
      {allMsgs.length === 0 ? (
        <div style={{ fontSize: 13, color: t.text2, padding: 24 }}>Sin historial todavía.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allMsgs.slice(0, 100).map(({ bubble, msg }) => (
            <button
              key={`${bubble.id}-${msg.id}`} type="button"
              onClick={() => onOpen(bubble.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', background: t.bg2, border: `1px solid ${t.glassBorder}`,
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{
                fontFamily: t.fontMono, fontSize: 11, color: t.text2,
                width: 50, flexShrink: 0,
              }}>{relTime(msg.createdAt)}</span>
              <span style={{
                fontFamily: t.fontSans, fontSize: 12.5, color: t.text1, fontWeight: 500,
                width: 120, flexShrink: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{bubble.title}</span>
              <span style={{
                flex: 1, fontFamily: t.fontSans, fontSize: 12.5,
                color: msg.role === 'user' ? t.text0 : t.text1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{msg.role === 'user' ? 'Tú: ' : '→ '}{msg.text.slice(0, 120)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function relTime(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / (60 * 24))}d`;
}
