import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { config, isAllowedWorkspace } from './config.js';
import { extractBearer, tokensMatch } from './auth.js';
import { buildSafeEnv } from './security.js';
import { broadcastServerMessage, registerSnapshotProvider } from './ws-server.js';
import { ensureWorktree } from './worktree-manager.js';

function hostAllowed(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0]?.toLowerCase();
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

function defaultShell(): string {
  return process.env.SHELL || (existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash');
}

type PtyInput =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ping' };

const RING_BUFFER_MAX = 128 * 1024; // 128KB de output replayable al reconectar

type PtySession = {
  pty: IPty;
  bubbleId: string;
  cwd: string;
  buffer: string;
  exited: boolean;
  // WS actualmente conectado al PTY (puede ser null si el usuario salió de la burbuja).
  activeWs: WebSocket | null;
  // Listeners de node-pty, registrados una sola vez por sesión.
  unsubData?: { dispose: () => void };
  unsubExit?: { dispose: () => void };
  // Detección de "Claude está trabajando vs idle" — basada en inactividad
  // del output del PTY. Cuando hay output reciente → busy. Cuando pasa
  // BUSY_IDLE_MS sin output → idle, broadcast event para notificar al user.
  lastOutputAt: number;
  busy: boolean;
};

const sessions = new Map<string, PtySession>();

// Threshold de inactividad para considerar que Claude terminó. Trade-off:
// muy corto = falsos positivos durante streaming lento; muy largo = la
// notificación tarda. 1.5 s en práctica funciona bien para Claude CLI.
const BUSY_IDLE_MS = 1500;

function broadcastPtyStatus(bubbleId: string, running: boolean) {
  if (!bubbleId) return;
  try {
    broadcastServerMessage({ type: 'pty_status', bubbleId, running });
  } catch { /* noop */ }
}

function broadcastPtyBusy(bubbleId: string, busy: boolean) {
  if (!bubbleId) return;
  try {
    broadcastServerMessage({ type: 'pty_busy_change', bubbleId, busy });
  } catch { /* noop */ }
}

function markBusy(s: PtySession) {
  s.lastOutputAt = Date.now();
  if (!s.busy) {
    s.busy = true;
    broadcastPtyBusy(s.bubbleId, true);
  }
}

// Poller global: cada 500 ms revisa todas las sessions y transiciona
// busy → idle si pasó BUSY_IDLE_MS sin output nuevo. Único timer para
// no spamear setTimeout por sesión.
let idleTimer: NodeJS.Timeout | null = null;
function startIdleScanner() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) {
      if (!s.busy || s.exited) continue;
      if (now - s.lastOutputAt >= BUSY_IDLE_MS) {
        s.busy = false;
        broadcastPtyBusy(s.bubbleId, false);
      }
    }
  }, 500);
  idleTimer.unref?.();
}

function appendBuffer(s: PtySession, data: string) {
  s.buffer = (s.buffer + data).slice(-RING_BUFFER_MAX);
}

function sendJson(ws: WebSocket | null, obj: unknown) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch { /* noop */ }
}

// Mata la sesión PTY de una burbuja (uso externo: al eliminar burbuja).
export function killBubblePty(bubbleId: string): boolean {
  const s = sessions.get(bubbleId);
  if (!s) return false;
  try { s.pty.kill(); } catch { /* noop */ }
  return true;
}

// Lista de bubbleIds con PTY corriendo — para snapshot al conectar.
export function runningPtyBubbleIds(): string[] {
  const out: string[] = [];
  for (const [id, s] of sessions) {
    if (!s.exited) out.push(id);
  }
  return out;
}

export function attachPtyServer(httpServer: Server, authToken: string) {
  // Snapshot: cuando un cliente nuevo se conecta al /ws principal, recibe
  // un pty_status=true por cada PTY corriendo. Así sobrevive reload de UI.
  registerSnapshotProvider(() =>
    runningPtyBubbleIds().map((bubbleId) => ({
      type: 'pty_status' as const,
      bubbleId,
      running: true,
    })),
  );

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
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
        extractTokenFromProtocols(info.req.headers['sec-websocket-protocol']);
      if (!tokensMatch(authToken, token)) {
        return callback(false, 401, 'http.unauthorized');
      }
      if (wss.clients.size >= config.maxOpenConnections) {
        return callback(false, 503, 'ws.too_many_connections');
      }
      callback(true);
    },
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws/pty') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '/ws/pty', 'http://localhost');
    const bubbleId = url.searchParams.get('bubble') ?? '';
    const requestedWs = url.searchParams.get('workspace') ?? '';
    // Si la burbuja tiene workspace git, su shell vive dentro del worktree.
    const isolated = (bubbleId && requestedWs && isAllowedWorkspace(requestedWs))
      ? ensureWorktree(bubbleId, requestedWs)
      : '';
    const candidateCwd =
      isolated
        ? isolated
        : (requestedWs && isAllowedWorkspace(requestedWs))
          ? requestedWs
          : (config.workspaces[0] ?? homedir());
    // Garantía: si el cwd no existe en disco, caemos a $HOME. Sin esto, el
    // shell sale inmediatamente con code=1 (zsh: chdir failed).
    const cwd = existsSync(candidateCwd) ? candidateCwd : homedir();

    const cols = clampInt(url.searchParams.get('cols'), 24, 400, 100);
    const rows = clampInt(url.searchParams.get('rows'), 6, 200, 30);

    // ─── Reattach a una sesión existente ───────────────────────────────
    const existing = bubbleId ? sessions.get(bubbleId) : undefined;
    if (existing && !existing.exited) {
      // Desconectar al WS anterior (si lo hay) — un PTY a la vez por simplicidad.
      if (existing.activeWs && existing.activeWs !== ws) {
        try { existing.activeWs.close(1000, 'replaced_by_new_client'); } catch { /* noop */ }
      }
      existing.activeWs = ws;

      // Ajustar dimensiones al cliente actual.
      try { existing.pty.resize(cols, rows); } catch { /* noop */ }

      sendJson(ws, { type: 'ready', cwd: existing.cwd, shell: defaultShell(), cols, rows, reattached: true });
      // Replay del buffer acumulado mientras estuviste fuera.
      if (existing.buffer) {
        sendJson(ws, { type: 'data', data: existing.buffer });
      }
      // Re-broadcast del status: si el frontend perdió el evento original
      // (reload, navegación), esto le devuelve la verdad.
      broadcastPtyStatus(bubbleId, true);

      attachWsHandlers(ws, existing);
      return;
    }

    // ─── Spawn nuevo ───────────────────────────────────────────────────
    let pty: IPty;
    try {
      pty = ptySpawn(defaultShell(), [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: buildSafeEnv({ TERM: 'xterm-256color' }) as Record<string, string>,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'pty spawn failed';
      sendJson(ws, { type: 'error', message: msg });
      ws.close(1011, 'pty_spawn_failed');
      return;
    }

    const session: PtySession = {
      pty,
      bubbleId,
      cwd,
      buffer: '',
      exited: false,
      activeWs: ws,
      lastOutputAt: Date.now(),
      busy: false,
    };
    if (bubbleId) {
      sessions.set(bubbleId, session);
      broadcastPtyStatus(bubbleId, true);
    }

    // node-pty listeners (registrados una sola vez, no se desuscriben al cambiar de WS).
    session.unsubData = pty.onData((data) => {
      appendBuffer(session, data);
      markBusy(session);
      sendJson(session.activeWs, { type: 'data', data });
    });
    startIdleScanner();
    session.unsubExit = pty.onExit(({ exitCode, signal }) => {
      session.exited = true;
      sendJson(session.activeWs, { type: 'exit', code: exitCode, signal });
      try { session.activeWs?.close(1000, 'pty_exited'); } catch { /* noop */ }
      if (bubbleId) {
        sessions.delete(bubbleId);
        broadcastPtyStatus(bubbleId, false);
      }
    });

    sendJson(ws, { type: 'ready', cwd, shell: defaultShell(), cols, rows, reattached: false });
    attachWsHandlers(ws, session);

    // Auto-launch de Claude Code en cada PTY nuevo (no en reattaches).
    // Escribimos el comando con un pequeño delay para que zsh termine de imprimir
    // su prompt inicial primero — sino la entrada se pierde.
    // El usuario puede salir con `exit` o Ctrl-D y vuelve al shell normal.
    const autoClaude = process.env.ECO_PTY_AUTOCLAUDE !== '0';
    if (autoClaude) {
      setTimeout(() => {
        if (session.exited) return;
        try { session.pty.write('claude\r'); } catch { /* noop */ }
      }, 350);
    }
  });

  function attachWsHandlers(ws: WebSocket, session: PtySession) {
    ws.on('message', (raw) => {
      let msg: PtyInput;
      try { msg = JSON.parse(raw.toString()) as PtyInput; } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'input' && typeof msg.data === 'string') {
        try { session.pty.write(msg.data); } catch { /* noop */ }
      } else if (msg.type === 'resize') {
        const c = clampInt(msg.cols, 24, 400, 100);
        const r = clampInt(msg.rows, 6, 200, 30);
        try { session.pty.resize(c, r); } catch { /* noop */ }
      }
      // 'ping' → no-op; keep-alive del cliente
    });

    const detach = () => {
      // No matamos el PTY: queda corriendo y vamos buffereando el output.
      // Solo limpiamos la referencia al WS si este era el activo.
      if (session.activeWs === ws) session.activeWs = null;
    };
    ws.on('close', detach);
    ws.on('error', detach);
  }

  return wss;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function extractTokenFromProtocols(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined;
  const raw = Array.isArray(header) ? header.join(',') : header;
  for (const p of raw.split(',').map((s) => s.trim())) {
    if (p.startsWith('eco.token.')) return p.slice('eco.token.'.length);
  }
  return undefined;
}
