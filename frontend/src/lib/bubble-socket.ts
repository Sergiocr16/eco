// Handlers del WS que mutan el estado de los bubbles (streaming del agente,
// status, dev server). Compartidos entre la ventana principal (Shell) y la
// ventana "solo bubble" (SoloBubbleShell) para que el flujo de chat/terminal
// sea idéntico en ambas y no diverja.

import type { Message, ToolCall, BubbleStatus } from './types';
import type { UseBubblesResult } from '@/hooks/useBubbles';
import { emit as ecoEmit } from './eco-bus';

type StreamHandlers = {
  onSessionStarted: (bubbleId: string, sessionId: string) => void;
  onAssistantTextDelta: (bubbleId: string, assistantMessageId: string, text: string) => void;
  onToolUse: (bubbleId: string, assistantMessageId: string, toolCall: ToolCall) => void;
  onToolResult: (bubbleId: string, toolUseId: string, output: string, status: ToolCall['status']) => void;
  onThinkingChange: (bubbleId: string, thinking: boolean) => void;
  onExecutingChange: (bubbleId: string, executing: boolean) => void;
  onDone: (bubbleId: string) => void;
  onPtyStatus: (bubbleId: string, running: boolean) => void;
  onDevStatus: (
    bubbleId: string,
    status: 'idle' | 'starting' | 'running' | 'stopped' | 'error',
    url: string,
    command: string,
    skill?: string,
    role?: 'main' | 'frontend' | 'backend',
  ) => void;
  onDevLog: (bubbleId: string, role: 'main' | 'frontend' | 'backend', chunk: string) => void;
};

export function bubbleStreamHandlers(bubbles: UseBubblesResult): StreamHandlers {
  return {
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
    onPtyStatus: (bubbleId, running) => {
      bubbles.setBubblePtyOpen(bubbleId, running);
    },
    onDevStatus: (bubbleId, status, url, command, skill, role) => {
      ecoEmit('eco:dev_status', { bubbleId, role, status, url, command, ...(skill ? { skill } : {}) });
    },
    onDevLog: (bubbleId, role, chunk) => {
      ecoEmit('eco:dev_log', { bubbleId, role, chunk });
    },
  };
}
