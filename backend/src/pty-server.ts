import { WebSocketServer, type WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { config, isAllowedWorkspace, hostAllowed } from './config.js';
import { buildSafeEnv } from './security.js';
import { broadcastServerMessage, registerSnapshotProvider } from './ws-server.js';
import { ensureWorktree } from './worktree-manager.js';
import { githubEnvOverrides } from './github-runtime.js';
import { verifyFirebaseIdToken } from './firebase-auth.js';
import { setMachineUser } from './machine-user.js';

// uid resuelto en verifyClient (verificación async del ID token de Firebase).
type ReqWithUid = IncomingMessage & { ecoUid?: string };

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
  // Identificador del terminal dentro de la burbuja. "main" = el terminal
  // por defecto donde auto-arranca Claude CLI. Cualquier otro id = terminales
  // extra abiertos por el user (shells planos sin auto-claude).
  ptyId: string;
  // Dueño de la bubble (userId). Determina la identidad de git inyectada al
  // PTY y a quién se le emiten los pty_status (filtrado por usuario en F2).
  ownerId?: string;
  cwd: string;
  buffer: string;
  exited: boolean;
  // Set de WS clients atachados — multicast. Antes había un solo `activeWs`
  // que expulsaba al anterior al conectar uno nuevo, lo que rompía el flujo
  // de "skill click" cuando RealTerminal ya tenía su WS abierta: writeToBubblePty
  // abría otra y la primera se cerraba sin recibir más output. Ahora ambas
  // reciben el stream a la vez.
  clients: Set<WebSocket>;
  // Legacy/compat — el último WS en conectarse. Algunos lugares todavía
  // lo consultan; lo conservamos pero ya no es exclusivo.
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

// Key compuesto: `${bubbleId}:${ptyId}` — permite varios terminales por burbuja
// (uno "main" con Claude + N extras sin Claude). Para reattach, el WS pasa el
// `pty` query param; por compat, default = "main".
const sessions = new Map<string, PtySession>();
const sessionKey = (bubbleId: string, ptyId: string) => `${bubbleId}:${ptyId}`;

function hasRunningPtyForBubble(bubbleId: string): boolean {
  for (const s of sessions.values()) {
    if (s.bubbleId === bubbleId && !s.exited) return true;
  }
  return false;
}

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

// Mata TODAS las sesiones PTY de una burbuja (uso externo: al eliminar burbuja).
// Itera porque ahora puede haber varias (main + extras).
export function killBubblePty(bubbleId: string): boolean {
  let killed = false;
  for (const s of sessions.values()) {
    if (s.bubbleId !== bubbleId) continue;
    try { s.pty.kill(); killed = true; } catch { /* noop */ }
  }
  return killed;
}

// Mata UN terminal específico de una burbuja (cerrar pestaña extra).
export function killBubbleTerminal(bubbleId: string, ptyId: string): boolean {
  const s = sessions.get(sessionKey(bubbleId, ptyId));
  if (!s) return false;
  try { s.pty.kill(); } catch { /* noop */ }
  return true;
}

// Spawn server-side de un PTY para una burbuja sin necesitar cliente WS.
// Idempotente: si ya existe sesión activa para ese (bubbleId, 'main'), la
// reutiliza. Lo usa /bubble/create cuando viene `initialPrompt` para tener
// el PTY listo en background y dejar que el user descubra la conversación
// ya en marcha al clickear la bubble. broadcastPtyStatus avisa al frontend
// para que el dot de "PTY activo" se prenda en dock/dashboard.
export function ensureBubblePty(bubbleId: string, workspace: string, ownerId?: string): PtySession {
  const ptyId = 'main';
  const key = sessionKey(bubbleId, ptyId);
  const existing = sessions.get(key);
  if (existing && !existing.exited) return existing;

  const isolated = (bubbleId && workspace && isAllowedWorkspace(workspace, ownerId))
    ? ensureWorktree(bubbleId, workspace)
    : '';
  const candidateCwd = isolated
    || (workspace && isAllowedWorkspace(workspace, ownerId) ? workspace : (config.workspaces[0] ?? homedir()));
  const cwd = existsSync(candidateCwd) ? candidateCwd : homedir();

  const pty = ptySpawn(defaultShell(), [], {
    name: 'xterm-256color', cols: 120, rows: 30, cwd,
    // Inyectamos la identidad de git del DUEÑO de la bubble → commits/push
    // desde el terminal usan su PAT/nombre/email (no el del admin).
    env: buildSafeEnv({ TERM: 'xterm-256color', ...githubEnvOverrides(ownerId) }) as Record<string, string>,
  });

  const session: PtySession = {
    pty, bubbleId, ptyId, ownerId, cwd, buffer: '', exited: false,
    activeWs: null, clients: new Set(),
    lastOutputAt: Date.now(), busy: false,
  };
  sessions.set(key, session);

  const broadcastToClients = (msg: Record<string, unknown>) => {
    for (const c of session.clients) {
      try { sendJson(c, msg); } catch { /* noop */ }
    }
  };

  session.unsubData = pty.onData((data) => {
    appendBuffer(session, data);
    markBusy(session);
    broadcastToClients({ type: 'data', data });
  });
  startIdleScanner();
  session.unsubExit = pty.onExit(({ exitCode, signal }) => {
    session.exited = true;
    broadcastToClients({ type: 'exit', code: exitCode, signal });
    for (const c of session.clients) { try { c.close(1000, 'pty_exited'); } catch { /* noop */ } }
    sessions.delete(key);
    if (!hasRunningPtyForBubble(bubbleId)) broadcastPtyStatus(bubbleId, false);
  });

  broadcastPtyStatus(bubbleId, true);

  if (process.env.ECO_PTY_AUTOCLAUDE !== '0') {
    setTimeout(() => {
      if (session.exited) return;
      try { session.pty.write('claude\r'); } catch { /* noop */ }
    }, 350);
  }

  return session;
}

// Spawnea (o reusa) el PTY de la burbuja y le inyecta `text` como input del
// CLI. Si la sesión es fresca, espera `coldStartMs` para que zsh termine de
// exec'ear claude y claude imprima su prompt; sino, escribe casi inmediato.
// Fire-and-forget — para el flujo de /bubble/create con initialPrompt.
export function injectPromptToBubble(bubbleId: string, ownerId: string | undefined, workspace: string, text: string): void {
  const beforeKey = sessionKey(bubbleId, 'main');
  const wasExisting = !!sessions.get(beforeKey) && !sessions.get(beforeKey)!.exited;
  const session = ensureBubblePty(bubbleId, workspace, ownerId);
  // claude CLI cold start ~3-4 s desde el spawn (zsh exec + claude init).
  // Si la sesión ya existía, asumimos que claude está listo y vamos rápido.
  const delay = wasExisting ? 200 : 5000;
  setTimeout(() => {
    if (session.exited) return;
    // Texto y Enter en escrituras separadas con un gap. Si los mandamos en
    // un solo chunk (`text\r`), claude CLI a veces interpreta el `\r` como
    // newline dentro del input multilínea (estilo paste) y no submitea.
    // Dos writes con delay → primer write = "typing", segundo = "Enter".
    try { session.pty.write(text.replace(/\n/g, '\r')); } catch { /* noop */ }
    setTimeout(() => {
      if (session.exited) return;
      try { session.pty.write('\r'); } catch { /* noop */ }
    }, 250);
  }, delay);
}

// Lista de bubbleIds con PTY corriendo — para snapshot al conectar.
// Devuelve únicos: una burbuja con 3 terminales aparece una sola vez.
export function runningPtyBubbleIds(): string[] {
  const out = new Set<string>();
  for (const s of sessions.values()) {
    if (!s.exited) out.add(s.bubbleId);
  }
  return [...out];
}

// Devuelve el snapshot acumulado del ring buffer del PTY de una burbuja.
// Si la burbuja tiene varios terminales (default 'main' + extras), los
// concatena en orden de ptyId. Cap implícito en RING_BUFFER_MAX por
// sesión, así que el total acumulado es N * 128 KB.
export function getBubblePtyBuffer(bubbleId: string): string {
  const parts: Array<{ ptyId: string; buffer: string }> = [];
  for (const s of sessions.values()) {
    if (s.bubbleId !== bubbleId) continue;
    if (!s.buffer) continue;
    parts.push({ ptyId: s.ptyId, buffer: s.buffer });
  }
  if (parts.length === 0) return '';
  parts.sort((a, b) => a.ptyId.localeCompare(b.ptyId));
  if (parts.length === 1) return parts[0]!.buffer;
  return parts.map((p) => `=== terminal ${p.ptyId} ===\n${p.buffer}`).join('\n\n');
}

export function attachPtyServer(httpServer: Server, _authToken: string) {
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
      void verifyFirebaseIdToken(extractIdTokenFromProtocols(info.req.headers['sec-websocket-protocol'])).then((verified) => {
        if (!verified) return callback(false, 401, 'http.unauthorized');
        setMachineUser(verified.uid);
        (info.req as ReqWithUid).ecoUid = verified.uid;
        callback(true);
      }).catch(() => callback(false, 401, 'http.unauthorized'));
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
    // ptyId default = "main" para compat con writeToBubblePty (skill click,
    // remote control, etc.) que no especifica `pty` y esperan hablarle al
    // shell donde corre Claude.
    const rawPtyId = url.searchParams.get('pty') ?? '';
    const ptyId = sanitizePtyId(rawPtyId) || 'main';
    const noClaude = url.searchParams.get('noClaude') === '1';
    const requestedWs = url.searchParams.get('workspace') ?? '';
    // userId dueño de esta conexión (uid de Firebase, resuelto en verifyClient).
    const ownerId = (req as ReqWithUid).ecoUid;
    // Si la burbuja tiene workspace git, su shell vive dentro del worktree.
    const isolated = (bubbleId && requestedWs && isAllowedWorkspace(requestedWs, ownerId))
      ? ensureWorktree(bubbleId, requestedWs)
      : '';
    const candidateCwd =
      isolated
        ? isolated
        : (requestedWs && isAllowedWorkspace(requestedWs, ownerId))
          ? requestedWs
          : (config.workspaces[0] ?? homedir());
    // Garantía: si el cwd no existe en disco, caemos a $HOME. Sin esto, el
    // shell sale inmediatamente con code=1 (zsh: chdir failed).
    const cwd = existsSync(candidateCwd) ? candidateCwd : homedir();

    const cols = clampInt(url.searchParams.get('cols'), 24, 400, 100);
    const rows = clampInt(url.searchParams.get('rows'), 6, 200, 30);

    // ─── Reattach a una sesión existente ───────────────────────────────
    const existing = bubbleId ? sessions.get(sessionKey(bubbleId, ptyId)) : undefined;
    if (existing && !existing.exited) {
      // Multicast: agregamos el WS al set de clients. NO expulsamos al
      // anterior — varios clients pueden recibir el stream a la vez (ej.
      // RealTerminal + writeToBubblePty que dispara un skill).
      existing.clients.add(ws);
      existing.activeWs = ws;  // legacy ref — último que se conectó

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
        env: buildSafeEnv({ TERM: 'xterm-256color', ...githubEnvOverrides(ownerId) }) as Record<string, string>,
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
      ptyId,
      ownerId,
      cwd,
      buffer: '',
      exited: false,
      activeWs: ws,
      clients: new Set([ws]),
      lastOutputAt: Date.now(),
      busy: false,
    };
    if (bubbleId) {
      const wasFirst = !hasRunningPtyForBubble(bubbleId);
      sessions.set(sessionKey(bubbleId, ptyId), session);
      // pty_status es por-burbuja (no por-terminal): solo broadcast true en
      // el primer spawn; los terminales extra no cambian el estado del dot.
      if (wasFirst) broadcastPtyStatus(bubbleId, true);
    }

    // Multicast helpers: enviar a TODOS los clients atachados a la session.
    const broadcastToClients = (msg: Record<string, unknown>) => {
      for (const c of session.clients) {
        try { sendJson(c, msg); } catch { /* noop */ }
      }
    };

    // node-pty listeners (registrados una sola vez, no se desuscriben al cambiar de WS).
    session.unsubData = pty.onData((data) => {
      appendBuffer(session, data);
      markBusy(session);
      broadcastToClients({ type: 'data', data });
    });
    startIdleScanner();
    session.unsubExit = pty.onExit(({ exitCode, signal }) => {
      session.exited = true;
      broadcastToClients({ type: 'exit', code: exitCode, signal });
      for (const c of session.clients) {
        try { c.close(1000, 'pty_exited'); } catch { /* noop */ }
      }
      if (bubbleId) {
        sessions.delete(sessionKey(bubbleId, ptyId));
        // Solo broadcast false cuando se cierra el ÚLTIMO terminal de la
        // burbuja (los extras saliendo no apagan el indicador de Claude).
        if (!hasRunningPtyForBubble(bubbleId)) {
          broadcastPtyStatus(bubbleId, false);
        }
      }
    });

    sendJson(ws, { type: 'ready', cwd, shell: defaultShell(), cols, rows, reattached: false });
    attachWsHandlers(ws, session);

    // Auto-launch de Claude Code en cada PTY nuevo (no en reattaches).
    // Skip si el cliente pidió noClaude=1 (terminales extra del user) o si
    // ECO_PTY_AUTOCLAUDE=0 a nivel global.
    // Escribimos el comando con un pequeño delay para que zsh termine de imprimir
    // su prompt inicial primero — sino la entrada se pierde.
    // El usuario puede salir con `exit` o Ctrl-D y vuelve al shell normal.
    const autoClaude = !noClaude && process.env.ECO_PTY_AUTOCLAUDE !== '0';
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
      session.clients.delete(ws);
      if (session.activeWs === ws) session.activeWs = null;
    };
    ws.on('close', detach);
    ws.on('error', detach);
  }

  return wss;
}

// Solo letras, números, guiones y guiones bajos. Evita que un ptyId malicioso
// rompa el key compuesto (`:`) o el log. Trunca a 32 chars.
function sanitizePtyId(raw: string): string {
  return (raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

// El ID token de Firebase viaja como subprotocolo `eco.idtoken.<jwt>`.
function extractIdTokenFromProtocols(header: string | string[] | undefined): string | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join(',') : header;
  for (const p of raw.split(',').map((s) => s.trim())) {
    if (p.startsWith('eco.idtoken.')) return p.slice('eco.idtoken.'.length);
  }
  return null;
}
