import { useCallback, useEffect, useRef, useState } from 'react';
import type { SocketStatus } from '@/lib/types';
import { currentIdToken } from '@/lib/firebase';
import { emit as ecoEmit } from '@/lib/eco-bus';

const RECONNECT_BACKOFF_MS = [500, 1500, 3000, 5000, 10_000];

// `/ws` es solo server → cliente desde que se removió el tab de Conversación
// (era el único que mandaba `prompt`/`interrupt`). Ahora transporta estado:
// PTYs, dev servers, sync cross-device y las acciones del MCP server externo.
type ServerMsg =
  | { type: 'client_action'; action: ClientAction }
  | { type: 'pty_status'; bubbleId: string; running: boolean }
  | { type: 'pty_busy_change'; bubbleId: string; busy: boolean }
  | { type: 'dev_status'; bubbleId: string; role?: 'main' | 'frontend' | 'backend'; status: 'idle' | 'starting' | 'running' | 'stopped' | 'error'; port: number; url: string; command: string; exitCode: number | null; skill?: string }
  | { type: 'dev_log'; bubbleId: string; role: 'main' | 'frontend' | 'backend'; chunk: string }
  | { type: 'doc_updated'; key: string; value: unknown; updatedAt: number }
  | { type: 'doc_deleted'; key: string };

export type ClientAction = {
  kind: 'open_bubble';
  id: string;
  title: string;
  focus: boolean;
  workspace?: string;
  baseBranch?: string;
};

export type SocketHandlers = {
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
  onClientAction?: (action: ClientAction) => void;
};

export type EcoSocket = {
  status: SocketStatus;
  error: string | null;
};

type Options = {
  url: string;
  token: string;
  handlers: SocketHandlers;
};

export function useEcoSocket({ url, token, handlers }: Options): EcoSocket {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantedRef = useRef(true);
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);

    // El ID token de Firebase es asíncrono → lo resolvemos antes de abrir el WS.
    void (async () => {
    const idToken = await currentIdToken();
    if (!idToken) { setError('Sesión no iniciada'); setStatus('error'); return; }
    if (!wantedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const wsUrl = url || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const finalUrl = wsUrl.startsWith('ws') ? wsUrl : wsUrl.replace(/^http/, 'ws') + (wsUrl.endsWith('/ws') ? '' : '/ws');
    const protocols = [`eco.idtoken.${idToken}`];
    const ws = new WebSocket(finalUrl, protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.type === 'client_action') {
          handlersRef.current.onClientAction?.(msg.action);
        }
        else if (msg.type === 'pty_status') {
          handlersRef.current.onPtyStatus?.(msg.bubbleId, msg.running);
        }
        else if (msg.type === 'pty_busy_change') {
          // Re-emit por eco-bus para que cualquier componente reaccione
          // (indicador visual + opcionalmente desktop notification).
          try {
            window.dispatchEvent(new CustomEvent('eco:pty_busy_change', {
              detail: { bubbleId: msg.bubbleId, busy: msg.busy },
            }));
          } catch { /* noop */ }
        }
        else if (msg.type === 'dev_status') {
          handlersRef.current.onDevStatus?.(msg.bubbleId, msg.status, msg.url, msg.command, msg.skill, msg.role);
        }
        else if (msg.type === 'dev_log') {
          handlersRef.current.onDevLog?.(msg.bubbleId, msg.role, msg.chunk);
        }
        else if (msg.type === 'doc_updated') {
          ecoEmit('eco:doc_updated', { key: msg.key, value: msg.value, updatedAt: msg.updatedAt });
        }
        else if (msg.type === 'doc_deleted') {
          ecoEmit('eco:doc_deleted', { key: msg.key });
        }
      } catch (e) {
        console.warn('WS parse error', e);
      }
    };

    ws.onerror = () => setStatus('error');

    ws.onclose = () => {
      wsRef.current = null;
      if (!wantedRef.current) { setStatus('disconnected'); return; }
      const attempt = Math.min(reconnectAttempt.current, RECONNECT_BACKOFF_MS.length - 1);
      const delay = RECONNECT_BACKOFF_MS[attempt]!;
      reconnectAttempt.current += 1;
      setStatus('disconnected');
      reconnectTimer.current = setTimeout(connect, delay);
    };
    })();
  }, [token, url]);

  // Cierra el socket actual (aunque parezca OPEN — tras dormir queda "zombie")
  // y reconecta de cero.
  const forceReconnect = useCallback(() => {
    if (!wantedRef.current) return;
    reconnectAttempt.current = 0;
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    const ws = wsRef.current;
    wsRef.current = null;
    try { ws?.close(); } catch { /* noop */ }
    connect();
  }, [connect]);

  useEffect(() => {
    wantedRef.current = true;
    connect();
    return () => {
      wantedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Recuperación tras sleep/wake. Los timers de JS se pausan mientras la
  // máquina duerme; al despertar, un tick que debía caer cada 3s cae mucho
  // después → detectamos el "salto" y forzamos reconexión (el socket suele
  // quedar zombie: readyState OPEN pero muerto). Igual al volver online / foco.
  useEffect(() => {
    let last = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      const slept = now - last > 10_000;
      last = now;
      if (slept) forceReconnect();
    }, 3000);
    const onWake = () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) forceReconnect();
    };
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(iv);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [forceReconnect]);

  return { status, error };
}
