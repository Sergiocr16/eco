// Shell minimalista para la ventana "solo bubble" (?solo=<id>). Renderiza UN
// solo AgentDetail a pantalla completa, sin sidebar, dashboard, voz, backup
// scheduler ni notificaciones — esos viven en la ventana principal y no deben
// duplicarse. Comparte backend, token y localStorage con la principal.

import { useEffect, useRef, useState } from 'react';
import { useTokens } from '../design/theme';
import { useBubbles } from '../hooks/useBubbles';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useEcoSocket } from '../hooks/useEcoSocket';
import { useVoice } from '../hooks/useVoice';
import { bubbleStreamHandlers } from '../lib/bubble-socket';
import { writeToBubblePty } from '../lib/pty-bridge';
import { emit as ecoEmit } from '../lib/eco-bus';
import { hydrateWorkspaceConfig } from '../lib/workspace-config';
import { AgentDetail } from './AgentDetail';
import { useT } from '../hooks/useI18n';
import { getTopInset } from '../lib/platform';
import { ecoBackend, ecoToken } from '../lib/eco-config';

const BACKEND = ecoBackend();
const TOKEN = ecoToken();

function closeThisWindow(bubbleId: string) {
  const api = window.electronAPI;
  if (api?.closeBubbleWindow) { void api.closeBubbleWindow(bubbleId); return; }
  try { window.close(); } catch { /* noop */ }
}

export function SoloBubbleShell({ bubbleId }: { bubbleId: string }) {
  const t = useTokens();
  const tr = useT();
  const workspacesHook = useWorkspaces();
  const bubbles = useBubbles();

  const socket = useEcoSocket({
    url: BACKEND,
    token: TOKEN,
    handlers: {
      ...bubbleStreamHandlers(bubbles),
      onError: () => { /* manejado en socket.error */ },
      onClientAction: () => { /* la ventana solo no crea/cierra otros bubbles */ },
      onInjectPrompt: () => { /* server-side, no aplica */ },
    },
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onFullscreenChange) return;
    const unsub = api.onFullscreenChange((v) => setIsFullscreen(v));
    return () => { try { unsub(); } catch { /* noop */ } };
  }, []);
  const topInset = isFullscreen ? 0 : getTopInset();

  const bubble = bubbles.bubbles.find((b) => b.id === bubbleId) ?? null;

  // La config por workspace (comandos de server + base branches) la hidrata el
  // App principal al loguear; la ventana "solo bubble" tiene su propio árbol, así
  // que la hidratamos también acá — si no, el ServerPanel cree que el workspace
  // no tiene server configurado.
  useEffect(() => { void hydrateWorkspaceConfig(); }, []);

  // Dictado a la terminal (igual que en la ventana principal). El motor real
  // en Windows es el degradado de useVoice; el botón aparece en ambas.
  const [dictationActive, setDictationActive] = useState(false);
  const [dictationBuffer, setDictationBuffer] = useState('');
  const dictationActiveRef = useRef(false);
  const voice = useVoice({
    language: 'es-419',
    onPhrase: (text: string) => {
      if (!dictationActiveRef.current) return;
      const clean = text.trim();
      if (clean) setDictationBuffer((prev) => (prev ? `${prev} ${clean}` : clean));
    },
    isLongForm: () => true,
  });
  function startTerminalDictation() {
    setDictationBuffer('');
    dictationActiveRef.current = true;
    setDictationActive(true);
    if (voice.state !== 'listening') voice.start();
  }
  function cancelTerminalDictation() {
    dictationActiveRef.current = false;
    setDictationActive(false);
    setDictationBuffer('');
    voice.stop();
  }
  function sendDictationToTerminal() {
    const text = dictationBuffer.trim();
    const token = ecoToken();
    if (bubble && text && token) {
      ecoEmit('eco:switch_tab', { tab: 'terminal', bubbleId: bubble.id });
      void writeToBubblePty({ bubbleId: bubble.id, workspace: bubble.workspace ?? '', text, token });
    }
    cancelTerminalDictation();
  }

  // Título de la ventana = título del bubble.
  useEffect(() => {
    if (bubble?.title) document.title = bubble.title;
  }, [bubble?.title]);

  function sendTo(text: string) {
    if (!bubble) return;
    bubbles.appendMessage(bubble.id, {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user', text, createdAt: Date.now(),
    });
    socket.send({
      bubbleId: bubble.id, text,
      workspace: bubble.workspace || undefined,
      resumeSessionId: bubble.sessionId,
    });
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: t.windowBg }}/>
      {topInset > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: topInset,
          zIndex: 9999, background: 'transparent',
          // @ts-expect-error — propiedad no-estándar de Electron/Chromium
          WebkitAppRegion: 'drag',
        }}/>
      )}
      <div style={{
        position: 'fixed', top: topInset, left: 0, right: 0, bottom: 0,
        zIndex: 1, display: 'flex', flexDirection: 'column',
      }}>
        {bubble ? (
          <AgentDetail
            bubble={bubble}
            workspaces={workspacesHook.list.workspaces}
            solo
            onBack={() => closeThisWindow(bubbleId)}
            onSend={sendTo}
            onInterrupt={socket.interrupt}
            onRename={(title) => bubbles.renameBubble(bubble.id, title)}
            onClose={() => { bubbles.archiveBubble(bubble.id); closeThisWindow(bubbleId); }}
            onChangeWorkspace={(ws) => bubbles.setBubbleWorkspace(bubble.id, ws)}
            onToggleCategory={(catId) => bubbles.toggleBubbleCategory(bubble.id, catId)}
            dictationActive={dictationActive}
            dictationText={dictationActive ? (dictationBuffer + (voice.interimText ? ` ${voice.interimText}` : '')).trim() : ''}
            onStartDictation={() => startTerminalDictation()}
            onSendDictation={sendDictationToTerminal}
            onCancelDictation={cancelTerminalDictation}
            onClearDictation={() => setDictationBuffer('')}
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12, color: t.text2, fontFamily: t.fontSans,
          }}>
            <div style={{ fontSize: 14 }}>{tr('solo.not_found')}</div>
            <button
              type="button"
              onClick={() => closeThisWindow(bubbleId)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${t.glassBorder}`,
                background: t.bg2, color: t.text1, cursor: 'pointer', fontSize: 12.5,
              }}>{tr('solo.close')}</button>
          </div>
        )}
      </div>
    </>
  );
}
