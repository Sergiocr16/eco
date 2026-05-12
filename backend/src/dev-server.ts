// Manager de dev-servers por agente (burbuja).
//
// Cada agente puede tener UN proceso de "servidor de desarrollo" corriendo en
// background. El backend:
//
// - Asigna un puerto libre automático (net.createServer.listen(0))
// - Le pregunta a Claude (`claude -p`) cuál es el comando si no se especifica
// - Spawnea bajo `bash -lc` con `PORT=<port>` env (+ otras pistas) en el worktree
// - Captura stdout/stderr en un ring buffer
// - Heurística para marcar "running" (matchea Local|listening|ready|server on)
// - Broadcastea cambios de estado al frontend para que el iframe navegue solo
//
// Limitaciones conocidas:
// - Si el framework ignora PORT (raros, e.g., algunos scripts custom), el server
//   abre el puerto que tenga hardcoded. El usuario puede editar el comando.
// - El proceso es child del backend; al matar el backend, los servers mueren.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { existsSync, symlinkSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { buildSafeEnv } from './security.js';
import { broadcastServerMessage, registerSnapshotProvider } from './ws-server.js';

export type DevStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

type Session = {
  bubbleId: string;
  workspace: string;
  command: string;
  port: number;
  url: string;
  proc: ChildProcess | null;
  // Process group ID. Cuando spawneamos con `detached: true`, el child se
  // convierte en el líder de su propio process group y su pgid === proc.pid.
  // Usamos esto para matar TODA la descendencia con `process.kill(-pgid, …)`.
  pgid: number | null;
  status: DevStatus;
  output: string;            // ring buffer
  startedAt: number | null;
  exitCode: number | null;
  exitedAt: number | null;
  // Cuántas veces auto-reintentamos por conflicto de puerto. Cap a 2 para evitar loops.
  retries: number;
  // Si la session se administra vía un skill de Claude (modo recomendado),
  // guardamos su nombre. Para stop/restart se invoca el mismo skill.
  skill?: string;
};

const BUFFER_MAX = 64 * 1024;  // 64KB por server
const sessions = new Map<string, Session>();

function broadcastStatus(s: Session) {
  try {
    broadcastServerMessage({
      type: 'dev_status',
      bubbleId: s.bubbleId,
      status: s.status,
      port: s.port,
      url: s.url,
      command: s.command,
      exitCode: s.exitCode,
      ...(s.skill ? { skill: s.skill } : {}),
    });
  } catch { /* noop */ }
}

function appendOutput(s: Session, chunk: string) {
  s.output = (s.output + chunk).slice(-BUFFER_MAX);
}

// ─── Cleanup robusto del server ───────────────────────────────────────────
// Problema típico: `spawn('bash', ['-c', cmd])` crea bash + sus hijos. Al
// hacer kill al `bash`, los hijos (gulp, vite, java, etc.) quedan HUÉRFANOS
// con el puerto tomado. Solución: process group con `detached: true` y luego
// `process.kill(-pgid, SIG)` mata el grupo entero (padre + descendencia).
//
// Defensa adicional: si después del kill el puerto sigue tomado por algo
// (p.ej. un worker que sobrevivió porque hace setsid o se daemonizó), lo
// matamos con `lsof -ti :<port> | xargs kill -9`.

function killProcessGroup(pgid: number, signal: NodeJS.Signals): boolean {
  try {
    // `-pgid` (negativo) le dice a kill que mate todo el process group.
    process.kill(-pgid, signal);
    return true;
  } catch {
    // ESRCH si ya está muerto, EPERM si no tenemos permiso — ambos OK.
    return false;
  }
}

/** PIDs que están bindeando el puerto (lsof). Vacío si está libre. */
function pidsHoldingPort(port: number): number[] {
  try {
    const r = spawnSync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], {
      timeout: 1500, encoding: 'utf-8',
    });
    if (r.status !== 0) return [];
    return r.stdout.split(/\s+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
  } catch { return []; }
}

/**
 * Asegura que el puerto quede LIBRE.
 * Estrategia: SIGTERM al grupo → espera 2.5s → si sigue colgado, busca PIDs
 * bindeados al puerto y los mata uno por uno con SIGKILL. Si después de 5s
 * total el puerto sigue ocupado, devuelve error con los PIDs que sobreviven.
 */
async function ensurePortFree(port: number, pgid: number | null): Promise<{ ok: true } | { ok: false; pids: number[] }> {
  if (pgid && pgid > 0) {
    killProcessGroup(pgid, 'SIGTERM');
  }
  // Poll: cada 250ms hasta 2.5s o hasta que el puerto esté libre.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (pidsHoldingPort(port).length === 0) return { ok: true };
  }
  // SIGKILL al grupo (si todavía existe).
  if (pgid && pgid > 0) killProcessGroup(pgid, 'SIGKILL');
  // Adicionalmente, matamos cualquier PID que esté bindeando el puerto.
  // Esto cubre procesos que se daemonizaron a otro grupo.
  const stuckPids = pidsHoldingPort(port);
  for (const pid of stuckPids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
  }
  // Una pasada final de poll: 2.5s más.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (pidsHoldingPort(port).length === 0) return { ok: true };
  }
  return { ok: false, pids: pidsHoldingPort(port) };
}

/** Reserva un puerto libre pidiéndole al OS uno random (puerto 0). */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

/** Llama a `claude -p` para que infiera el comando del dev server. */
function suggestDevCommand(workspace: string): { ok: boolean; command: string; error?: string } {
  const prompt = [
    'Necesito el comando exacto para arrancar el servidor de desarrollo de este proyecto.',
    'IMPORTANTE: la variable de entorno PORT ya estará seteada cuando se ejecute el comando.',
    'Tu objetivo es asegurarte de que el servidor escuche en $PORT, NO en un puerto hardcoded.',
    '',
    'PASOS:',
    '1. Examiná package.json, gulpfile, webpack.config, application.properties, etc. para ver qué dev server tiene el repo.',
    '2. Si el framework respeta PORT automáticamente (Node, Next.js, CRA, Vite con PORT env, etc.) → solo el comando normal.',
    '3. Si NO la respeta y el puerto está hardcoded en un archivo de config (gulpfile, webpack.config, browser-sync config, application.properties, server.js, etc.):',
    '   a. EDITÁ ese archivo: reemplazá el puerto literal por una lectura de process.env.PORT (o equivalente en el lenguaje). Por ejemplo:',
    '      - JS: `process.env.PORT || 9000` en lugar de `9000`',
    '      - properties: `server.port=${PORT:8080}` en lugar de `server.port=8080`',
    '   b. Estamos en un git worktree por agente, así que estos edits NO afectan al repo padre — son seguros.',
    '4. Si el framework acepta flag CLI (--port, -p, -Dserver.port), pasalo: `npm run dev -- --port $PORT`, `./mvnw spring-boot:run -Dserver.port=$PORT`, etc.',
    '',
    'EJEMPLOS VÁLIDOS:',
    '  - npm run dev',
    '  - npm run dev -- --port $PORT',
    '  - ./mvnw spring-boot:run -Dserver.port=$PORT',
    '  - python manage.py runserver 0.0.0.0:$PORT',
    '  - bundle exec rails s -p $PORT',
    '  - gulp serve',
    '',
    'FORMATO DE RESPUESTA (estricto):',
    'Terminá tu respuesta con el comando envuelto en tags <cmd>...</cmd> y NADA después.',
    'Adentro de los tags: una sola línea, sin code fences, sin comillas envolventes.',
    'Ejemplos válidos:',
    '<cmd>npm run dev</cmd>',
    '<cmd>./mvnw spring-boot:run -Dserver.port=$PORT</cmd>',
    '<cmd>gulp serve</cmd>',
    'NUNCA hardcodees un número de puerto — siempre $PORT o env.',
    'Si el repo no tiene un dev server detectable, devolvé exactamente <cmd>NO_DEV_SERVER</cmd>.',
  ].join('\n');

  // OJO: `--allowedTools <tools...>` es variadic en commander.js → consume todos
  // los args que le sigan, incluido el prompt si lo ponemos posicional.
  // Solución: pasamos el prompt por stdin.
  const r = spawnSync(config.claudeCliPath, [
    '-p',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Write,Edit,MultiEdit,Grep,Glob,Bash',
  ], {
    cwd: workspace,
    timeout: 120_000,
    encoding: 'utf-8',
    env: buildSafeEnv(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
    input: prompt,
  });
  if (r.status !== 0) {
    return { ok: false, command: '', error: (r.stderr || 'claude -p falló').slice(0, 400) };
  }
  const cmd = extractCommand(r.stdout || '');
  if (!cmd || /^NO_DEV_SERVER$/i.test(cmd)) {
    return { ok: false, command: '', error: 'No se detectó un dev server en el proyecto.' };
  }
  return { ok: true, command: cmd };
}

// Extrae el comando del output de Claude. Tolerante a prosa: prefiere
// <cmd>…</cmd>, después code fences, después la última línea que arranca con
// un prefijo de comando shell conocido.
function extractCommand(raw: string): string {
  const text = raw.trim();
  const tagMatch = /<cmd>([\s\S]*?)<\/cmd>/i.exec(text);
  if (tagMatch && tagMatch[1]) {
    return tagMatch[1].trim().replace(/\s+/g, ' ');
  }
  const fenceMatch = /```(?:\w+)?\n([\s\S]*?)```/.exec(text);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim().split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')).join(' ');
  }
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const cmdPrefixRe = /^(npm|npx|pnpm|yarn|bun|gulp|grunt|vite|webpack|next|nuxt|nest|rails|bundle|python|python3|flask|django|uvicorn|gunicorn|node|deno|tsx|ts-node|cargo|go|java|mvn|gradle|\.\/?[\w./-]+)\b/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (cmdPrefixRe.test(lines[i]!)) return lines[i]!;
  }
  return lines[lines.length - 1] ?? '';
}

const READY_RE = /(?:Local:\s+https?:\/\/[^\s]+|listening on|server (?:running|started|on)|ready in \d+|started server on|now available on|webpack compiled successfully|compiled successfully|Server is running|\bnext-server\b|\bvite\s+v.+ready\b|Started \w+ in [\d.]+\s*(seconds|s)|tomcat started on port|\[Browsersync\]|browser-sync.+access urls|external:\s+https?:\/\/[^\s]+)/i;

// Patrones que indican que el spawn intentó bindear un puerto ya en uso.
// Cubrimos Node EADDRINUSE, Browser-sync, Spring Boot, Webpack, gulp, Python, etc.
const PORT_CONFLICT_RE = /(EADDRINUSE|address already in use|port \d+ is already in use|port \d+ already in use|port already in use|Could not start the server|cannot bind to port|web server failed to start)/i;

const MAX_RETRIES = 2;

/** Le pide a Claude que parchee los configs hardcoded para usar process.env.PORT. */
function repairPortHardcode(workspace: string, prevCommand: string, observedOutput: string): { ok: boolean; command: string; error?: string } {
  const prompt = [
    'El último spawn del dev server falló porque alguna config tiene un puerto hardcoded que está siendo usado por otra instancia.',
    `Comando que se ejecutó: ${prevCommand}`,
    '',
    'Output relevante (últimos chars):',
    observedOutput.slice(-3500),
    '',
    'TU TAREA:',
    '1. Encontrá el archivo de config que define el puerto (gulpfile.js, webpack.config.js, server.js, vite.config, application.properties, etc.).',
    '2. EDITALO para que lea process.env.PORT (o equivalente). Ejemplos:',
    '   - JS: `port: process.env.PORT || 9000`',
    '   - properties: `server.port=${PORT:8080}`',
    '   - Si hay múltiples puertos (browser-sync + UI + Java), parcheá los que correspondan.',
    '3. Estamos en un git worktree aislado por agente. Los edits NO afectan al repo padre. Sé agresivo en hacer los cambios.',
    '4. Terminá tu respuesta con el comando envuelto en <cmd>...</cmd> y NADA después.',
    'Si el comando previo es correcto, devolvelo igual: <cmd>' + prevCommand + '</cmd>',
  ].join('\n');

  const r = spawnSync(config.claudeCliPath, [
    '-p',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Write,Edit,MultiEdit,Grep,Glob,Bash',
  ], {
    cwd: workspace,
    timeout: 180_000,
    encoding: 'utf-8',
    env: buildSafeEnv(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
    input: prompt,
  });
  if (r.status !== 0) {
    return { ok: false, command: prevCommand, error: (r.stderr || '').slice(0, 400) };
  }
  const cmd = extractCommand(r.stdout || '');
  return { ok: true, command: cmd || prevCommand };
}

async function retryWithNewPort(s: Session) {
  if (s.retries >= MAX_RETRIES) return;
  s.retries += 1;

  // 1) Matar el grupo entero y liberar el puerto antes de reintentar.
  await ensurePortFree(s.port, s.pgid);
  s.proc = null;
  s.pgid = null;

  // 2) Pedir a Claude que parchee los configs con el contexto del fallo.
  appendOutput(s, `\n[eco] Puerto en conflicto detectado. Pidiendo a Claude que parchee configs (intento ${s.retries}/${MAX_RETRIES})…\n`);
  broadcastStatus(s);
  const repair = repairPortHardcode(s.workspace, s.command, s.output);
  if (repair.ok) s.command = repair.command;

  // 3) Asignar nuevo puerto libre.
  try {
    const newPort = await findFreePort();
    s.port = newPort;
    s.url = `http://127.0.0.1:${newPort}`;
    appendOutput(s, `[eco] Reintentando con puerto ${newPort}: ${s.command}\n`);
  } catch {
    appendOutput(s, '[eco] No se pudo asignar nuevo puerto.\n');
    s.status = 'error';
    broadcastStatus(s);
    return;
  }

  spawnSession(s);
}

/** Devuelve el path absoluto del repo padre si `workspace` es un git worktree, o el mismo workspace si es el repo principal. */
function parentRepoOf(workspace: string): string {
  const r = spawnSync('git', ['-C', workspace, 'rev-parse', '--git-common-dir'], { encoding: 'utf-8', timeout: 3000 });
  if (r.status !== 0 || !r.stdout) return workspace;
  const commonDir = r.stdout.trim();
  const absCommon = commonDir.startsWith('/') ? commonDir : join(workspace, commonDir);
  // `--git-common-dir` devuelve el path del `.git` (dir o file) del repo principal.
  // El working dir del repo padre es el que CONTIENE ese .git → dirname.
  // Si commonDir ya termina en /.git, dirname devuelve el repo.
  // Ej: "/Users/x/aditum-jh/.git" → "/Users/x/aditum-jh"
  return dirname(absCommon);
}

/** Symlinkea node_modules (y vendor, .venv) desde el padre al worktree si el worktree
 * no tiene esos dirs. Permite usar gulp/vite/etc. instalados localmente en el padre
 * sin tener que `npm install` en cada worktree. */
function symlinkInstallDirsFromParent(workspace: string) {
  const parent = parentRepoOf(workspace);
  if (parent === workspace) return; // no es worktree
  const candidates = ['node_modules', 'vendor', '.venv', 'venv', 'target/dependency'];
  for (const name of candidates) {
    const src = join(parent, name);
    const dst = join(workspace, name);
    if (!existsSync(src)) continue;
    // Si ya existe en el worktree (sea symlink o real), no tocamos.
    let dstExists = false;
    try { dstExists = !!lstatSync(dst); } catch { /* ENOENT */ }
    if (dstExists) continue;
    try { symlinkSync(src, dst, 'dir'); } catch { /* race / perms */ }
  }
}

/** Devuelve los node_modules/.bin a prependear al PATH (worktree primero, padre segundo). */
function discoverNodeBins(workspace: string): string[] {
  const bins: string[] = [];
  const own = join(workspace, 'node_modules', '.bin');
  if (existsSync(own)) bins.push(own);
  const parent = parentRepoOf(workspace);
  if (parent && parent !== workspace) {
    const parentBin = join(parent, 'node_modules', '.bin');
    if (existsSync(parentBin) && !bins.includes(parentBin)) bins.push(parentBin);
  }
  return bins;
}

function spawnSession(s: Session) {
  s.status = 'starting';
  s.output = '';
  s.startedAt = Date.now();
  s.exitCode = null;
  s.exitedAt = null;
  broadcastStatus(s);

  // Si el worktree no tiene node_modules/.venv/vendor, symlinkeamos desde el
  // repo padre. Así gulp serve, npm run dev, bundle exec, etc. funcionan sin
  // hacer npm install / pip install / bundle install en cada worktree.
  symlinkInstallDirsFromParent(s.workspace);

  // node_modules/.bin del worktree y del repo padre — para que gulp/vite/etc.
  // instalados localmente en el repo padre funcionen sin npm install acá.
  const extraBins = discoverNodeBins(s.workspace);
  const basePath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
  const augmentedPath = [...extraBins, basePath].join(':');

  const env = buildSafeEnv({
    PATH: augmentedPath,
    PORT: String(s.port),
    // Cobertura amplia: distintos frameworks usan distintos nombres de env.
    VITE_PORT: String(s.port),
    NEXT_PUBLIC_PORT: String(s.port),
    SERVER_PORT: String(s.port),        // Spring Boot, etc.
    HTTP_PORT: String(s.port),
    BROWSER_SYNC_PORT: String(s.port),  // gulp + browser-sync
    GULP_PORT: String(s.port),
    WEBPACK_DEV_SERVER_PORT: String(s.port),
    BROWSER: 'none',                    // CRA: que NO abra Chrome
    HOST: '127.0.0.1',
    // Java/Spring (también respeta -Dserver.port en CLI):
    JAVA_TOOL_OPTIONS: `-Dserver.port=${s.port}`,
  }) as Record<string, string>;

  // bash -c (sin -l) para que NO re-source .bash_profile/.zshrc, que podrían
  // pisar nuestro PATH augmentado con el node_modules/.bin del repo padre.
  // El PATH que pasamos en env ya incluye todo lo necesario (nvm, brew, locales).
  //
  // `detached: true` crea un nuevo process group con pgid = proc.pid. Esto
  // permite matar el grupo ENTERO (padre bash + todos sus hijos) con un solo
  // `process.kill(-pgid, …)` cuando se hace stop. Sin esto, kill al bash deja
  // a gulp/vite/java huérfanos con el puerto tomado.
  const proc = spawn('/bin/bash', ['-c', s.command], {
    cwd: s.workspace,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  // Importante: NO desreferenciar (proc.unref()) — queremos que Node mantenga
  // el handle. La diferencia con un spawn no-detached es el pgid.
  s.proc = proc;
  s.pgid = typeof proc.pid === 'number' ? proc.pid : null;

  let conflictTriggered = false;
  const onData = (data: Buffer) => {
    const text = data.toString('utf-8');
    appendOutput(s, text);
    if (s.status === 'starting' && READY_RE.test(text)) {
      s.status = 'running';
      broadcastStatus(s);
      return;
    }
    // Conflicto de puerto detectado en starting → auto-retry una vez con
    // nuevo puerto + edits via Claude.
    if (!conflictTriggered && (s.status === 'starting' || s.status === 'running') && PORT_CONFLICT_RE.test(text)) {
      conflictTriggered = true;
      void retryWithNewPort(s);
    }
  };
  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);

  proc.on('exit', (code, signal) => {
    s.exitCode = code ?? (signal ? -1 : 0);
    s.exitedAt = Date.now();
    s.proc = null;
    s.pgid = null;
    // Si nunca llegó a "running" y se cae rápido, lo marcamos error.
    s.status = (s.status === 'running' || code === 0) ? 'stopped' : 'error';
    broadcastStatus(s);
  });
  proc.on('error', (err) => {
    appendOutput(s, `\n[spawn error] ${err.message}\n`);
    s.status = 'error';
    s.exitedAt = Date.now();
    s.proc = null;
    s.pgid = null;
    broadcastStatus(s);
  });
}

export type StartResult = { ok: true; command: string; port: number; url: string } | { ok: false; error: string };

export async function startDevServer(
  bubbleId: string,
  workspace: string,
  command?: string,
): Promise<StartResult> {
  if (!bubbleId || !workspace) return { ok: false, error: 'bubbleId y workspace requeridos' };
  const existing = sessions.get(bubbleId);
  if (existing && existing.proc) return { ok: false, error: 'Ya hay un server corriendo para este agente' };

  let port: number;
  try { port = await findFreePort(); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo asignar puerto' }; }

  let cmd = command?.trim();
  if (!cmd) {
    const suggest = suggestDevCommand(workspace);
    if (!suggest.ok) return { ok: false, error: suggest.error || 'No se pudo inferir el comando' };
    cmd = suggest.command;
  }

  const s: Session = existing ?? {
    bubbleId, workspace, command: cmd, port,
    url: `http://127.0.0.1:${port}`,
    proc: null, pgid: null, status: 'idle', output: '',
    startedAt: null, exitCode: null, exitedAt: null,
    retries: 0,
  };
  s.command = cmd;
  s.port = port;
  s.url = `http://127.0.0.1:${port}`;
  // Reseteamos el contador de retries en cada start manual del usuario.
  s.retries = 0;
  sessions.set(bubbleId, s);

  spawnSession(s);
  return { ok: true, command: cmd, port, url: s.url };
}

/**
 * Detiene el server y **garantiza** que el puerto quede libre.
 * Estrategia:
 *  1. SIGTERM al process GROUP entero (mata padre + todos los hijos)
 *  2. Polling de 2.5s — si el puerto se libera, hecho
 *  3. SIGKILL al grupo + a cualquier PID que siga bindeando el puerto
 *  4. Polling de 2.5s más
 *  5. Si después de 5s sigue colgado, devolvemos error con los PIDs supervivientes
 *     para que el user los pueda inspeccionar manualmente.
 */
export async function stopDevServer(bubbleId: string): Promise<{ ok: boolean; error?: string }> {
  const s = sessions.get(bubbleId);
  if (!s) return { ok: false, error: 'Sesión no existe' };
  if (!s.proc && pidsHoldingPort(s.port).length === 0) {
    s.status = 'stopped';
    broadcastStatus(s);
    return { ok: true };
  }

  const pgid = s.pgid;
  const port = s.port;
  appendOutput(s, `\n[eco] Deteniendo server (pgid=${pgid ?? '?'}, port=${port})…\n`);

  const r = await ensurePortFree(port, pgid);
  // Resetear estado (los listeners de proc.on('exit') ya limpiaron proc/pgid).
  if (r.ok) {
    s.status = 'stopped';
    s.proc = null;
    s.pgid = null;
    appendOutput(s, `[eco] Server detenido. Puerto ${port} libre.\n`);
    broadcastStatus(s);
    return { ok: true };
  }
  // Puerto sigue colgado — devolvemos error explícito con los PIDs.
  const msg = `Puerto ${port} sigue ocupado por PIDs: ${r.pids.join(', ')}. Inspeccioná con \`lsof -i :${port}\`.`;
  appendOutput(s, `[eco] ${msg}\n`);
  s.status = 'error';
  broadcastStatus(s);
  return { ok: false, error: msg };
}

export async function restartDevServer(bubbleId: string): Promise<StartResult> {
  const s = sessions.get(bubbleId);
  if (!s) return { ok: false, error: 'Sesión no existe' };
  // Stop completo antes de start — garantiza que el puerto está libre.
  if (s.proc || pidsHoldingPort(s.port).length > 0) {
    const stopRes = await stopDevServer(bubbleId);
    if (!stopRes.ok) return { ok: false, error: `No pude liberar el puerto: ${stopRes.error}` };
  }
  return startDevServer(bubbleId, s.workspace, s.command);
}

export function devStatus(bubbleId: string): Session | null {
  const s = sessions.get(bubbleId);
  if (!s) return null;
  return s;
}

export function devLogs(bubbleId: string): string {
  return sessions.get(bubbleId)?.output ?? '';
}

// ─── Skill-managed dev server ─────────────────────────────────────────────
// El usuario elige un skill de Claude (ej. /dev-up) que ya sabe cómo levantar/
// detener su stack. Eco invoca `claude -p` con la slash command + acción, y
// parsea el output para sacar la URL del frontend.

const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?(?:\/[^\s)"']*)?/gi;

// Para skills que imprimen MÚLTIPLES URLs (backend + frontend), elegimos la
// del frontend usando scoring por contexto. Preferencias:
//   + keywords "frontend|ui|browser-sync|gulp|vite|next|dev server|Local:" cerca de la URL
//   + puertos típicos de frontend (9000, 5173, 3000, 4200, 8081)
//   − keywords "backend|api|java|spring|tomcat|server.port"
//   − puertos típicos de backend (8080, 8000, 3001)
//   + más tarde en el output (los frontends suelen reportarse después)
// Regex auxiliar: matchea puertos bare como ":9000", "puerto 9000", "PID 123 en :9000", etc.
// Lo usamos cuando el skill no imprime URLs completas.
const BARE_PORT_RE = /(?:\b(?:port|puerto|en|on|listening|listen|server|frontend|backend|gulp|browser-sync|vite|webpack)[\s:]+:?(\d{2,5})|\B:(\d{2,5})\b)/gi;

function pickFrontendUrl(text: string): { url: string; port: number } {
  const lines = text.split('\n');
  type Hit = { url: string; port: number; score: number };
  const hits: Hit[] = [];

  // Pasada 1: URLs completas http://localhost:NNNN
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const re = new RegExp(URL_RE.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const url = m[0];
      const port = m[1] ? Number(m[1]) : 0;
      const ctx = `${lines[i - 1] ?? ''} ${line} ${lines[i + 1] ?? ''}`.toLowerCase();
      let score = 0;
      // Positivos: frontend signals
      if (/\bfront(?:end)?\b/.test(ctx)) score += 100;
      if (/browser[-_ ]?sync/.test(ctx)) score += 90;
      if (/\bgulp\b/.test(ctx)) score += 80;
      if (/\bvite\b/.test(ctx)) score += 80;
      if (/\bnext(?:\.js)?\b/.test(ctx)) score += 60;
      if (/\bdev\s*server\b/.test(ctx)) score += 40;
      if (/\bui\b/.test(ctx)) score += 30;
      if (/\bclient\b/.test(ctx)) score += 30;
      if (/local:\s*$/i.test(lines[i - 1] ?? '') || /^\s*local:/i.test(line)) score += 40;
      // Negativos: backend signals
      if (/\bbackend\b/.test(ctx)) score -= 100;
      if (/\bspring(?:\s*boot)?\b/.test(ctx)) score -= 80;
      if (/\bapi\b/.test(ctx)) score -= 30;
      if (/\bjava\b/.test(ctx)) score -= 50;
      if (/\btomcat\b/.test(ctx)) score -= 80;
      if (/server\.port\b/.test(ctx)) score -= 30;
      // Heurística por puerto típico
      const frontendPorts = new Set([9000, 5173, 5174, 3000, 4200, 8081, 8888]);
      const backendPorts = new Set([8080, 8000, 8443, 3001, 5000, 5432, 6379]);
      if (frontendPorts.has(port)) score += 25;
      if (backendPorts.has(port)) score -= 30;
      // Más tarde en el output → más probable frontend (suelen aparecer después)
      score += i * 0.4;
      hits.push({ url, port, score });
    }
  }
  // Pasada 2: si no encontramos URLs completas, buscamos puertos bare ":9000",
  // "puerto 9000", "PID X en :9000", etc., y sintetizamos http://localhost:NNNN.
  // Esto es útil cuando el skill imprime "frontend en :9000" sin el http://.
  if (hits.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const re = new RegExp(BARE_PORT_RE.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const portStr = m[1] || m[2];
        if (!portStr) continue;
        const port = Number(portStr);
        if (!port || port < 80 || port > 65535) continue;
        const url = `http://localhost:${port}`;
        const ctx = `${lines[i - 1] ?? ''} ${line} ${lines[i + 1] ?? ''}`.toLowerCase();
        let score = 0;
        if (/\bfront(?:end)?\b/.test(ctx)) score += 100;
        if (/browser[-_ ]?sync/.test(ctx)) score += 90;
        if (/\bgulp\b/.test(ctx)) score += 80;
        if (/\bvite\b/.test(ctx)) score += 80;
        if (/\bnext(?:\.js)?\b/.test(ctx)) score += 60;
        if (/\bui\b/.test(ctx)) score += 30;
        if (/\bbackend\b/.test(ctx)) score -= 100;
        if (/\bspring(?:\s*boot)?\b/.test(ctx)) score -= 80;
        if (/\bapi\b/.test(ctx)) score -= 30;
        if (/\bjava\b/.test(ctx)) score -= 50;
        if (/\btomcat\b/.test(ctx)) score -= 80;
        const frontendPorts = new Set([9000, 5173, 5174, 3000, 4200, 8081, 8888]);
        const backendPorts = new Set([8080, 8000, 8443, 3001, 5000, 5432, 6379]);
        if (frontendPorts.has(port)) score += 25;
        if (backendPorts.has(port)) score -= 30;
        score += i * 0.4;
        hits.push({ url, port, score });
      }
    }
  }

  if (hits.length === 0) return { url: '', port: 0 };
  hits.sort((a, b) => b.score - a.score);
  return { url: hits[0]!.url, port: hits[0]!.port };
}

export type SkillActionResult =
  | { ok: true; output: string; url: string; port: number }
  | { ok: false; error: string; output?: string };

// Cache de proc activos de skills por bubbleId (para poder matarlos si el user
// re-clickea Detener mientras una invocación previa está en curso).
const skillProcs = new Map<string, ChildProcess>();

/** Timeouts por acción. `down` no debería tardar mucho — si tarda, matamos. */
const SKILL_TIMEOUTS: Record<'up' | 'down' | 'restart' | 'status', number> = {
  up: 300_000,        // 5 min para arrancar
  down: 60_000,       // 60s para detener (si tarda más, matamos)
  restart: 300_000,
  status: 30_000,
};

export async function runSkillAction(
  bubbleId: string,
  workspace: string,
  skill: string,
  action: 'up' | 'down' | 'restart' | 'status',
): Promise<SkillActionResult> {
  if (!bubbleId || !workspace || !skill) return { ok: false, error: 'bubbleId, workspace y skill requeridos' };

  // Recuperamos o creamos la session.
  let existing = sessions.get(bubbleId);
  if (!existing) {
    existing = {
      bubbleId, workspace, command: `/${skill} ${action}`, port: 0, url: '',
      proc: null, pgid: null, status: 'idle', output: '',
      startedAt: null, exitCode: null, exitedAt: null,
      retries: 0, skill,
    };
    sessions.set(bubbleId, existing);
  }
  const s: Session = existing;
  s.skill = skill;
  s.command = `/${skill} ${action}`;

  // Si hay un proc previo de skill corriendo, lo matamos para no encolar.
  const prevProc = skillProcs.get(bubbleId);
  if (prevProc && !prevProc.killed) {
    try { prevProc.kill('SIGTERM'); } catch { /* noop */ }
    setTimeout(() => { try { prevProc.kill('SIGKILL'); } catch { /* noop */ } }, 2000);
  }

  if (action === 'up' || action === 'restart') {
    try { symlinkInstallDirsFromParent(workspace); } catch { /* noop */ }
  }

  // Status visual durante la ejecución (stopping para down, starting para up/restart).
  s.status = action === 'down' ? 'stopped' : 'starting';
  appendOutput(s, `\n[eco] /${skill} ${action}\n`);
  broadcastStatus(s);

  // Hint al final del slash command: estamos en modo no-interactivo. Si el skill
  // intenta preguntar (AskUserQuestion), claude -p lo trata como cancelado y el
  // user ve "Cancelaste la pregunta" sin haber hecho nada. Le decimos que asuma
  // la acción más útil cuando esté en duda.
  const nonInteractiveHint = (
    '\n\n(Modo no-interactivo de Eco: no pidas confirmación. ' +
    'Si los servers ya están corriendo cuando te piden `up`, hacé `restart` directo. ' +
    'Reportá las URLs completas como http://localhost:PORT para que Eco las parsee.)'
  );
  const prompt = `/${skill} ${action}${nonInteractiveHint}`;
  return new Promise<SkillActionResult>((resolve) => {
    const proc = spawn(config.claudeCliPath, [
      '-p',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Bash,Read,Write,Edit,MultiEdit,Grep,Glob',
    ], {
      cwd: workspace,
      env: buildSafeEnv(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    skillProcs.set(bubbleId, proc);
    proc.stdin?.write(prompt);
    proc.stdin?.end();

    let stdout = '';
    let stderr = '';
    let resolved = false;
    proc.stdout?.on('data', (c: Buffer) => {
      const chunk = c.toString('utf-8');
      stdout += chunk;
      appendOutput(s!, chunk);
    });
    proc.stderr?.on('data', (c: Buffer) => {
      const chunk = c.toString('utf-8');
      stderr += chunk;
      appendOutput(s!, chunk);
    });

    const timeoutMs = SKILL_TIMEOUTS[action];
    const killTimer = setTimeout(() => {
      if (resolved) return;
      appendOutput(s!, `\n[eco] timeout: ${action} tardó más de ${Math.round(timeoutMs / 1000)}s, forzando kill.\n`);
      try { proc.kill('SIGTERM'); } catch { /* noop */ }
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* noop */ } }, 2000);
    }, timeoutMs);

    const finalize = (success: boolean, errMsg?: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(killTimer);
      skillProcs.delete(bubbleId);

      // Elegir URL del frontend del output capturado.
      const blob = stdout + '\n' + stderr;
      const picked = pickFrontendUrl(blob);

      if (!success) {
        s!.status = 'error';
        s!.exitedAt = Date.now();
        broadcastStatus(s!);
        resolve({ ok: false, error: errMsg || (stderr || 'claude -p falló').slice(0, 600), output: stdout });
        return;
      }

      if (action === 'up' || action === 'restart') {
        if (picked.url) {
          s!.status = 'running';
          s!.url = picked.url;
          s!.port = picked.port;
          s!.startedAt = Date.now();
        } else {
          s!.status = 'starting';
        }
      } else if (action === 'down') {
        s!.status = 'stopped';
        s!.url = '';
        s!.port = 0;
        s!.exitedAt = Date.now();
      } else if (action === 'status') {
        if (picked.url) {
          s!.status = 'running';
          s!.url = picked.url;
          s!.port = picked.port;
        }
      }
      broadcastStatus(s!);
      resolve({ ok: true, output: stdout, url: picked.url, port: picked.port });
    };

    proc.on('close', (code, signal) => {
      // Si lo matamos por timeout en `down`, igual reportamos `down` como exitoso
      // — para `down` lo importante es que el user vea el estado "stopped".
      if (action === 'down' && signal) {
        finalize(true);
      } else {
        finalize(code === 0, code !== 0 ? `Exit code ${code}${signal ? ` (${signal})` : ''}` : undefined);
      }
    });
    proc.on('error', (err) => finalize(false, err.message));
  });
}

/** Devuelve el skill guardado para una burbuja, si lo hay. */
export function getDevSkill(bubbleId: string): string | null {
  return sessions.get(bubbleId)?.skill ?? null;
}

export function killAllDevServers() {
  for (const s of sessions.values()) {
    try { s.proc?.kill('SIGTERM'); } catch { /* noop */ }
  }
}

// Snapshot al conectar al WS: clientes nuevos reciben el estado de cada server.
registerSnapshotProvider(() => {
  const out: Array<{
    type: 'dev_status';
    bubbleId: string;
    status: DevStatus;
    port: number;
    url: string;
    command: string;
    exitCode: number | null;
    skill?: string;
  }> = [];
  for (const s of sessions.values()) {
    out.push({
      type: 'dev_status' as const,
      bubbleId: s.bubbleId,
      status: s.status,
      port: s.port,
      url: s.url,
      command: s.command,
      exitCode: s.exitCode,
      ...(s.skill ? { skill: s.skill } : {}),
    });
  }
  return out;
});

