// Espejo del navegador de una bubble para clientes sin <webview> (iPad / web
// por la tailnet). El navegador que maneja el agente vive en la app de
// escritorio; acá se reparten sus frames (los manda el main de Electron por el
// puente) a quienes lo miran por `/ws/browser-view`, y se devuelve su mouse y
// teclado. El espejo solo corre mientras haya alguien mirando.

import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { config, hostAllowed } from './config.js';
import { verifyFirebaseIdToken } from './firebase-auth.js';
import { findBubble } from './bubbles-index.js';
import { bridgeNotify, browserBridgeConnected, setBridgeListeners } from './browser-bridge.js';
import { broadcastClientActionToUser, logUpgradeRejected, startHeartbeat, trackAlive } from './ws-server.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_VIEWERS = 24;
// Un cliente lento no acumula frames: se le salta hasta que drene.
const BACKLOG_MAX = 1_500_000;

type ReqWithUid = IncomingMessage & { ecoUid?: string };

const viewers = new Map<string, Set<WebSocket>>();
const lastFrame = new Map<string, string>();
const lastState = new Map<string, string>();

function idTokenFrom(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (!proto) return null;
  const parts = Array.isArray(proto) ? proto : proto.split(',').map((p) => p.trim());
  const entry = parts.find((p) => p.startsWith('eco.idtoken.'));
  return entry ? entry.slice('eco.idtoken.'.length) : null;
}

export function mirrorViewerCount(bubbleId: string): number {
  return viewers.get(bubbleId)?.size ?? 0;
}

function sendTo(ws: WebSocket, payload: string, droppable = false): void {
  if (ws.readyState !== ws.OPEN) return;
  if (droppable && ws.bufferedAmount > BACKLOG_MAX) return;
  try { ws.send(payload); } catch { /* el close limpia */ }
}

function fanOut(bubbleId: string, payload: string, droppable = false): void {
  const set = viewers.get(bubbleId);
  if (!set) return;
  for (const ws of set) sendTo(ws, payload, droppable);
}

function leave(bubbleId: string, ws: WebSocket): void {
  const set = viewers.get(bubbleId);
  if (!set) return;
  set.delete(ws);
  if (set.size > 0) return;
  viewers.delete(bubbleId);
  lastFrame.delete(bubbleId);
  lastState.delete(bubbleId);
  bridgeNotify({ type: 'mirror', bubbleId, on: false });
}

export function attachBrowserMirror(httpServer: Server): void {
  setBridgeListeners({
    event: (msg) => {
      const bubbleId = typeof msg.bubbleId === 'string' ? msg.bubbleId : '';
      if (!viewers.has(bubbleId)) return;
      if (msg.type === 'mirror_frame' && typeof msg.data === 'string') {
        const payload = JSON.stringify({ type: 'frame', tabId: msg.tabId ?? null, data: msg.data, w: msg.w, h: msg.h });
        lastFrame.set(bubbleId, payload);
        fanOut(bubbleId, payload, true);
      } else if (msg.type === 'mirror_state' && Array.isArray(msg.tabs)) {
        const payload = JSON.stringify({ type: 'state', desktop: true, tabs: msg.tabs });
        lastState.set(bubbleId, payload);
        fanOut(bubbleId, payload);
      }
    },
    // El main reconectó (Eco reiniciado): vuelve a pedir los espejos en curso.
    open: () => {
      for (const bubbleId of viewers.keys()) bridgeNotify({ type: 'mirror', bubbleId, on: true });
    },
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    handleProtocols: (protocols) => [...protocols].find((p) => p.startsWith('eco.idtoken.')) ?? false,
    verifyClient: (info, callback) => {
      if (!hostAllowed(info.req.headers.host)) return callback(false, 403, 'Host no permitido');
      const origin = info.req.headers.origin;
      if (origin && !config.allowedOrigins.includes(origin)) return callback(false, 403, 'Origin no permitido');
      if (wss.clients.size >= MAX_VIEWERS) {
        logUpgradeRejected('/ws/browser-view', 503, `${wss.clients.size} conexiones`);
        return callback(false, 503, 'ws.too_many_connections');
      }
      void verifyFirebaseIdToken(idTokenFrom(info.req)).then((verified) => {
        if (!verified) {
          logUpgradeRejected('/ws/browser-view', 401, 'token inválido');
          return callback(false, 401, 'http.unauthorized');
        }
        (info.req as ReqWithUid).ecoUid = verified.uid;
        callback(true);
      }).catch(() => callback(false, 401, 'http.unauthorized'));
    },
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws/browser-view') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  startHeartbeat(wss);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    trackAlive(ws);
    const uid = (req as ReqWithUid).ecoUid;
    const bubbleId = new URL(req.url || '/', 'http://x').searchParams.get('bubble') ?? '';
    const bubble = uid && ID_RE.test(bubbleId) ? findBubble(bubbleId, uid) : null;
    // Solo el dueño: lo que se ve y se teclea acá es su sesión del navegador.
    if (!uid || !bubble || bubble.ownerId !== uid) {
      ws.close(4403, 'bubble.not_owner');
      return;
    }
    let set = viewers.get(bubbleId);
    if (!set) { set = new Set(); viewers.set(bubbleId, set); }
    set.add(ws);

    if (!browserBridgeConnected()) {
      sendTo(ws, JSON.stringify({ type: 'state', desktop: false, tabs: [] }));
    } else {
      const state = lastState.get(bubbleId);
      const frame = lastFrame.get(bubbleId);
      if (state) sendTo(ws, state);
      if (frame) sendTo(ws, frame);
      // Siempre se pide: `mirror on` es idempotente y reenvía el estado actual.
      bridgeNotify({ type: 'mirror', bubbleId, on: true });
    }

    ws.on('message', (raw) => {
      let msg: { type?: unknown; event?: unknown; tabId?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'input' && msg.event && typeof msg.event === 'object') {
        bridgeNotify({ type: 'mirror_input', bubbleId, event: msg.event });
      } else if (msg.type === 'select' && typeof msg.tabId === 'string' && ID_RE.test(msg.tabId)) {
        broadcastClientActionToUser(uid, { kind: 'browser_tab', id: bubbleId, op: 'select', tabId: msg.tabId });
      } else if (msg.type === 'show') {
        // El escritorio tenía otra bubble a la vista: su webview no produce frames.
        broadcastClientActionToUser(uid, { kind: 'open_browser', id: bubbleId });
      }
    });

    ws.on('close', () => leave(bubbleId, ws));
  });
}
