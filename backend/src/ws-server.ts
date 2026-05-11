import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { runAgent } from './agent.js';
import { ClientMessageSchema, type ServerMessage } from './protocol.js';
import { config } from './config.js';
import { extractBearer, tokensMatch } from './auth.js';

export function attachWebSocket(httpServer: Server, authToken: string) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 1024 * 1024,
    verifyClient: (info, callback) => {
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
      callback(true);
    },
  });

  wss.on('connection', (ws) => {
    let activeAbort: AbortController | null = null;
    const promptTimestamps: number[] = [];

    const send = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    const error = (code: string, message: string) => send({ type: 'error', code, message });

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
      while (promptTimestamps.length > 0 && now - promptTimestamps[0]! > 60_000) {
        promptTimestamps.shift();
      }
      if (promptTimestamps.length >= config.maxPromptsPerMinute) {
        return error('rate_limit', `Rate limit: ${config.maxPromptsPerMinute} prompts/min`);
      }
      promptTimestamps.push(now);

      const ac = new AbortController();
      activeAbort = ac;

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
        const message = err instanceof Error ? err.message : 'Error desconocido';
        error('agent_failure', message);
      } finally {
        activeAbort = null;
      }
    });

    ws.on('close', () => {
      activeAbort?.abort();
    });
  });

  return wss;
}

function extractToken(req: IncomingMessage): string | null {
  const proto = req.headers['sec-websocket-protocol'];
  if (!proto) return null;
  const parts = Array.isArray(proto) ? proto : proto.split(',').map((p) => p.trim());
  const tokenEntry = parts.find((p) => p.startsWith('eco.token.'));
  return tokenEntry ? tokenEntry.slice('eco.token.'.length) : null;
}
