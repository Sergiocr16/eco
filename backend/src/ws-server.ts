import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';

type Server = HttpServer | HttpsServer;
import { runAgent } from './agent.js';
import { ClientMessageSchema, type ServerMessage } from './protocol.js';
import { config } from './config.js';
import { extractBearer, tokensMatch } from './auth.js';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { ensureWorktree } from './worktree-manager.js';

const globalPromptTimestamps: number[] = [];

function hostAllowed(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0]?.toLowerCase();
  if (!hostname) return false;
  return config.allowedHostnames.includes(hostname);
}

let broadcastFn: ((msg: ServerMessage) => void) | null = null;

export function broadcastServerMessage(msg: ServerMessage): void {
  broadcastFn?.(msg);
}

// Snapshot opcional: cualquier módulo (pty-server, voice, …) registra un provider
// que se invoca al conectar un cliente nuevo para sincronizarlo con el estado actual.
type SnapshotProvider = () => ServerMessage[];
const snapshotProviders: SnapshotProvider[] = [];
export function registerSnapshotProvider(fn: SnapshotProvider) {
  snapshotProviders.push(fn);
}

export function attachWebSocket(httpServer: Server, authToken: string) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 128 * 1024,
    handleProtocols: (protocols) => {
      const tokenProto = [...protocols].find((p) => p.startsWith('eco.token.'));
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
      const token =
        extractBearer(info.req.headers['authorization'] as string | undefined) ??
        extractToken(info.req);
      if (!tokensMatch(authToken, token)) {
        return callback(false, 401, 'http.unauthorized');
      }
      if (wss.clients.size >= config.maxOpenConnections) {
        return callback(false, 503, 'ws.too_many_connections');
      }
      callback(true);
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

  wss.on('connection', (ws) => {
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
      while (globalPromptTimestamps.length > 0 && now - globalPromptTimestamps[0]! > 60_000) {
        globalPromptTimestamps.shift();
      }
      // Defensa contra crecimiento patológico: si por alguna razón el shift por
      // tiempo no alcanzó, capamos el array a 1000 entries (basta para todo el
      // rate-limiting). Defensa pura — no debería dispararse en uso normal.
      if (globalPromptTimestamps.length > 1000) {
        globalPromptTimestamps.splice(0, globalPromptTimestamps.length - 1000);
      }
      if (globalPromptTimestamps.length >= config.maxPromptsPerMinute) {
        return error('rate_limit', `Rate limit: ${config.maxPromptsPerMinute} prompts/min (global)`);
      }
      globalPromptTimestamps.push(now);

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

function extractToken(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (!proto) return null;
  const parts = Array.isArray(proto) ? proto : proto.split(',').map((p) => p.trim());
  const tokenEntry = parts.find((p) => p.startsWith('eco.token.'));
  return tokenEntry ? tokenEntry.slice('eco.token.'.length) : null;
}
