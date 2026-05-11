import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { runAgent } from './agent.js';
import { ClientMessageSchema, type ServerMessage } from './protocol.js';
import { config } from './config.js';
import { extractBearer, tokensMatch } from './auth.js';

const globalPromptTimestamps: number[] = [];

function hostAllowed(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0]?.toLowerCase();
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

export function attachWebSocket(httpServer: Server, authToken: string) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
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
        return callback(false, 401, 'No autorizado');
      }
      if (wss.clients.size >= config.maxOpenConnections) {
        return callback(false, 503, 'Demasiadas conexiones simultáneas');
      }
      callback(true);
    },
  });

  wss.on('connection', (ws) => {
    let activeAbort: AbortController | null = null;
    let activeTimeout: NodeJS.Timeout | null = null;

    const send = (msg: ServerMessage) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > config.wsBackpressureBytes) {
        activeAbort?.abort();
        return;
      }
      ws.send(JSON.stringify(msg));
    };

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
      if (globalPromptTimestamps.length >= config.maxPromptsPerMinute) {
        return error('rate_limit', `Rate limit: ${config.maxPromptsPerMinute} prompts/min (global)`);
      }
      globalPromptTimestamps.push(now);

      const ac = new AbortController();
      activeAbort = ac;
      activeTimeout = setTimeout(() => ac.abort(), config.promptTimeoutMs);

      try {
        const q = runAgent({
          prompt: msg.text,
          workspace: msg.workspace,
          abortController: ac,
          resumeSessionId: msg.resumeSessionId,
        });

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
        const safeMessage = sanitizeError(internalMessage);
        console.error('[agent_failure]', internalMessage);
        error('agent_failure', safeMessage);
      } finally {
        if (activeTimeout) clearTimeout(activeTimeout);
        activeTimeout = null;
        activeAbort = null;
      }
    });

    ws.on('close', () => {
      if (activeTimeout) clearTimeout(activeTimeout);
      activeAbort?.abort();
    });
  });

  return wss;
}

function sanitizeError(internal: string): string {
  if (/workspace/i.test(internal)) return 'Workspace no permitido o inválido.';
  if (/aborted|abort/i.test(internal)) return 'Operación interrumpida o expiró.';
  if (/permission|denied/i.test(internal)) return 'Acción denegada por política de seguridad.';
  if (/rate/i.test(internal)) return 'Rate limit alcanzado.';
  return 'El agente no pudo completar la operación.';
}

function extractToken(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (!proto) return null;
  const parts = Array.isArray(proto) ? proto : proto.split(',').map((p) => p.trim());
  const tokenEntry = parts.find((p) => p.startsWith('eco.token.'));
  return tokenEntry ? tokenEntry.slice('eco.token.'.length) : null;
}
