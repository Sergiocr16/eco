import { useCallback, useEffect, useRef, useState } from 'react';
import type { SocketStatus } from '@/lib/types';
import { currentIdToken, hasSignedInUser } from '@/lib/firebase';
import { emit as ecoEmit } from '@/lib/eco-bus';

const RECONNECT_BACKOFF_MS = [500, 1500, 3000, 5000, 10_000];

// El server manda `heartbeat` cada 20 s. Si en 45 s no llegó NINGÚN frame, el
// socket está muerto aunque diga OPEN. Tras un sleep real / al volver a
// primer plano, con 30 s de silencio ya reconectamos sin esperar al tick.
const HEARTBEAT_STALE_MS = 45_000;
const WAKE_STALE_MS = 30_000;

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
  | { type: 'doc_deleted'; key: string }
  | { type: 'heartbeat' };

// Espejo de `backend/src/protocol.ts:ClientAction`. Las acciones las emite el
// MCP server externo (vía los endpoints `/bubble/*`) y las aplica la UI.
export type ClientAction =
  | {
    kind: 'open_bubble';
    id: string;
    title: string;
    focus: boolean;
    workspace?: string;
    baseBranch?: string;
  }
  | { kind: 'archive_bubble'; id: string }
  | { kind: 'delete_bubble'; id: string }
  | { kind: 'rename_bubble'; id: string; title: string }
  | { kind: 'focus_bubble'; id: string }
  | { kind: 'set_bubble_categories'; id: string; categoryIds: string[] };

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
  // `connect` espera el ID token antes de abrir el socket; mientras tanto no
  // hay `wsRef` y un segundo `connect` abriría otro socket en paralelo.
  const connectingRef = useRef(false);
  const lastFrameAt = useRef(Date.now());
  const connectRef = useRef<() => void>(() => { /* se asigna abajo */ });

  const scheduleReconnect = useCallback((delay: number) => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    const nextDelay = () => {
      const attempt = Math.min(reconnectAttempt.current, RECONNECT_BACKOFF_MS.length - 1);
      reconnectAttempt.current += 1;
      return RECONNECT_BACKOFF_MS[attempt]!;
    };
    if (!wantedRef.current) return;
    if (connectingRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    connectingRef.current = true;

    setStatus('connecting');
    setError(null);

    // El ID token de Firebase es asíncrono → lo resolvemos antes de abrir el WS.
    void (async () => {
    const idToken = await currentIdToken();
    connectingRef.current = false;
    if (!wantedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    if (!idToken) {
      // Sin red Firebase no puede renovar el token: no es "sin sesión", es
      // "todavía no". Reintentar con el mismo backoff.
      if (hasSignedInUser()) { setStatus('disconnected'); scheduleReconnect(nextDelay()); return; }
      setError('Sesión no iniciada'); setStatus('error'); return;
    }

    const wsUrl = url || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const finalUrl = wsUrl.startsWith('ws') ? wsUrl : wsUrl.replace(/^http/, 'ws') + (wsUrl.endsWith('/ws') ? '' : '/ws');
    const protocols = [`eco.idtoken.${idToken}`];
    let ws: WebSocket;
    try {
      ws = new WebSocket(finalUrl, protocols);
    } catch {
      setStatus('error');
      scheduleReconnect(nextDelay());
      return;
    }
    wsRef.current = ws;
    lastFrameAt.current = Date.now();

    // Cada handler comprueba que su socket siga siendo el vigente: el `onclose`
    // de un socket reemplazado NO debe pisar la referencia del nuevo ni
    // programar otra reconexión (así se fugaban sockets en cada "wake").
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      lastFrameAt.current = Date.now();
      setStatus('connected');
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return;
      lastFrameAt.current = Date.now();
      try {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.type === 'heartbeat') {
          // solo refresca lastFrameAt
        }
        else if (msg.type === 'client_action') {
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

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus('error');
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setStatus('disconnected');
      if (!wantedRef.current) return;
      scheduleReconnect(nextDelay());
    };
    })();
  }, [token, url, scheduleReconnect]);
  useEffect(() => { connectRef.current = connect; }, [connect]);

  // Suelta el socket actual (aunque parezca OPEN — tras dormir puede quedar
  // "zombie") y reconecta de cero. Neutraliza los handlers ANTES de cerrar para
  // que su `onclose` no programe nada.
  const forceReconnect = useCallback(() => {
    if (!wantedRef.current) return;
    reconnectAttempt.current = 0;
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null;
      try { ws.close(1000, 'replaced'); } catch { /* noop */ }
    }
    connect();
  }, [connect]);

  useEffect(() => {
    wantedRef.current = true;
    connect();
    return () => {
      wantedRef.current = false;
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null;
        try { ws.close(1000, 'unmount'); } catch { /* noop */ }
      }
    };
  }, [connect]);

  // Detección de socket muerto por SILENCIO del server (heartbeat), no por
  // saltos entre ticks: Chromium estrangula los timers de una ventana tapada o
  // minimizada (un tick cada minuto) y eso parecía "la máquina durmió" aunque
  // el socket a 127.0.0.1 estuviera perfecto — cada falsa alarma reconectaba.
  useEffect(() => {
    const check = (staleMs: number, wake: boolean) => {
      if (document.hidden || connectingRef.current) return;
      const ws = wsRef.current;
      if (!ws) {
        // Hay un backoff pendiente: al despertar no vale la pena esperarlo.
        if (wake && reconnectTimer.current) forceReconnect();
        return;
      }
      if (ws.readyState === WebSocket.CONNECTING) return;
      if (ws.readyState === WebSocket.OPEN && Date.now() - lastFrameAt.current < staleMs) return;
      forceReconnect();
    };
    let last = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      const slept = now - last > 10_000;
      last = now;
      check(slept ? WAKE_STALE_MS : HEARTBEAT_STALE_MS, slept);
    }, 3000);
    const onWake = () => check(WAKE_STALE_MS, true);
    const onVisible = () => { if (!document.hidden) onWake(); };
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [forceReconnect]);

  return { status, error };
}
