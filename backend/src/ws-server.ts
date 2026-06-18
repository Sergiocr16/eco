import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { runAgent } from './agent.js';
import { ClientMessageSchema, type ServerMessage } from './protocol.js';
import type { ClientAction } from './agent-tools.js';
import { config, hostAllowed } from './config.js';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { ensureWorktree } from './worktree-manager.js';
import { verifyFirebaseIdToken } from './firebase-auth.js';
import { setMachineUser } from './machine-user.js';

// Rate limit POR USUARIO (multi-tenant) — reemplaza el contador global.
// Map userId → timestamps de prompts en el último minuto. Las conexiones sin
// userId (legacy / sin sesión) comparten el bucket '_anon'.
const promptTimestampsByUser = new Map<string, number[]>();

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
    let activeAbort: AbortController | null = null;
    let activeTimeout: NodeJS.Timeout | null = null;
    let activeQuery: Query | null = null;

    const send = (msg: ServerMessage) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > config.wsBackpressureBytes) {
        activeAbort?.abort();
        return;
      }
      ws.send(JSON.stringify(msg));
    };

    // Sincronizar al cliente nuevo con el estado actual (PTYs corriendo, etc.).
    for (const provider of snapshotProviders) {
      try { for (const msg of provider()) send(msg); } catch { /* noop */ }
    }

    const error = (code: string, message: string) =>
      send({ type: 'error', code, message });

    ws.on('message', async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString('utf-8'));
      } catch {
        return error('invalid_json', 'JSON inválido');
      }

      const result = ClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        return error('invalid_message', 'Mensaje no cumple el esquema');
      }
      const msg = result.data;

      if (msg.type === 'interrupt') {
        // 1) Pedir al SDK que corte limpio (cancela tool en curso, cierra stream).
        if (activeQuery?.interrupt) {
          try { await activeQuery.interrupt(); } catch { /* noop */ }
        }
        // 2) Forzar el abort del controller por si el SDK no responde.
        activeAbort?.abort();
        return;
      }

      if (activeAbort) {
        return error('busy', 'Ya hay un prompt en curso. Enviá interrupt primero.');
      }

      const now = Date.now();
      const bucketKey = connUserId ?? '_anon';
      const bucket = promptTimestampsByUser.get(bucketKey) ?? [];
      while (bucket.length > 0 && now - bucket[0]! > 60_000) bucket.shift();
      if (bucket.length > 1000) bucket.splice(0, bucket.length - 1000);
      if (bucket.length >= config.maxPromptsPerMinute) {
        promptTimestampsByUser.set(bucketKey, bucket);
        return error('rate_limit', `Rate limit: ${config.maxPromptsPerMinute} prompts/min`);
      }
      bucket.push(now);
      promptTimestampsByUser.set(bucketKey, bucket);

      const ac = new AbortController();
      activeAbort = ac;
      activeTimeout = setTimeout(() => ac.abort(), config.promptTimeoutMs);

      try {
        // Cada burbuja con un workspace git obtiene su propio worktree. Eso
        // mantiene aislados los cambios de varias conversaciones sobre el mismo repo.
        const effectiveWorkspace = (msg.bubbleId && msg.workspace)
          ? ensureWorktree(msg.bubbleId, msg.workspace)
          : msg.workspace;

        const q = runAgent({
          prompt: msg.text,
          workspace: effectiveWorkspace,
          abortController: ac,
          resumeSessionId: msg.resumeSessionId,
          ownerId: connUserId,
          onClientAction: (action) => send({ type: 'client_action', action }),
        });
        activeQuery = q;

        for await (const sdkMsg of q) {
          if (
            sdkMsg.type === 'system' &&
            'subtype' in sdkMsg &&
            sdkMsg.subtype === 'init' &&
            'session_id' in sdkMsg
          ) {
            send({ type: 'session_started', sessionId: sdkMsg.session_id as string });
          }
          send({ type: 'sdk_message', message: sdkMsg });
        }
        send({ type: 'done' });
      } catch (err) {
        const internalMessage = err instanceof Error ? err.message : 'desconocido';
        const code = sanitizeErrorCode(internalMessage);
        const safeMessage = sanitizeErrorMessage(code);
        console.error('[agent_failure]', internalMessage);
        error(code, safeMessage);
      } finally {
        if (activeTimeout) clearTimeout(activeTimeout);
        activeTimeout = null;
        activeAbort = null;
        activeQuery = null;
      }
    });

    ws.on('close', () => {
      if (activeTimeout) clearTimeout(activeTimeout);
      activeAbort?.abort();
      if (connUserId) {
        const set = wsByUser.get(connUserId);
        if (set) { set.delete(ws); if (set.size === 0) wsByUser.delete(connUserId); }
      }
    });
  });

  return wss;
}

// Devuelve un código estable de error para que el frontend lo traduzca.
function sanitizeErrorCode(internal: string): string {
  if (/workspace/i.test(internal)) return 'agent.workspace_denied';
  if (/aborted|abort/i.test(internal)) return 'agent.aborted';
  if (/permission|denied/i.test(internal)) return 'agent.permission_denied';
  if (/rate/i.test(internal)) return 'agent.rate_limit';
  return 'agent.unknown_failure';
}

function sanitizeErrorMessage(code: string): string {
  switch (code) {
    case 'agent.workspace_denied':  return 'Workspace no permitido o inválido.';
    case 'agent.aborted':           return 'Operación interrumpida o expiró.';
    case 'agent.permission_denied': return 'Acción denegada por política de seguridad.';
    case 'agent.rate_limit':        return 'Rate limit alcanzado.';
    default:                        return 'El agente no pudo completar la operación.';
  }
}

