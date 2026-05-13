import { useCallback, useEffect, useRef, useState } from 'react';
import type { SocketStatus, ToolCall } from '@/lib/types';
import { translateBackendError } from '@/lib/backend-errors';
import { translate, loadLang } from '@/lib/i18n';

const RECONNECT_BACKOFF_MS = [500, 1500, 3000, 5000, 10_000];

type ServerMsg =
  | { type: 'sdk_message'; message: SdkMessage }
  | { type: 'session_started'; sessionId: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string }
  | { type: 'client_action'; action: ClientAction }
  | { type: 'voice_transcribed'; text: string; ts: number }
  | { type: 'pty_status'; bubbleId: string; running: boolean }
  | { type: 'dev_status'; bubbleId: string; role?: 'main' | 'frontend' | 'backend'; status: 'idle' | 'starting' | 'running' | 'stopped' | 'error'; port: number; url: string; command: string; exitCode: number | null; skill?: string }
  | { type: 'dev_log'; bubbleId: string; role: 'main' | 'frontend' | 'backend'; chunk: string };

export type ClientAction =
  | { kind: 'open_bubble'; id: string; title: string; focus: boolean }
  | { kind: 'rename_bubble'; title: string }
  | { kind: 'close_bubble' };

type SdkMessage =
  | SdkSystemInit
  | SdkAssistant
  | SdkUserToolResult
  | SdkResult
  | { type: string; [k: string]: unknown };

type SdkSystemInit = {
  type: 'system';
  subtype: 'init';
  session_id?: string;
  model?: string;
  cwd?: string;
};

type SdkAssistant = {
  type: 'assistant';
  message: {
    id?: string;
    role: 'assistant';
    content: AssistantBlock[];
  };
};

type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking?: string };

type SdkUserToolResult = {
  type: 'user';
  message: {
    role: 'user';
    content: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string | Array<{ type: 'text'; text: string }>;
      is_error?: boolean;
    }>;
  };
};

type SdkResult = {
  type: 'result';
  subtype: string;
  total_cost_usd?: number;
  num_turns?: number;
};

export type SocketHandlers = {
  onSessionStarted?: (bubbleId: string, sessionId: string) => void;
  onAssistantTextDelta?: (bubbleId: string, assistantMessageId: string, text: string) => void;
  onToolUse?: (bubbleId: string, assistantMessageId: string, toolCall: ToolCall) => void;
  onToolResult?: (bubbleId: string, toolUseId: string, output: string, status: ToolCall['status']) => void;
  onDone?: (bubbleId: string) => void;
  onError?: (bubbleId: string | null, message: string) => void;
  onThinkingChange?: (bubbleId: string, thinking: boolean) => void;
  onExecutingChange?: (bubbleId: string, executing: boolean) => void;
  onPtyStatus?: (bubbleId: string, running: boolean) => void;
  onDevStatus?: (
    bubbleId: string,
    status: 'idle' | 'starting' | 'running' | 'stopped' | 'error',
    url: string,
    command: string,
    skill?: string,
    role?: 'main' | 'frontend' | 'backend',
  ) => void;
  onDevLog?: (
    bubbleId: string,
    role: 'main' | 'frontend' | 'backend',
    chunk: string,
  ) => void;
  onClientAction?: (sourceBubbleId: string, action: ClientAction) => void;
  onVoiceTranscribed?: (text: string) => void;
};

export type EcoSocket = {
  status: SocketStatus;
  error: string | null;
  send: (opts: { bubbleId: string; text: string; workspace?: string; resumeSessionId?: string | null }) => void;
  interrupt: () => void;
};

type Options = {
  url: string;
  token: string;
  handlers: SocketHandlers;
};

function toolResultText(content: SdkUserToolResult['message']['content'][number]['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => c.text ?? '').join('\n');
  return '';
}

export function useEcoSocket({ url, token, handlers }: Options): EcoSocket {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantedRef = useRef(true);
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  // bubble target del prompt activo + assistant message en curso para esa bubble
  const activeBubbleIdRef = useRef<string | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const toolToBubble = useRef<Map<string, string>>(new Map());

  // Coalesce de assistant text deltas. El SDK emite muchos deltas por segundo
  // durante streaming; un setState por delta hace que React re-renderice
  // ChatBubble + Markdown N veces/segundo. Acumulamos en una pendingMap y
  // flusheamos un solo onAssistantTextDelta por bubble+assistantId por frame.
  const pendingDeltasRef = useRef<Map<string, { bubbleId: string; assistantId: string; text: string }>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const flushDeltas = () => {
    rafIdRef.current = null;
    const pending = pendingDeltasRef.current;
    if (pending.size === 0) return;
    const H = handlersRef.current;
    for (const { bubbleId, assistantId, text } of pending.values()) {
      H.onAssistantTextDelta?.(bubbleId, assistantId, text);
    }
    pending.clear();
  };
  const scheduleDelta = (bubbleId: string, assistantId: string, text: string) => {
    const key = `${bubbleId}|${assistantId}`;
    const existing = pendingDeltasRef.current.get(key);
    if (existing) existing.text += text;
    else pendingDeltasRef.current.set(key, { bubbleId, assistantId, text });
    if (rafIdRef.current == null) {
      rafIdRef.current = typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(flushDeltas)
        : (setTimeout(flushDeltas, 16) as unknown as number);
    }
  };

  const handleSdkMessage = useCallback((sdk: SdkMessage) => {
    const bubbleId = activeBubbleIdRef.current;
    if (!bubbleId) return;
    const H = handlersRef.current;

    if (sdk.type === 'system') {
      const subtype = (sdk as SdkSystemInit).subtype;
      if (subtype === 'init') {
        const sessionId = (sdk as SdkSystemInit).session_id;
        if (sessionId) H.onSessionStarted?.(bubbleId, sessionId);
        H.onThinkingChange?.(bubbleId, true);
        currentAssistantIdRef.current = null;
      }
      return;
    }

    if (sdk.type === 'assistant') {
      const msg = (sdk as SdkAssistant).message;
      const assistantId =
        currentAssistantIdRef.current ?? msg.id ?? `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      currentAssistantIdRef.current = assistantId;

      for (const block of msg.content) {
        if (block.type === 'text') {
          scheduleDelta(bubbleId, assistantId, block.text);
        } else if (block.type === 'tool_use') {
          toolToBubble.current.set(block.id, bubbleId);
          H.onToolUse?.(bubbleId, assistantId, {
            id: block.id,
            name: block.name,
            input: block.input ?? {},
            status: 'running',
          });
          H.onExecutingChange?.(bubbleId, true);
        }
      }
      return;
    }

    if (sdk.type === 'user') {
      // Flushear deltas pendientes ANTES de emitir tool_result, así el usuario
      // ve el texto completo antes del output de la tool.
      flushDeltas();
      const results = (sdk as SdkUserToolResult).message.content.filter((c) => c.type === 'tool_result');
      for (const r of results) {
        const targetBubble = toolToBubble.current.get(r.tool_use_id) ?? bubbleId;
        const txt = toolResultText(r.content);
        const denied = /deshabilitado|denegada|policy|denied|no permitido|fuera del workspace/i.test(txt);
        const status: ToolCall['status'] = r.is_error ? 'error' : denied ? 'denied' : 'success';
        H.onToolResult?.(targetBubble, r.tool_use_id, txt, status);
      }
      H.onExecutingChange?.(bubbleId, false);
      return;
    }

    if (sdk.type === 'result') {
      flushDeltas();
      H.onThinkingChange?.(bubbleId, false);
      H.onExecutingChange?.(bubbleId, false);
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) {
      setError('Falta token (VITE_ECO_TOKEN)');
      setStatus('error');
      return;
    }
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);

    const wsUrl = url || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const finalUrl = wsUrl.startsWith('ws') ? wsUrl : wsUrl.replace(/^http/, 'ws') + (wsUrl.endsWith('/ws') ? '' : '/ws');
    const ws = new WebSocket(finalUrl, [`eco.token.${token}`]);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.type === 'sdk_message') handleSdkMessage(msg.message);
        else if (msg.type === 'client_action') {
          const src = activeBubbleIdRef.current;
          if (src) handlersRef.current.onClientAction?.(src, msg.action);
        }
        else if (msg.type === 'voice_transcribed') {
          handlersRef.current.onVoiceTranscribed?.(msg.text);
        }
        else if (msg.type === 'pty_status') {
          handlersRef.current.onPtyStatus?.(msg.bubbleId, msg.running);
        }
        else if (msg.type === 'dev_status') {
          handlersRef.current.onDevStatus?.(msg.bubbleId, msg.status, msg.url, msg.command, msg.skill, msg.role);
        }
        else if (msg.type === 'dev_log') {
          handlersRef.current.onDevLog?.(msg.bubbleId, msg.role, msg.chunk);
        }
        else if (msg.type === 'session_started') {
          // already handled in system init
        } else if (msg.type === 'done') {
          flushDeltas();
          const bubbleId = activeBubbleIdRef.current;
          if (bubbleId) {
            handlersRef.current.onThinkingChange?.(bubbleId, false);
            handlersRef.current.onExecutingChange?.(bubbleId, false);
            handlersRef.current.onDone?.(bubbleId);
          }
          currentAssistantIdRef.current = null;
          activeBubbleIdRef.current = null;
        } else if (msg.type === 'error') {
          flushDeltas();
          const localized = translateBackendError({ error: msg.code, message: msg.message }, msg.message);
          setError(localized);
          const bubbleId = activeBubbleIdRef.current;
          if (bubbleId) {
            handlersRef.current.onThinkingChange?.(bubbleId, false);
            handlersRef.current.onExecutingChange?.(bubbleId, false);
          }
          handlersRef.current.onError?.(bubbleId, localized);
          activeBubbleIdRef.current = null;
        }
      } catch (e) {
        console.warn('WS parse error', e);
      }
    };

    ws.onerror = () => setStatus('error');

    ws.onclose = () => {
      wsRef.current = null;
      const bubbleId = activeBubbleIdRef.current;
      if (bubbleId) {
        handlersRef.current.onThinkingChange?.(bubbleId, false);
        handlersRef.current.onExecutingChange?.(bubbleId, false);
      }
      activeBubbleIdRef.current = null;
      if (!wantedRef.current) { setStatus('disconnected'); return; }
      const attempt = Math.min(reconnectAttempt.current, RECONNECT_BACKOFF_MS.length - 1);
      const delay = RECONNECT_BACKOFF_MS[attempt]!;
      reconnectAttempt.current += 1;
      setStatus('disconnected');
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [handleSdkMessage, token, url]);

  useEffect(() => {
    wantedRef.current = true;
    connect();
    return () => {
      wantedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((opts: { bubbleId: string; text: string; workspace?: string; resumeSessionId?: string | null }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      handlersRef.current.onError?.(opts.bubbleId, translate('berr.not_connected', loadLang()));
      return;
    }
    activeBubbleIdRef.current = opts.bubbleId;
    currentAssistantIdRef.current = null;
    handlersRef.current.onThinkingChange?.(opts.bubbleId, true);
    setError(null);
    ws.send(JSON.stringify({
      type: 'prompt',
      text: opts.text,
      bubbleId: opts.bubbleId,
      ...(opts.workspace ? { workspace: opts.workspace } : {}),
      ...(opts.resumeSessionId ? { resumeSessionId: opts.resumeSessionId } : {}),
    }));
  }, []);

  const interrupt = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'interrupt' }));
  }, []);

  return { status, error, send, interrupt };
}
