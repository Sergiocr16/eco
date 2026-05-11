import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message, SocketStatus, ToolCall } from '@/lib/types';

const RECONNECT_BACKOFF_MS = [500, 1500, 3000, 5000, 10_000];

type ServerMsg =
  | { type: 'sdk_message'; message: SdkMessage }
  | { type: 'session_started'; sessionId: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

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

export type EcoSocket = {
  status: SocketStatus;
  error: string | null;
  thinking: boolean;
  executing: boolean;
  messages: Message[];
  resetConversation: () => void;
  send: (text: string, workspace?: string) => void;
  interrupt: () => void;
};

type Options = {
  url: string;
  token: string;
  initialMessages?: Message[];
};

function toolResultText(content: SdkUserToolResult['message']['content'][number]['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => c.text ?? '').join('\n');
  return '';
}

export function useEcoSocket({ url, token, initialMessages = [] }: Options): EcoSocket {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantedRef = useRef(true);
  const toolMapRef = useRef<Map<string, { messageId: string; toolCallId: string }>>(new Map());
  const currentAssistantId = useRef<string | null>(null);

  const handleSdkMessage = useCallback((sdk: SdkMessage) => {
    if (sdk.type === 'system') {
      setExecuting(false);
      setThinking(true);
      currentAssistantId.current = null;
      return;
    }

    if (sdk.type === 'assistant') {
      const msg = (sdk as SdkAssistant).message;
      const blocks = msg.content;
      const textBlocks = blocks.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
      const toolUses = blocks.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use');
      const text = textBlocks.map((b) => b.text).join('');

      setMessages((prev) => {
        const next = [...prev];
        const existingIdx = currentAssistantId.current
          ? next.findIndex((m) => m.id === currentAssistantId.current)
          : -1;
        const assistantId = currentAssistantId.current ?? `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const existing = existingIdx >= 0 ? next[existingIdx]! : null;

        const merged: Message = {
          id: assistantId,
          role: 'assistant',
          text: existing ? (existing.text + text) : text,
          toolCalls: existing?.toolCalls ? [...existing.toolCalls] : [],
          createdAt: existing?.createdAt ?? Date.now(),
        };

        for (const tu of toolUses) {
          const tc: ToolCall = {
            id: tu.id,
            name: tu.name,
            input: tu.input ?? {},
            status: 'running',
          };
          merged.toolCalls = [...(merged.toolCalls ?? []), tc];
          toolMapRef.current.set(tu.id, { messageId: assistantId, toolCallId: tu.id });
        }

        if (existingIdx >= 0) next[existingIdx] = merged;
        else next.push(merged);

        currentAssistantId.current = assistantId;
        return next;
      });

      if (toolUses.length > 0) setExecuting(true);
      return;
    }

    if (sdk.type === 'user') {
      const userMsg = (sdk as SdkUserToolResult).message;
      const results = userMsg.content.filter((c) => c.type === 'tool_result');
      if (results.length === 0) return;

      setMessages((prev) => {
        const next = prev.map((m) => ({ ...m, toolCalls: m.toolCalls ? [...m.toolCalls] : undefined }));
        for (const r of results) {
          const ref = toolMapRef.current.get(r.tool_use_id);
          if (!ref) continue;
          const msgIdx = next.findIndex((m) => m.id === ref.messageId);
          if (msgIdx < 0) continue;
          const msg = next[msgIdx]!;
          const tcIdx = (msg.toolCalls ?? []).findIndex((t) => t.id === r.tool_use_id);
          if (tcIdx < 0) continue;
          const tc = msg.toolCalls![tcIdx]!;
          const outputText = toolResultText(r.content);
          const denied = /deshabilitado|denegada|policy|denied|no permitido|fuera del workspace/i.test(outputText);
          msg.toolCalls![tcIdx] = {
            ...tc,
            status: r.is_error ? 'error' : denied ? 'denied' : 'success',
            output: outputText,
          };
        }
        return next;
      });
      setExecuting(false);
      return;
    }

    if (sdk.type === 'result') {
      setThinking(false);
      setExecuting(false);
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
        else if (msg.type === 'session_started') {
          // metadata, ya manejado en system init
        } else if (msg.type === 'done') {
          setThinking(false);
          setExecuting(false);
          currentAssistantId.current = null;
        } else if (msg.type === 'error') {
          setError(msg.message);
          setThinking(false);
          setExecuting(false);
        }
      } catch (e) {
        console.warn('WS parse error', e);
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      wsRef.current = null;
      setThinking(false);
      setExecuting(false);
      if (!wantedRef.current) {
        setStatus('disconnected');
        return;
      }
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

  const send = useCallback((text: string, workspace?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('No conectado al backend');
      return;
    }
    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);
    setError(null);
    currentAssistantId.current = null;
    ws.send(JSON.stringify({ type: 'prompt', text, ...(workspace ? { workspace } : {}) }));
  }, []);

  const interrupt = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'interrupt' }));
  }, []);

  const resetConversation = useCallback(() => {
    setMessages([]);
    currentAssistantId.current = null;
    toolMapRef.current.clear();
  }, []);

  return {
    status,
    error,
    thinking,
    executing,
    messages,
    send,
    interrupt,
    resetConversation,
  };
}
