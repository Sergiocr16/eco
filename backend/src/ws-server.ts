import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import type { ClientAction, ServerMessage } from './protocol.js';
import { config, hostAllowed } from './config.js';
import { verifyFirebaseIdToken } from './firebase-auth.js';
import { setMachineUser } from './machine-user.js';

// El ID token de Firebase viaja como subprotocolo `eco.idtoken.<jwt>`. El JWT
// tiene puntos pero no comas, así que entra como una sola entrada del header.
function extractIdToken(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (!proto) return null;
  const parts = Array.isArray(proto) ? proto : proto.split(',').map((p) => p.trim());
  const entry = parts.find((p) => p.startsWith('eco.idtoken.'));
  return entry ? entry.slice('eco.idtoken.'.length) : null;
}

// uid resuelto en verifyClient (verificación async del JWT) y leído en 'connection'.
type ReqWithUid = IncomingMessage & { ecoUid?: string };

let broadcastFn: ((msg: ServerMessage) => void) | null = null;
let wssRef: WebSocketServer | null = null;

// Conexiones /ws indexadas por userId — para empujar el sync cross-device solo
// a los dispositivos del usuario dueño. Se puebla en 'connection' y se limpia
// en 'close'.
const wsByUser = new Map<string, Set<WebSocket>>();

export function broadcastServerMessage(msg: ServerMessage): void {
  broadcastFn?.(msg);
}

/** Empuja un mensaje SOLO a las conexiones del usuario dado (sus dispositivos). */
export function broadcastToUser(userId: string, msg: ServerMessage): void {
  const conns = wsByUser.get(userId);
  if (!conns) return;
  const data = JSON.stringify(msg);
  for (const client of conns) {
    if (client.readyState === client.OPEN) {
      try { client.send(data); } catch { /* noop */ }
    }
  }
}

// Broadcast tipado para client_action — usado por endpoints HTTP (ej.
// /bubble/create desde el MCP server) que necesitan inyectar acciones de
// frontend sin pasar por el agent loop. Wrapper sobre broadcastServerMessage.
export function broadcastClientAction(action: ClientAction): void {
  broadcastFn?.({ type: 'client_action', action });
}

// Devuelve cuántos clientes WS hay actualmente conectados al `/ws` (frontend
// del Electron app o el dev en :5173). Usado por /bubble/create para decidir
// si vale la pena disparar la acción o devolver `eco.no_clients`.
export function wsClientCount(): number {
  if (!wssRef) return 0;
  let n = 0;
  for (const c of wssRef.clients) {
    if (c.readyState === c.OPEN) n += 1;
  }
  return n;
}

// Snapshot opcional: cualquier módulo (pty-server, voice, …) registra un provider
// que se invoca al conectar un cliente nuevo para sincronizarlo con el estado actual.
type SnapshotProvider = () => ServerMessage[];
const snapshotProviders: SnapshotProvider[] = [];
export function registerSnapshotProvider(fn: SnapshotProvider) {
  snapshotProviders.push(fn);
}

export function attachWebSocket(httpServer: Server, _authToken: string) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 128 * 1024,
    handleProtocols: (protocols) => {
      const tokenProto = [...protocols].find((p) => p.startsWith('eco.idtoken.'));
      return tokenProto ?? false;
    },
    verifyClient: (info, callback) => {
      if (!hostAllowed(info.req.headers.host)) {
        return callback(false, 403, 'Host no permitido');
      }
      const origin = info.req.headers.origin;
      if (origin && !config.allowedOrigins.includes(origin)) {
        return callback(false, 403, 'Origin no permitido');
      }
      if (wss.clients.size >= config.maxOpenConnections) {
        return callback(false, 503, 'ws.too_many_connections');
      }
      // Verificación async del ID token de Firebase. El uid queda en req.ecoUid.
      void verifyFirebaseIdToken(extractIdToken(info.req)).then((verified) => {
        if (!verified) return callback(false, 401, 'http.unauthorized');
        setMachineUser(verified.uid);
        (info.req as ReqWithUid).ecoUid = verified.uid;
        callback(true);
      }).catch(() => callback(false, 401, 'http.unauthorized'));
    },
  });

  // Dispatch del 'upgrade' del HTTP server: solo manejamos /ws acá (sin trailing /pty u otros).
  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws') return; // dejamos que otros listeners (pty, etc.) lo manejen
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  broadcastFn = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        try { client.send(data); } catch { /* noop */ }
      }
    }
  };
  wssRef = wss;

  wss.on('connection', (ws, req: IncomingMessage) => {
    const connUserId = (req as ReqWithUid).ecoUid;
    if (connUserId) {
      let set = wsByUser.get(connUserId);
      if (!set) { set = new Set(); wsByUser.set(connUserId, set); }
      set.add(ws);
    }
    const send = (msg: ServerMessage) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > config.wsBackpressureBytes) return;
      ws.send(JSON.stringify(msg));
    };

    // Sincronizar al cliente nuevo con el estado actual (PTYs corriendo, etc.).
    for (const provider of snapshotProviders) {
      try { for (const msg of provider()) send(msg); } catch { /* noop */ }
    }

    // `/ws` es solo server → cliente. Cualquier frame entrante se ignora.

    ws.on('close', () => {
      if (connUserId) {
        const set = wsByUser.get(connUserId);
        if (set) { set.delete(ws); if (set.size === 0) wsByUser.delete(connUserId); }
      }
    });
  });

  return wss;
}

