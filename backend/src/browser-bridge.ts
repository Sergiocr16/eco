// Puente con el proceso principal de Electron para las tools browser_* del MCP.
// El main abre un WebSocket a `/ws/browser` autenticado con el token de máquina
// (~/.eco/token) y ejecuta las operaciones sobre los <webview> de cada bubble
// con `webContents.debugger` (electron/browser-automation.cjs). Sin ventana de
// Electron conectada (modo web o dev sin `dev:electron`) no hay navegador que
// controlar.

import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hostAllowed } from './config.js';
import { tokensMatch } from './auth.js';
import { logUpgradeRejected, startHeartbeat, trackAlive } from './ws-server.js';

const PROTO_PREFIX = 'eco.machine.';
// Capturas de página completa en PNG pueden pasar de 10 MB en base64.
const MAX_PAYLOAD = 40 * 1024 * 1024;

export class BrowserBridgeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: BrowserBridgeError) => void;
  timer: NodeJS.Timeout;
};

let bridge: WebSocket | null = null;
const pending = new Map<string, Pending>();

// Avisos del main sin id (frames y estado del espejo): los consume browser-mirror.ts.
type BridgeEvent = { type: string; bubbleId?: unknown; [k: string]: unknown };
let onEvent: (msg: BridgeEvent) => void = () => {};
let onOpen: () => void = () => {};

export function setBridgeListeners(l: { event: (msg: BridgeEvent) => void; open: () => void }): void {
  onEvent = l.event;
  onOpen = l.open;
}

export function bridgeNotify(msg: Record<string, unknown>): boolean {
  const ws = bridge;
  if (!ws || ws.readyState !== ws.OPEN) return false;
  try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
}

function failAll(code: string, message: string): void {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new BrowserBridgeError(code, message));
    pending.delete(id);
  }
}

function machineTokenFrom(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (!proto) return null;
  const parts = Array.isArray(proto) ? proto : proto.split(',').map((p) => p.trim());
  const entry = parts.find((p) => p.startsWith(PROTO_PREFIX));
  return entry ? entry.slice(PROTO_PREFIX.length) : null;
}

export function attachBrowserBridge(httpServer: Server, authToken: string): void {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    handleProtocols: (protocols) => [...protocols].find((p) => p.startsWith(PROTO_PREFIX)) ?? false,
    verifyClient: (info, callback) => {
      if (!hostAllowed(info.req.headers.host)) return callback(false, 403, 'Host no permitido');
      // Un navegador siempre manda Origin: solo el main de Electron llega sin él.
      if (info.req.headers.origin) {
        logUpgradeRejected('/ws/browser', 403, `origin ${info.req.headers.origin}`);
        return callback(false, 403, 'Origin no permitido');
      }
      if (!tokensMatch(authToken, machineTokenFrom(info.req))) {
        logUpgradeRejected('/ws/browser', 401, 'token de máquina inválido');
        return callback(false, 401, 'http.unauthorized');
      }
      callback(true);
    },
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws/browser') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  startHeartbeat(wss);

  wss.on('connection', (ws: WebSocket) => {
    trackAlive(ws);
    // Una sola ventana principal de Electron por backend: la nueva gana.
    if (bridge && bridge !== ws) {
      try { bridge.close(4000, 'reemplazado'); } catch { /* noop */ }
    }
    bridge = ws;
    console.log('[browser-bridge] Electron conectado');
    onOpen();

    ws.on('message', (raw) => {
      let msg: { id?: unknown; type?: unknown; ok?: unknown; result?: unknown; code?: unknown; message?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (typeof msg.id !== 'string') {
        if (typeof msg.type === 'string') onEvent(msg as BridgeEvent);
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok === true) p.resolve(msg.result);
      else p.reject(new BrowserBridgeError(String(msg.code ?? 'cdp_error'), String(msg.message ?? 'Error en el navegador')));
    });

    ws.on('close', () => {
      if (bridge !== ws) return;
      bridge = null;
      failAll('bridge_closed', 'Eco se cerró o se reinició mientras corría la operación.');
      console.log('[browser-bridge] Electron desconectado');
    });
  });
}

export function browserBridgeConnected(): boolean {
  return !!bridge && bridge.readyState === bridge.OPEN;
}

export function browserCall<T = unknown>(
  op: string,
  bubbleId: string,
  args: Record<string, unknown>,
  opts: { tabId?: string; timeoutMs?: number } = {},
): Promise<T> {
  const ws = bridge;
  if (!ws || ws.readyState !== ws.OPEN) {
    return Promise.reject(new BrowserBridgeError('unavailable', 'El navegador de Eco solo se controla con la app de escritorio abierta.'));
  }
  const id = randomBytes(8).toString('hex');
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new BrowserBridgeError('timeout', `El navegador no respondió a ${op} a tiempo.`));
    }, opts.timeoutMs ?? 30_000);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    try {
      ws.send(JSON.stringify({ id, op, bubbleId, tabId: opts.tabId, args }));
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      reject(new BrowserBridgeError('unavailable', 'No se pudo hablar con la app de escritorio.'));
    }
  });
}
