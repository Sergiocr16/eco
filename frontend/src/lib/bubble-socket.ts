// Handlers del WS que mutan el estado de los bubbles (PTY, dev server).
// Compartidos entre la ventana principal (Shell) y la ventana "solo bubble"
// (SoloBubbleShell) para que el flujo sea idéntico en ambas y no diverja.

import type { UseBubblesResult } from '@/hooks/useBubbles';
import { emit as ecoEmit } from './eco-bus';

type StreamHandlers = {
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
